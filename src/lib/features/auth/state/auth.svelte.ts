import { attempt } from '#lib/core/index.js';
import { SvelteURLSearchParams } from 'svelte/reactivity';
import {
	CryptoFormatError,
	DecryptError,
	DEFAULT_KDF,
	deriveFromPassword,
	randomBytes,
	toB64u,
	unwrap,
	utf8
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
	type KdfBase,
	type TrustedDeviceRepository
} from '#lib/data/index.js';
import { VaultState } from '#lib/features/vault/index.js';
import {
	fail,
	succeed,
	validateChangePassword,
	validateEmail,
	validateEmailChange,
	validateLogin,
	validateMfaCode,
	validatePasswordReset,
	validateProfileName,
	validateRegister,
	validateVerificationCode,
	type ActionResult,
	type AppError,
	type AuthStatus,
	type GoogleOutcome,
	type KdfParams,
	type KeyBundle,
	type LoginInput,
	type LoginResult,
	type MfaChallenge,
	type PasswordResetBundle,
	type RegisterInput,
	type Validation,
	type User
} from '#lib/domain/index.js';

/** Intentos fallidos de desbloqueo antes de cerrar la sesión. */
export const MAX_UNLOCK_ATTEMPTS = 5;

/** Clave de `sessionStorage` donde se guarda el `verifier` de PKCE entre la ida y la vuelta de Google. */
export const GOOGLE_VERIFIER_KEY = 'axonote-google-verifier';

/** Borra el `#code=…`/`#error=…` de la barra de direcciones para que no quede en el historial. */
function clearUrlFragment() {
	if (typeof history === 'undefined' || typeof location === 'undefined') return;
	history.replaceState(history.state, '', location.pathname + location.search);
}

/** Recupera y borra el `verifier` de PKCE. Devuelve `null` si no hay almacenamiento o no está. */
function takeGoogleVerifier(): string | null {
	try {
		const verifier = sessionStorage.getItem(GOOGLE_VERIFIER_KEY);
		sessionStorage.removeItem(GOOGLE_VERIFIER_KEY);
		return verifier;
	} catch {
		return null;
	}
}

/** Cómo se restablece la contraseña desde el enlace del correo. */
export type PasswordResetChoice =
	| { mode: 'keep'; recoveryKey: string; disableMfa?: boolean }
	| { mode: 'wipe'; confirmed: boolean; mfaCode?: string };

/** Segundos que hay que esperar para pedir otro código de verificación. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Distingue el reto de segundo paso de una sesión en la respuesta de `login`. */
function isMfaChallenge(outcome: LoginResult | MfaChallenge): outcome is MfaChallenge {
	return (outcome as MfaChallenge).mfaRequired === true;
}

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
	notice = $state<'device-revoked' | 'signed-out-elsewhere' | 'mfa-expired' | null>(null);
	/** `true` cuando un login quedó a la espera del segundo paso (código MFA). */
	mfaPending = $state(false);
	/** `true` cuando ya se pidió el enlace de recuperación. */
	resetRequested = $state(false);
	/** Clave de recuperación recién creada, pendiente de mostrar. Se enseña una sola vez. */
	pendingRecoveryKey = $state<string | null>(null);
	/** Intentos fallidos seguidos de desbloquear la app. */
	unlockFailures = $state(0);

	// ─── Acceso con Google ─────────────────────────────────────────────────────
	/** `true` mientras se completa el retorno de Google (`/auth/google`). */
	googleProcessing = $state(false);
	/** Vinculación pendiente: ya existe una cuenta con ese correo y hay que escribir la contraseña. */
	googleLink = $state<{ linkToken: string; email: string; kdf: KdfParams } | null>(null);
	/** Registro pendiente: no existe cuenta y hay que crear la contraseña de AxoNote. */
	googleSignup = $state<{ signupToken: string; email: string; fullName: string } | null>(null);
	/** Error corto devuelto por el callback de Google en el fragmento (`#error=…`), si lo hubo. */
	googleCallbackError = $state<string | null>(null);
	/** Fallo al canjear el resultado de Google (traducido a texto por la pantalla). */
	googleError = $state<AppError | null>(null);
	/** La sesión actual se abrió con Google (la pantalla de desbloqueo lo explica). */
	signedInWithGoogle = $state(false);
	/** En este dispositivo hay confianza de Google (decide el diálogo de cierre de sesión). */
	trustedHere = $state(false);

	private readonly repo: AuthRepository;
	private readonly clock: () => Date;
	private readonly onSignedOut: (userId: string | null) => void | Promise<void>;
	private readonly onAccountDeleted: (userId: string) => void | Promise<void>;
	private readonly vault: VaultState;
	private readonly kdf: KdfBase;
	private readonly rememberDevice: () => boolean;
	private readonly beforeUnlock: (userId: string) => void | Promise<void>;
	private readonly restoreVault: (userId: string) => Promise<boolean>;
	/** Se llama al entrar con Google en un dispositivo por primera vez (S2: preferencias de bloqueo). */
	private readonly applyGooglePrefs: (userId: string) => void | Promise<void>;
	/** Dispositivos de confianza: la mitad que vive en el servidor. */
	private readonly trustedDevices: TrustedDeviceRepository;
	/** Nombre legible de este navegador para la lista de dispositivos de confianza. */
	private readonly deviceName: () => string;
	/** Marca/lee/borra la marca «en este dispositivo se entra con Google» (preferencias del dispositivo). */
	private readonly markTrustedDevice: (userId: string) => void;
	private readonly clearTrustedDevice: (userId: string) => void;
	private readonly readTrustedDevice: (userId: string) => boolean;
	/** Claves cifradas de la cuenta (no son secretas). Se piden al servidor si hace falta. */
	private keyBundle: KeyBundle | null = null;
	/** Claves de una cuenta recién creada, a la espera de verificar el correo. */
	private pendingSetup: { userId: string; masterKey: CryptoKey; recoveryKey: string } | null = null;
	/** Clave de recuperación de una cuenta reiniciada: se muestra al iniciar sesión. */
	private deferredRecovery: { userId: string; recoveryKey: string } | null = null;
	/**
	 * Login a la espera del segundo paso. La `kek` (derivada de la contraseña) se guarda **solo en
	 * memoria** para no repetir Argon2id ni volver a pedir la contraseña. Con login por Google (fase 5)
	 * llega sin `kek`. Se borra al terminar, al fallar el ticket y en `forgetSession()`.
	 */
	private pendingMfa: {
		token: string;
		kek: CryptoKey | null;
		expiresAt: string;
		google?: boolean;
	} | null = null;

	/**
	 * @param hooks.onSignedOut se llama al cerrar sesión o borrar la cuenta (para limpiar la copia local); recibe el `userId`
	 * @param hooks.onAccountDeleted se llama además al borrar la cuenta (para borrar las preferencias del dispositivo)
	 * @param hooks.vault cofre de claves (se desbloquea al iniciar sesión)
	 * @param hooks.kdf parámetros de Argon2id para las cuentas y contraseñas nuevas
	 * @param hooks.rememberDevice si la clave maestra se recuerda cifrada en este dispositivo
	 * @param hooks.beforeUnlock se llama justo antes de desbloquear el cofre, ya conocido el `userId`
	 * @param hooks.restoreVault intenta desbloquear al arrancar sin pedir la contraseña
	 */
	constructor(
		repo: AuthRepository,
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- fábrica del reloj, no es estado
		clock: () => Date = () => new Date(),
		hooks: {
			onSignedOut?: (userId: string | null) => void | Promise<void>;
			onAccountDeleted?: (userId: string) => void | Promise<void>;
			vault?: VaultState;
			kdf?: KdfBase;
			rememberDevice?: () => boolean;
			beforeUnlock?: (userId: string) => void | Promise<void>;
			restoreVault?: (userId: string) => Promise<boolean>;
			applyGooglePrefs?: (userId: string) => void | Promise<void>;
			trustedDevices?: TrustedDeviceRepository;
			deviceName?: () => string;
			markTrustedDevice?: (userId: string) => void;
			clearTrustedDevice?: (userId: string) => void;
			readTrustedDevice?: (userId: string) => boolean;
		} = {}
	) {
		this.repo = repo;
		this.clock = clock;
		this.onSignedOut = hooks.onSignedOut ?? (() => {});
		this.onAccountDeleted = hooks.onAccountDeleted ?? (() => {});
		this.vault = hooks.vault ?? new VaultState();
		this.kdf = hooks.kdf ?? DEFAULT_KDF;
		this.rememberDevice = hooks.rememberDevice ?? (() => false);
		this.beforeUnlock = hooks.beforeUnlock ?? (() => {});
		this.restoreVault = hooks.restoreVault ?? ((userId) => this.vault.restore(userId));
		this.applyGooglePrefs = hooks.applyGooglePrefs ?? (() => {});
		this.trustedDevices = hooks.trustedDevices ?? {
			list: async () => [],
			add: async () => {},
			get: async () => {
				throw fail.notFound('trusted-device');
			},
			remove: async () => {}
		};
		this.deviceName = hooks.deviceName ?? (() => 'Este navegador');
		this.markTrustedDevice = hooks.markTrustedDevice ?? (() => {});
		this.clearTrustedDevice = hooks.clearTrustedDevice ?? (() => {});
		this.readTrustedDevice = hooks.readTrustedDevice ?? (() => false);
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

	/**
	 * Arranque de la sesión. La lógica no depende del modo de sesión:
	 * - Hay marcador/cookie válidos (modo cookie) o tokens (modo cuerpo): el repositorio renueva si hace
	 *   falta y `currentSession()` devuelve la sesión → `authenticated`.
	 * - Hay marcador pero la cookie venció o el dispositivo fue revocado: `session-expired` → `expired`,
	 *   conservando la copia local cifrada (no se borra nada).
	 * - Sin red, `currentSession()` no lanza `session-expired` sino `network` → `anonymous` (igual que hoy).
	 * - La migración desde la web antigua solo borra `apunte.tokens`; no toca IndexedDB ni esta ruta.
	 */
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
			this.trustedHere = result.value ? this.readTrustedDevice(result.value.user.id) : false;
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
		const userId = this.user?.id ?? null;
		this.forgetSession();
		this.notice = reason;
		if (userId) this.clearTrusted(userId);
		await this.vault.signOut({ forgetTrust: true });
		await this.onSignedOut(userId);
	}

	/** Olvida todo lo de la sesión que vive en memoria. */
	private forgetSession() {
		this.user = null;
		this.status = 'anonymous';
		this.keyBundle = null;
		this.pendingSetup = null;
		this.pendingRecoveryKey = null;
		this.unlockFailures = 0;
		this.pendingMfa = null;
		this.mfaPending = false;
		this.googleProcessing = false;
		this.googleLink = null;
		this.googleSignup = null;
		this.googleCallbackError = null;
		this.googleError = null;
		this.signedInWithGoogle = false;
		this.trustedHere = false;
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
				await this.beforeUnlock(user.id);
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
	 * llevar al usuario a la pantalla de verificación. Con MFA activa, el primer paso no abre sesión:
	 * deja `mfaPending` y guarda la `kek` en memoria hasta `verifyMfa`.
	 */
	async login(input: LoginInput): Promise<ActionResult> {
		const result = await this.act(validateLogin(input), async () => {
			// La contraseña no sale de aquí: se deriva una prueba para el servidor y una clave local.
			const { kdf } = await this.repo.prelogin(input.email);
			const { authKey, kek } = await deriveFromPassword(input.password, kdf);
			const outcome = await this.repo.login({ email: input.email, authKey });
			if (isMfaChallenge(outcome)) {
				this.pendingMfa = { token: outcome.mfaToken, kek, expiresAt: outcome.expiresAt };
				this.mfaPending = true;
				return;
			}
			await this.finishLogin(outcome, kek);
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
	 * Segundo paso del login: completa el reto con el código TOTP o de respaldo. Con la `kek` guardada
	 * desenvuelve la clave maestra y desbloquea la app; sin ella (login por Google), deja la sesión
	 * abierta pero bloqueada.
	 */
	async verifyMfa(code: string): Promise<ActionResult> {
		const pending = this.pendingMfa;
		if (!pending) return this.reject({ kind: 'not-found', entity: 'mfa' });
		const result = await this.act(validateMfaCode(code), async () => {
			const session = await this.repo.loginMfa(pending.token, code);
			if (!pending.kek) {
				// Sin contraseña (Google): sesión y claves, pero la app queda bloqueada.
				this.pendingMfa = null;
				this.mfaPending = false;
				await this.adoptGoogleSession(session);
				return;
			}
			// Vino de vincular Google y trae `kek`: se aplican las preferencias de Google antes de desbloquear.
			if (pending.google) {
				this.signedInWithGoogle = true;
				await this.applyGooglePrefs(session.user.id);
			}
			await this.finishLogin(session, pending.kek, { google: pending.google });
		});
		if (!result.ok && this.isExpiredMfaTicket(result.error)) {
			this.pendingMfa = null;
			this.mfaPending = false;
			this.notice = 'mfa-expired';
		}
		return result;
	}

	private isExpiredMfaTicket(error: AppError): boolean {
		if (error.kind === 'session-expired') return true;
		return error.kind === 'validation' && error.fields.mfaToken !== undefined;
	}

	/** Cierra el primer factor: desenvuelve la clave maestra, desbloquea el cofre y abre la sesión. */
	private async finishLogin(
		session: LoginResult,
		kek: CryptoKey,
		options: { google?: boolean } = {}
	): Promise<void> {
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
		await this.beforeUnlock(session.user.id);
		await this.vault.unlock(session.user.id, masterKey, this.rememberDevice());
		if (this.deferredRecovery?.userId === session.user.id) {
			this.pendingRecoveryKey = this.deferredRecovery.recoveryKey;
			this.deferredRecovery = null;
		}
		this.user = session.user;
		this.status = 'authenticated';
		this.pendingMfa = null;
		this.mfaPending = false;
		// Tras un desbloqueo con contraseña por Google, este dispositivo se da de alta si procede.
		if (options.google) await this.registerTrust(session.user, masterKey);
	}

	// ─── Acceso con Google ─────────────────────────────────────────────────────

	/**
	 * Empieza el flujo OAuth: genera el `verifier` de PKCE (32 bytes), calcula su `challenge` y redirige
	 * a la URL que devuelve el servidor. El `verifier` se guarda en `sessionStorage` y se borra al volver.
	 */
	async startGoogle(): Promise<ActionResult> {
		this.clearErrors();
		this.googleCallbackError = null;
		this.googleError = null;
		const result = await attempt(async () => {
			const verifier = toB64u(randomBytes(32));
			const challenge = toB64u(
				new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(verifier)))
			);
			try {
				sessionStorage.setItem(GOOGLE_VERIFIER_KEY, verifier);
			} catch {
				// Sin almacenamiento: se podrá canjear igual en una pestaña normal, con recarga se pierde.
			}
			const { url } = await this.repo.googleStart(challenge);
			if (typeof location !== 'undefined') location.assign(url);
		});
		if (!result.ok) {
			this.error = result.error;
			this.googleError = result.error;
		}
		return result;
	}

	/**
	 * Completa el retorno de Google (`/auth/google`). Lee el `code` (o el `error`) del fragmento, lo
	 * quita del historial, recupera y borra el `verifier` y canjea el resultado. Deja el estado listo
	 * para la pantalla: sesión bloqueada, reto MFA, vinculación o creación de cuenta.
	 */
	async completeGoogle(fragment: string): Promise<ActionResult> {
		this.clearErrors();
		this.googleCallbackError = null;
		this.googleError = null;
		this.googleProcessing = true;
		clearUrlFragment();
		const params = new SvelteURLSearchParams(fragment.replace(/^#/, ''));
		const verifier = takeGoogleVerifier();
		const errorParam = params.get('error');
		if (errorParam) {
			this.googleProcessing = false;
			this.googleCallbackError = errorParam;
			return this.reject({ kind: 'forbidden', code: 'google-email-unverified' });
		}
		const code = params.get('code');
		if (!code || !verifier) {
			this.googleProcessing = false;
			return this.reject({ kind: 'validation', fields: { code: 'invalid-token' } });
		}
		const result = await attempt(() => this.repo.googleExchange(code, verifier));
		this.googleProcessing = false;
		if (!result.ok) {
			this.error = result.error;
			this.googleError = result.error;
			return result;
		}
		await this.applyGoogleOutcome(result.value);
		return succeed();
	}

	private async applyGoogleOutcome(outcome: GoogleOutcome): Promise<void> {
		switch (outcome.status) {
			case 'authenticated':
				await this.adoptGoogleSession(outcome.session);
				break;
			case 'mfa-required':
				// Sin contraseña todavía: el `pendingMfa` va sin `kek` → `/two-factor`.
				this.pendingMfa = {
					token: outcome.mfaToken,
					kek: null,
					expiresAt: outcome.expiresAt,
					google: true
				};
				this.mfaPending = true;
				break;
			case 'link-required':
				this.googleLink = {
					linkToken: outcome.linkToken,
					email: outcome.email,
					kdf: outcome.kdf
				};
				break;
			case 'signup-required':
				this.googleSignup = {
					signupToken: outcome.signupToken,
					email: outcome.email,
					fullName: outcome.fullName
				};
				break;
		}
	}

	/**
	 * Vincula Google a una cuenta existente escribiendo la contraseña. Con `kek` desbloquea; si la cuenta
	 * tiene MFA, deja el reto con la `kek` guardada.
	 */
	async linkGoogle(password: string): Promise<ActionResult> {
		const pending = this.googleLink;
		if (!pending) return this.reject({ kind: 'not-found', entity: 'google-link' });
		const validation: Validation = password
			? { valid: true }
			: { valid: false, errors: { password: 'required' } };
		return this.act(validation, async () => {
			const { authKey, kek } = await deriveFromPassword(password, pending.kdf);
			const outcome = await this.repo.googleLink(pending.linkToken, authKey);
			this.googleLink = null;
			if (isMfaChallenge(outcome)) {
				this.pendingMfa = {
					token: outcome.mfaToken,
					kek,
					expiresAt: outcome.expiresAt,
					google: true
				};
				this.mfaPending = true;
				return;
			}
			this.signedInWithGoogle = true;
			await this.applyGooglePrefs(outcome.user.id);
			await this.finishLogin(outcome, kek, { google: true });
		});
	}

	/**
	 * Crea la cuenta con Google: las claves se generan aquí y el correo ya viene verificado. Deja la app
	 * desbloqueada y la clave de recuperación lista para mostrar, igual que `verify()`.
	 */
	async registerWithGoogle(input: {
		fullName: string;
		password: string;
		acceptedTerms: boolean;
	}): Promise<ActionResult> {
		const pending = this.googleSignup;
		if (!pending) return this.reject({ kind: 'not-found', entity: 'google-signup' });
		return this.act(validateRegister({ ...input, email: pending.email }), async () => {
			const account = await createAccountKeys(input.password, this.kdf);
			const session = await this.repo.googleRegister({
				signupToken: pending.signupToken,
				userId: account.userId,
				fullName: input.fullName.trim(),
				acceptedTerms: input.acceptedTerms,
				authKey: account.authKey,
				recoveryAuth: account.recoveryAuth,
				keys: account.keys
			});
			this.googleSignup = null;
			this.pendingRecoveryKey = account.recoveryKey;
			this.keyBundle = session.keys;
			this.user = session.user;
			this.signedInWithGoogle = true;
			this.unlockFailures = 0;
			this.notice = null;
			await this.applyGooglePrefs(session.user.id);
			await this.beforeUnlock(session.user.id);
			await this.vault.unlock(session.user.id, account.masterKey, this.rememberDevice());
			this.status = 'authenticated';
			await this.registerTrust(session.user, account.masterKey);
		});
	}

	/** Desvincula Google de la cuenta (exige la prueba de la contraseña). */
	async unlinkGoogle(password: string): Promise<ActionResult> {
		const validation: Validation = password
			? { valid: true }
			: { valid: false, errors: { password: 'required' } };
		return this.act(validation, async () => {
			const user = this.requireUser();
			const authKey = await deriveAuthKey(password, (await this.bundle()).kdf);
			await this.repo.unlinkGoogle(authKey);
			this.user = { ...user, hasGoogle: false };
		});
	}

	/**
	 * Sesión de Google sin contraseña: guarda las claves, intenta abrir el cofre con lo que haya en el
	 * dispositivo y deja la sesión iniciada. Si no se puede descifrar, la app queda bloqueada (`/unlock`).
	 */
	private async adoptGoogleSession(session: LoginResult): Promise<void> {
		this.keyBundle = session.keys;
		this.user = session.user;
		this.signedInWithGoogle = true;
		this.unlockFailures = 0;
		this.notice = null;
		await this.applyGooglePrefs(session.user.id);
		// Entrar con Google deja marca de confianza en este dispositivo (decide el diálogo de cierre).
		this.markTrusted(session.user.id);
		// Si este dispositivo ya es de confianza, se entra sin contraseña; si no, se deja bloqueada.
		if (!(await this.tryUseTrustedDevice(session))) await this.restoreVault(session.user.id);
		this.status = 'authenticated';
	}

	/** Una marca: este dispositivo entra con Google (para el diálogo de cierre y el alta). */
	private markTrusted(userId: string): void {
		this.trustedHere = true;
		this.markTrustedDevice(userId);
	}

	/** Se olvida la confianza de este dispositivo (olvidar, 404 del servidor o borrar la cuenta). */
	private clearTrusted(userId: string): void {
		this.trustedHere = false;
		this.clearTrustedDevice(userId);
	}

	/**
	 * Uso del dispositivo de confianza: pide al servidor la clave maestra cifrada, la descifra con la
	 * clave local y desbloquea sin contraseña. Si el servidor ya no la tiene (`404`) o no se puede
	 * descifrar, borra la fila local y devuelve `false` (la app quedará bloqueada).
	 */
	private async tryUseTrustedDevice(session: LoginResult): Promise<boolean> {
		const userId = session.user.id;
		const local = await this.vault.trustOf(userId);
		if (!local) return false;
		try {
			const { wrappedMasterKey } = await this.trustedDevices.get(local.trustId);
			const masterKey = await this.vault.unwrapTrust(userId, local.trustId, wrappedMasterKey);
			if (!masterKey) throw fail.decrypt();
			await this.vault.unlock(userId, masterKey, this.rememberDevice());
			return true;
		} catch {
			await this.vault.forgetTrust(userId);
			this.clearTrusted(userId);
			return false;
		}
	}

	/**
	 * Alta del dispositivo de confianza tras desbloquear con la contraseña (solo si la cuenta tiene
	 * Google y no se pidió la contraseña al salir). Un fallo de red aquí no es visible: se reintenta en
	 * el siguiente desbloqueo.
	 */
	private async registerTrust(user: User, masterKey: CryptoKey): Promise<void> {
		if (!user.hasGoogle || !this.rememberDevice()) return;
		try {
			const existing = await this.vault.trustOf(user.id);
			const prepared = await this.vault.prepareTrust(user.id, masterKey);
			await this.trustedDevices.add({
				id: prepared.trustId,
				name: this.deviceName(),
				platform: 'web',
				wrappedMasterKey: prepared.wrappedMasterKey
			});
			await this.vault.saveTrust(user.id, prepared.trustId, prepared.deviceKey);
			if (existing && existing.trustId !== prepared.trustId) {
				// Sustituir la confianza anterior en el servidor; no bloquea si falla.
				void this.trustedDevices.remove(existing.trustId).catch(() => {});
			}
			this.markTrusted(user.id);
		} catch {
			// Silencioso: la confianza se reintenta en el siguiente desbloqueo con contraseña.
		}
	}

	/** Deriva la prueba de la contraseña con el kdf de la cuenta (para operaciones que la exigen). */
	async authKeyFor(password: string): Promise<string> {
		return deriveAuthKey(password, (await this.bundle()).kdf);
	}

	/**
	 * Lee el paquete del enlace de recuperación sin aplicar nada. La pantalla lo usa para saber si la
	 * cuenta tiene verificación en dos pasos y pedir el código solo cuando hace falta.
	 */
	async loadPasswordResetBundle(token: string): Promise<ActionResult<PasswordResetBundle>> {
		const result = await attempt(() => this.repo.passwordResetBundle(token));
		if (!result.ok) this.error = result.error;
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
			this.signedInWithGoogle = false;
			await this.beforeUnlock(user.id);
			await this.vault.unlock(user.id, masterKey, this.rememberDevice());
			// Desbloquear con contraseña da de alta este dispositivo si la cuenta entra con Google.
			await this.registerTrust(user, masterKey);
		});
		if (!result.ok && this.fieldErrors.password === 'wrong-password') {
			this.unlockFailures += 1;
			if (this.unlockFailures >= MAX_UNLOCK_ATTEMPTS) await this.logout();
		}
		return result;
	}

	/**
	 * Cierra la sesión. Con `forgetDevice` se olvida además este dispositivo de confianza (borra la
	 * mitad local y la del servidor); sin él, la confianza se conserva (T4).
	 */
	async logout(options: { forgetDevice?: boolean } = {}): Promise<ActionResult> {
		return this.act({ valid: true }, async () => {
			// Primero se borra lo local: sin red también se puede salir (el token caduca solo).
			const userId = this.user?.id ?? null;
			this.forgetSession();
			this.notice = null;
			if (userId && options.forgetDevice) this.clearTrusted(userId);
			await this.vault.signOut({ forgetTrust: options.forgetDevice === true });
			await this.onSignedOut(userId);
			try {
				await this.repo.logout();
			} catch {
				// Revocación pendiente: el servidor la hará al caducar el token.
			}
		});
	}

	async deleteAccount(password: string): Promise<ActionResult> {
		const validation: Validation = password
			? { valid: true }
			: { valid: false, errors: { password: 'required' } };
		return this.act(validation, async () => {
			const authKey = await deriveAuthKey(password, (await this.bundle()).kdf);
			const userId = this.requireUser().id;
			await this.repo.deleteAccount(authKey);
			this.forgetSession();
			this.notice = null;
			// Borrar la cuenta borra la confianza local y las preferencias del dispositivo.
			this.clearTrusted(userId);
			await this.vault.signOut({ forgetTrust: true });
			await this.onSignedOut(userId);
			await this.onAccountDeleted(userId);
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
				// El servidor revocó todos los dispositivos: este vuelve a darse de alta.
				await this.registerTrust(user, change.masterKey);
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
					keys: recovered.keys,
					...(choice.disableMfa ? { disableMfa: true } : {})
				});
			} else {
				// Con MFA activa, `wipe` exige el código antes de borrar nada.
				if (bundle.mfaEnabled && !choice.mfaCode?.trim())
					throw fail.validation({ mfaCode: 'required' });
				const account = await createAccountKeys(password, this.kdf, bundle.userId);
				await this.repo.resetPassword({
					token,
					mode: 'wipe',
					newAuthKey: account.authKey,
					recoveryAuth: account.recoveryAuth,
					keys: account.keys,
					...(bundle.mfaEnabled && choice.mfaCode ? { mfaCode: choice.mfaCode } : {})
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
