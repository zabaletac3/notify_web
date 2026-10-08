import { attempt } from '#lib/core/index.js';
import {
	CryptoFormatError,
	DecryptError,
	DEFAULT_KDF,
	deriveFromPassword,
	unwrap
} from '#lib/core/crypto/index.js';
import {
	changePasswordKeys,
	createAccountKeys,
	deriveAuthKey,
	masterKeyAad,
	recoverWithRecoveryKey,
	rotateRecoveryKeys,
	unlockWithPassword,
	type AuthRepository,
	type KdfBase
} from '#lib/data/index.js';
import { VaultState } from '#lib/features/vault/index.js';
import {
	fail,
	succeed,
	validateChangePassword,
	validateEmail,
	validateEmailChange,
	validateLogin,
	validatePasswordReset,
	validateProfileName,
	validateRegister,
	validateVerificationCode,
	type ActionResult,
	type AppError,
	type AuthStatus,
	type KeyBundle,
	type LoginInput,
	type RegisterInput,
	type Validation,
	type User
} from '#lib/domain/index.js';

/** Intentos fallidos de desbloqueo antes de cerrar la sesión. */
export const MAX_UNLOCK_ATTEMPTS = 5;

/** Cómo se restablece la contraseña desde el enlace del correo. */
export type PasswordResetChoice =
	{ mode: 'keep'; recoveryKey: string } | { mode: 'wipe'; confirmed: boolean };

/** Segundos que hay que esperar para pedir otro código de verificación. */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Sesión y flujos de cuenta: registro → verificación → inicio de sesión → recuperación.
 * Cada acción valida en el cliente, llama al repositorio y devuelve `ActionResult` (nunca lanza).
 * Los errores por campo quedan en `fieldErrors` (códigos; el texto sale de `validationMessage`).
 */
export class AuthState {
	status = $state<AuthStatus>('unknown');
	user = $state<User | null>(null);
	busy = $state(false);
	/** Error general de la última acción. */
	error = $state<AppError | null>(null);
	/** Códigos de validación por campo de la última acción. */
	fieldErrors = $state<Record<string, string>>({});

	/** Correo pendiente de verificar (entre "registro" y "verificación"). */
	pendingEmail = $state<string | null>(null);
	/** Correo nuevo que espera el código de confirmación (cambio de correo en Mi cuenta). */
	pendingEmailChange = $state<string | null>(null);
	/** Instante (ms) desde el que se puede reenviar el código. */
	resendAvailableAt = $state(0);
	/** Por qué se cerró la sesión sin que la persona lo pidiera (la pantalla de inicio lo explica). */
	notice = $state<'device-revoked' | 'signed-out-elsewhere' | null>(null);
	/** `true` cuando ya se pidió el enlace de recuperación. */
	resetRequested = $state(false);
	/** Clave de recuperación recién creada, pendiente de mostrar. Se enseña una sola vez. */
	pendingRecoveryKey = $state<string | null>(null);
	/** Intentos fallidos seguidos de desbloquear la app. */
	unlockFailures = $state(0);

	private readonly repo: AuthRepository;
	private readonly clock: () => Date;
	private readonly onSignedOut: () => void | Promise<void>;
	private readonly vault: VaultState;
	private readonly kdf: KdfBase;
	private readonly rememberDevice: () => boolean;
	private readonly restoreVault: (userId: string) => Promise<boolean>;
	/** Claves cifradas de la cuenta (no son secretas). Se piden al servidor si hace falta. */
	private keyBundle: KeyBundle | null = null;
	/** Claves de una cuenta recién creada, a la espera de verificar el correo. */
	private pendingSetup: { userId: string; masterKey: CryptoKey; recoveryKey: string } | null = null;
	/** Clave de recuperación de una cuenta reiniciada: se muestra al iniciar sesión. */
	private deferredRecovery: { userId: string; recoveryKey: string } | null = null;

	/**
	 * @param hooks.onSignedOut se llama al cerrar sesión o borrar la cuenta (para limpiar la copia local)
	 * @param hooks.vault cofre de claves (se desbloquea al iniciar sesión)
	 * @param hooks.kdf parámetros de Argon2id para las cuentas y contraseñas nuevas
	 * @param hooks.rememberDevice si la clave maestra se recuerda cifrada en este dispositivo
	 * @param hooks.restoreVault intenta desbloquear al arrancar sin pedir la contraseña
	 */
	constructor(
		repo: AuthRepository,
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- fábrica del reloj, no es estado
		clock: () => Date = () => new Date(),
		hooks: {
			onSignedOut?: () => void | Promise<void>;
			vault?: VaultState;
			kdf?: KdfBase;
			rememberDevice?: () => boolean;
			restoreVault?: (userId: string) => Promise<boolean>;
		} = {}
	) {
		this.repo = repo;
		this.clock = clock;
		this.onSignedOut = hooks.onSignedOut ?? (() => {});
		this.vault = hooks.vault ?? new VaultState();
		this.kdf = hooks.kdf ?? DEFAULT_KDF;
		this.rememberDevice = hooks.rememberDevice ?? (() => false);
		this.restoreVault = hooks.restoreVault ?? ((userId) => this.vault.restore(userId));
	}

	isAuthenticated = $derived(this.status === 'authenticated');
	/** Hay sesión pero la app está bloqueada: falta la contraseña para leer las notas. */
	get isLocked(): boolean {
		return this.status === 'authenticated' && this.vault.status !== 'unlocked';
	}

	/** Segundos que faltan para poder reenviar el código (0 = ya se puede). */
	resendRemaining(): number {
		return Math.max(0, Math.ceil((this.resendAvailableAt - this.clock().getTime()) / 1000));
	}

	/** Si hay varios arranques a la vez, solo vale el último; los anteriores esperan a que termine. */
	private bootstrapRun = 0;
	private lastBootstrap: Promise<void> = Promise.resolve();

	bootstrap(): Promise<void> {
		const run = ++this.bootstrapRun;
		return (this.lastBootstrap = this.runBootstrap(run));
	}

	private async runBootstrap(run: number): Promise<void> {
		const result = await attempt(() => this.repo.currentSession());
		if (run !== this.bootstrapRun) return this.lastBootstrap;
		if (result.ok) {
			// Si la clave se recordó en este dispositivo, la app se abre sin pedir la contraseña.
			// Se intenta antes de dar la sesión por iniciada para que no parpadee la pantalla de bloqueo.
			if (result.value) {
				await this.restoreVault(result.value.user.id);
				if (run !== this.bootstrapRun) return this.lastBootstrap;
			}
			this.user = result.value?.user ?? null;
			this.status = result.value ? 'authenticated' : 'anonymous';
		} else if (result.error.kind === 'session-expired') {
			this.status = 'expired';
		} else if (result.error.kind === 'device-revoked') {
			await this.endSession('device-revoked');
		} else {
			this.status = 'anonymous';
		}
	}

	/** La capa de datos avisó de que la sesión venció (desde cualquier llamada remota). */
	markExpired() {
		if (this.status === 'authenticated') this.status = 'expired';
	}

	/**
	 * La sesión terminó sin que la persona lo pidiera: el dispositivo fue revocado desde otro, o se
	 * cerró sesión en otra pestaña. Limpia la copia local y deja la sesión cerrada.
	 */
	async endSession(reason: 'device-revoked' | 'signed-out-elsewhere') {
		this.forgetSession();
		this.notice = reason;
		await this.vault.signOut();
		await this.onSignedOut();
	}

	/** Olvida todo lo de la sesión que vive en memoria. */
	private forgetSession() {
		this.user = null;
		this.status = 'anonymous';
		this.keyBundle = null;
		this.pendingSetup = null;
		this.pendingRecoveryKey = null;
		this.unlockFailures = 0;
	}

	private requireUser(): User {
		if (!this.user) throw fail.sessionExpired();
		return this.user;
	}

	private async bundle(): Promise<KeyBundle> {
		return (this.keyBundle ??= await this.repo.keys());
	}

	clearErrors() {
		this.error = null;
		this.fieldErrors = {};
	}

	async register(input: RegisterInput): Promise<ActionResult> {
		return this.act(validateRegister(input), async () => {
			// Las claves se crean aquí: al servidor solo llegan pruebas derivadas y claves ya cifradas.
			const account = await createAccountKeys(input.password, this.kdf);
			const { email } = await this.repo.register({
				fullName: input.fullName,
				email: input.email,
				acceptedTerms: input.acceptedTerms,
				userId: account.userId,
				authKey: account.authKey,
				recoveryAuth: account.recoveryAuth,
				keys: account.keys
			});
			this.pendingSetup = {
				userId: account.userId,
				masterKey: account.masterKey,
				recoveryKey: account.recoveryKey
			};
			this.pendingEmail = email;
			this.startCooldown();
		});
	}

	async verify(code: string): Promise<ActionResult> {
		const email = this.pendingEmail;
		if (!email) return this.reject({ kind: 'not-found', entity: 'pending-email' });
		return this.act(validateVerificationCode(code), async () => {
			const user = await this.repo.verifyEmail(email, code);
			const setup = this.pendingSetup;
			if (setup && setup.userId === user.id) {
				// Recién registrado: la app queda desbloqueada y se enseña la clave de recuperación.
				this.pendingSetup = null;
				this.pendingRecoveryKey = setup.recoveryKey;
				await this.vault.unlock(user.id, setup.masterKey, this.rememberDevice());
			}
			this.user = user;
			this.status = 'authenticated';
			this.pendingEmail = null;
		});
	}

	async resendCode(): Promise<ActionResult> {
		const email = this.pendingEmail;
		if (!email) return this.reject({ kind: 'not-found', entity: 'pending-email' });
		if (this.resendRemaining() > 0) return this.reject({ kind: 'rate-limited' });
		return this.act({ valid: true }, async () => {
			await this.repo.resendVerificationCode(email);
			this.startCooldown();
		});
	}

	/**
	 * Inicia sesión. Si el correo no está verificado, deja `pendingEmail` listo para
	 * llevar al usuario a la pantalla de verificación.
	 */
	async login(input: LoginInput): Promise<ActionResult> {
		const result = await this.act(validateLogin(input), async () => {
			// La contraseña no sale de aquí: se deriva una prueba para el servidor y una clave local.
			const { kdf } = await this.repo.prelogin(input.email);
			const { authKey, kek } = await deriveFromPassword(input.password, kdf);
			const session = await this.repo.login({ email: input.email, authKey });
			let masterKey: CryptoKey;
			try {
				masterKey = await unwrap(
					kek,
					session.keys.wrappedMasterKey,
					masterKeyAad(session.user.id, 'password')
				);
			} catch {
				throw fail.decrypt();
			}
			this.keyBundle = session.keys;
			this.unlockFailures = 0;
			this.notice = null;
			await this.vault.unlock(session.user.id, masterKey, this.rememberDevice());
			if (this.deferredRecovery?.userId === session.user.id) {
				this.pendingRecoveryKey = this.deferredRecovery.recoveryKey;
				this.deferredRecovery = null;
			}
			this.user = session.user;
			this.status = 'authenticated';
		});
		if (
			!result.ok &&
			result.error.kind === 'forbidden' &&
			result.error.code === 'email-not-verified'
		) {
			this.pendingEmail = input.email.trim().toLowerCase();
		}
		return result;
	}

	/**
	 * Desbloquea la app con la contraseña (cuando la clave no se recordó en el dispositivo o se bloqueó
	 * por inactividad). Tras demasiados intentos fallidos cierra la sesión.
	 */
	async unlock(password: string): Promise<ActionResult> {
		const user = this.user;
		if (!user) return this.reject({ kind: 'session-expired' });
		const validation: Validation = password
			? { valid: true }
			: { valid: false, errors: { password: 'required' } };
		const result = await this.act(validation, async () => {
			const keys = await this.bundle();
			let masterKey: CryptoKey;
			try {
				({ masterKey } = await unlockWithPassword(password, user.id, keys));
			} catch (e) {
				if (e instanceof DecryptError) throw fail.validation({ password: 'wrong-password' });
				throw e;
			}
			this.unlockFailures = 0;
			await this.vault.unlock(user.id, masterKey, this.rememberDevice());
		});
		if (!result.ok && this.fieldErrors.password === 'wrong-password') {
			this.unlockFailures += 1;
			if (this.unlockFailures >= MAX_UNLOCK_ATTEMPTS) await this.logout();
		}
		return result;
	}

	async logout(): Promise<ActionResult> {
		return this.act({ valid: true }, async () => {
			// Primero se borra lo local: sin red también se puede salir (el token caduca solo).
			this.forgetSession();
			this.notice = null;
			await this.vault.signOut();
			await this.onSignedOut();
			try {
				await this.repo.logout();
			} catch {
				// Revocación pendiente: el servidor la hará al caducar el token.
			}
		});
	}

	async deleteAccount(): Promise<ActionResult> {
		return this.act({ valid: true }, async () => {
			await this.repo.deleteAccount();
			this.forgetSession();
			this.notice = null;
			await this.vault.signOut();
			await this.onSignedOut();
		});
	}

	async updateProfile(fullName: string): Promise<ActionResult> {
		return this.act(validateProfileName(fullName), async () => {
			this.user = await this.repo.updateProfile({ fullName });
		});
	}

	/** Paso 1 del cambio de correo: valida, pide la contraseña actual y manda el código al correo nuevo. */
	async requestEmailChange(newEmail: string, password: string): Promise<ActionResult> {
		return this.act(validateEmailChange(newEmail, password), async () => {
			const authKey = await deriveAuthKey(password, (await this.bundle()).kdf);
			const { email } = await this.repo.requestEmailChange(newEmail, authKey);
			this.pendingEmailChange = email;
		});
	}

	/** Paso 2: confirma el correo nuevo con el código recibido. */
	async confirmEmailChange(code: string): Promise<ActionResult> {
		const email = this.pendingEmailChange;
		if (!email) return this.reject({ kind: 'not-found', entity: 'email-change' });
		return this.act(validateVerificationCode(code), async () => {
			this.user = await this.repo.confirmEmailChange(email, code);
			this.pendingEmailChange = null;
		});
	}

	async changePassword(
		currentPassword: string,
		newPassword: string,
		confirmation: string
	): Promise<ActionResult> {
		return this.act(
			validateChangePassword(currentPassword, newPassword, confirmation),
			async () => {
				const user = this.requireUser();
				const current = await this.bundle();
				let change;
				try {
					change = await changePasswordKeys(
						currentPassword,
						newPassword,
						user.id,
						current,
						this.kdf
					);
				} catch (e) {
					if (e instanceof DecryptError)
						throw fail.validation({ currentPassword: 'wrong-password' });
					throw e;
				}
				// Las notas no se vuelven a cifrar: solo cambia el cifrado de la clave maestra.
				await this.repo.changePassword({
					currentAuthKey: change.currentAuthKey,
					newAuthKey: change.newAuthKey,
					keys: change.keys
				});
				this.keyBundle = change.keys;
			}
		);
	}

	/** Pide el enlace de recuperación. Siempre "funciona" para no revelar qué correos existen. */
	async forgotPassword(email: string): Promise<ActionResult> {
		return this.act(validateEmail(email), async () => {
			await this.repo.requestPasswordReset(email);
			this.resetRequested = true;
		});
	}

	/**
	 * Restablece la contraseña con el enlace del correo. Con la clave de recuperación se conservan las
	 * notas; sin ella hay que empezar de cero (se borran las notas del servidor).
	 */
	async resetPassword(
		token: string,
		password: string,
		confirmation: string,
		choice: PasswordResetChoice
	): Promise<ActionResult> {
		return this.act(validatePasswordReset(password, confirmation, choice), async () => {
			const bundle = await this.repo.passwordResetBundle(token);
			if (choice.mode === 'keep') {
				let recovered;
				try {
					recovered = await recoverWithRecoveryKey(
						choice.recoveryKey,
						password,
						bundle.userId,
						bundle,
						this.kdf
					);
				} catch (e) {
					if (e instanceof CryptoFormatError || e instanceof DecryptError)
						throw fail.validation({ recoveryKey: 'invalid-recovery-key' });
					throw e;
				}
				await this.repo.resetPassword({
					token,
					mode: 'keep',
					newAuthKey: recovered.newAuthKey,
					recoveryAuth: recovered.recoveryAuth,
					keys: recovered.keys
				});
			} else {
				const account = await createAccountKeys(password, this.kdf, bundle.userId);
				await this.repo.resetPassword({
					token,
					mode: 'wipe',
					newAuthKey: account.authKey,
					recoveryAuth: account.recoveryAuth,
					keys: account.keys
				});
				// La clave de recuperación nueva se enseña al iniciar sesión.
				this.deferredRecovery = { userId: bundle.userId, recoveryKey: account.recoveryKey };
			}
		});
	}

	/** Crea una clave de recuperación nueva (la anterior deja de servir). Queda en `pendingRecoveryKey`. */
	async rotateRecoveryKey(password: string): Promise<ActionResult> {
		const validation: Validation = password
			? { valid: true }
			: { valid: false, errors: { password: 'required' } };
		return this.act(validation, async () => {
			const user = this.requireUser();
			const keys = await this.bundle();
			let rotated;
			try {
				rotated = await rotateRecoveryKeys(password, user.id, keys);
			} catch (e) {
				if (e instanceof DecryptError) throw fail.validation({ password: 'wrong-password' });
				throw e;
			}
			await this.repo.rotateRecoveryKey({
				authKey: rotated.authKey,
				recoveryAuth: rotated.recoveryAuth,
				recoveryWrappedMasterKey: rotated.recoveryWrappedMasterKey
			});
			this.keyBundle = {
				...keys,
				recoveryWrappedMasterKey: rotated.recoveryWrappedMasterKey,
				keysVersion: keys.keysVersion + 1
			};
			this.pendingRecoveryKey = rotated.recoveryKey;
		});
	}

	/** La persona ya guardó la clave de recuperación: se borra de la memoria. */
	acknowledgeRecoveryKey() {
		this.pendingRecoveryKey = null;
	}

	// ─── Internos ─────────────────────────────────────────────────────────────

	private startCooldown() {
		this.resendAvailableAt = this.clock().getTime() + RESEND_COOLDOWN_SECONDS * 1000;
	}

	private reject(error: AppError): ActionResult<never> {
		this.error = error;
		return { ok: false, error };
	}

	/** Valida → ejecuta → traduce el resultado. Centraliza `busy`, `error` y `fieldErrors`. */
	private async act(validation: Validation, action: () => Promise<void>): Promise<ActionResult> {
		this.clearErrors();
		if (!validation.valid) {
			this.fieldErrors = validation.errors;
			return this.reject({ kind: 'validation', fields: validation.errors });
		}
		this.busy = true;
		const result = await attempt(action);
		this.busy = false;
		if (result.ok) return succeed();
		if (result.error.kind === 'validation') this.fieldErrors = result.error.fields;
		this.error = result.error;
		return result;
	}
}
