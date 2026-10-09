import { attempt } from '#lib/core/index.js';
import type { AuthRepository } from '#lib/data/index.js';
import type { AuthState } from '#lib/features/auth/index.js';
import {
	succeed,
	type ActionResult,
	type AppError,
	type MfaSetupResult,
	type MfaStatus
} from '#lib/domain/index.js';

/**
 * Gestión de la verificación en dos pasos (TOTP + códigos de respaldo). Sigue el patrón de
 * `DevicesState`: el repositorio hace el trabajo y el estado traduce errores a `ActionResult`.
 * La prueba de la contraseña (`authKey`) la deriva `AuthState` con el `kdf` de la cuenta.
 */
export class MfaState {
	status = $state<MfaStatus | null>(null);
	loading = $state(false);
	error = $state<AppError | null>(null);
	/** Códigos de validación por campo de la última acción. */
	fieldErrors = $state<Record<string, string>>({});
	/** Secreto y URI pendientes de confirmar (activación a medias). */
	pendingSetup = $state<MfaSetupResult | null>(null);
	/** Códigos de respaldo recién generados; se muestran una sola vez hasta `acknowledgeCodes`. */
	recoveryCodes = $state<string[]>([]);

	private readonly repo: AuthRepository;
	private readonly auth: AuthState;
	private readonly onSessionExpired: () => void;

	constructor(repo: AuthRepository, auth: AuthState, onSessionExpired: () => void = () => {}) {
		this.repo = repo;
		this.auth = auth;
		this.onSessionExpired = onSessionExpired;
	}

	enabled = $derived(this.status?.enabled ?? false);
	enabledAt = $derived(this.status?.enabledAt ?? null);
	recoveryCodesLeft = $derived(this.status?.recoveryCodesLeft ?? 0);

	clearErrors() {
		this.error = null;
		this.fieldErrors = {};
	}

	async load(): Promise<ActionResult> {
		return this.run(async () => {
			this.status = await this.repo.mfaStatus();
		});
	}

	/** Paso 1 de la activación: pide el secreto y la URI del autenticador (exige la contraseña). */
	async setup(password: string): Promise<ActionResult> {
		if (!password) return this.reject({ password: 'required' });
		return this.run(async () => {
			const authKey = await this.auth.authKeyFor(password);
			this.pendingSetup = await this.repo.mfaSetup(authKey);
		});
	}

	/** Paso 2: confirma el código TOTP y activa; deja los 10 códigos de respaldo para mostrar. */
	async enable(code: string): Promise<ActionResult> {
		if (!code.trim()) return this.reject({ code: 'required' });
		return this.run(async () => {
			const { recoveryCodes } = await this.repo.mfaEnable(code);
			this.recoveryCodes = recoveryCodes;
			this.pendingSetup = null;
			this.status = await this.repo.mfaStatus();
		});
	}

	/** Desactiva la verificación (contraseña + código). */
	async disable(password: string, code: string): Promise<ActionResult> {
		if (!password) return this.reject({ password: 'required' });
		if (!code.trim()) return this.reject({ code: 'required' });
		return this.run(async () => {
			const authKey = await this.auth.authKeyFor(password);
			await this.repo.mfaDisable(authKey, code);
			this.status = { enabled: false, enabledAt: null, recoveryCodesLeft: 0 };
		});
	}

	/** Genera 10 códigos de respaldo nuevos (contraseña + código). */
	async regenerate(password: string, code: string): Promise<ActionResult> {
		if (!password) return this.reject({ password: 'required' });
		if (!code.trim()) return this.reject({ code: 'required' });
		return this.run(async () => {
			const authKey = await this.auth.authKeyFor(password);
			const { recoveryCodes } = await this.repo.mfaRegenerateCodes(authKey, code);
			this.recoveryCodes = recoveryCodes;
			this.status = await this.repo.mfaStatus();
		});
	}

	/** La persona ya guardó los códigos: se borran de la memoria. */
	acknowledgeCodes() {
		this.recoveryCodes = [];
	}

	cancelSetup() {
		this.pendingSetup = null;
	}

	private reject(fields: Record<string, string>): ActionResult<never> {
		this.error = { kind: 'validation', fields };
		this.fieldErrors = fields;
		return { ok: false, error: this.error };
	}

	/** Ejecuta la acción traduciendo el error y avisando si la sesión venció. */
	private async run<T>(action: () => Promise<T>): Promise<ActionResult<T>> {
		this.clearErrors();
		this.loading = true;
		const result = await attempt(action);
		this.loading = false;
		if (!result.ok) {
			this.error = result.error;
			if (result.error.kind === 'validation') this.fieldErrors = result.error.fields;
			if (result.error.kind === 'session-expired') this.onSessionExpired();
			return result;
		}
		return succeed(result.value);
	}
}
