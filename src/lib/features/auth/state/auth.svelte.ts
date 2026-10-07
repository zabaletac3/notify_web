import { attempt } from '#lib/core/index.js';
import type { AuthRepository } from '#lib/data/index.js';
import {
	succeed,
	validateChangePassword,
	validateEmail,
	validateEmailChange,
	validateLogin,
	validateNewPassword,
	validateProfileName,
	validateRegister,
	validateVerificationCode,
	type ActionResult,
	type AppError,
	type AuthStatus,
	type LoginInput,
	type RegisterInput,
	type Validation,
	type User
} from '#lib/domain/index.js';

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
	/** `true` cuando ya se pidió el enlace de recuperación. */
	resetRequested = $state(false);

	private readonly repo: AuthRepository;
	private readonly clock: () => Date;

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- fábrica del reloj, no es estado
	constructor(repo: AuthRepository, clock: () => Date = () => new Date()) {
		this.repo = repo;
		this.clock = clock;
	}

	isAuthenticated = $derived(this.status === 'authenticated');

	/** Segundos que faltan para poder reenviar el código (0 = ya se puede). */
	resendRemaining(): number {
		return Math.max(0, Math.ceil((this.resendAvailableAt - this.clock().getTime()) / 1000));
	}

	async bootstrap(): Promise<void> {
		const result = await attempt(() => this.repo.currentSession());
		if (result.ok) {
			this.user = result.value?.user ?? null;
			this.status = result.value ? 'authenticated' : 'anonymous';
		} else if (result.error.kind === 'session-expired') {
			this.status = 'expired';
		} else {
			this.status = 'anonymous';
		}
	}

	/** La capa de datos avisó de que la sesión venció (desde cualquier llamada remota). */
	markExpired() {
		if (this.status === 'authenticated') this.status = 'expired';
	}

	clearErrors() {
		this.error = null;
		this.fieldErrors = {};
	}

	async register(input: RegisterInput): Promise<ActionResult> {
		return this.act(validateRegister(input), async () => {
			const { email } = await this.repo.register(input);
			this.pendingEmail = email;
			this.startCooldown();
		});
	}

	async verify(code: string): Promise<ActionResult> {
		const email = this.pendingEmail;
		if (!email) return this.reject({ kind: 'not-found', entity: 'pending-email' });
		return this.act(validateVerificationCode(code), async () => {
			this.user = await this.repo.verifyEmail(email, code);
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
			const session = await this.repo.login(input);
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

	async logout(): Promise<ActionResult> {
		return this.act({ valid: true }, async () => {
			await this.repo.logout();
			this.user = null;
			this.status = 'anonymous';
		});
	}

	async deleteAccount(): Promise<ActionResult> {
		return this.act({ valid: true }, async () => {
			await this.repo.deleteAccount();
			this.user = null;
			this.status = 'anonymous';
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
			const { email } = await this.repo.requestEmailChange(newEmail, password);
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
		return this.act(validateChangePassword(currentPassword, newPassword, confirmation), () =>
			this.repo.changePassword(currentPassword, newPassword)
		);
	}

	/** Pide el enlace de recuperación. Siempre "funciona" para no revelar qué correos existen. */
	async forgotPassword(email: string): Promise<ActionResult> {
		return this.act(validateEmail(email), async () => {
			await this.repo.requestPasswordReset(email);
			this.resetRequested = true;
		});
	}

	async resetPassword(
		token: string,
		password: string,
		confirmation: string
	): Promise<ActionResult> {
		return this.act(validateNewPassword(password, confirmation), () =>
			this.repo.resetPassword(token, password)
		);
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
