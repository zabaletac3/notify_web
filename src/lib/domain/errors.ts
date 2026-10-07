import type { Id } from './ids.js';

/**
 * Errores de la aplicación como datos: la UI decide qué pantalla o aviso mostrar según `kind`.
 * Los repositorios los lanzan envueltos en `AppFailure`.
 */
export type AppError =
	/** Sin red o servidor inalcanzable (pantalla "sin conexión"). */
	| { kind: 'network' }
	/** El servidor falló (pantalla "error de servidor"). */
	| { kind: 'server'; status?: number }
	/** Credenciales incorrectas. Mismo error para correo inexistente y contraseña errónea. */
	| { kind: 'unauthorized'; code?: 'invalid-credentials' }
	/** Acción no permitida; p. ej. iniciar sesión con el correo sin verificar. */
	| { kind: 'forbidden'; code?: 'email-not-verified' }
	/** La sesión expiró (diálogo "sesión expirada"). */
	| { kind: 'session-expired' }
	/** Este dispositivo fue eliminado de la cuenta desde otro: hay que borrar la copia local. */
	| { kind: 'device-revoked' }
	| { kind: 'not-found'; entity?: string }
	/** Datos inválidos: campo → código de validación (ver `ValidationCode`). */
	| { kind: 'validation'; fields: Record<string, string> }
	/** La nota cambió en otro dispositivo (pantalla de conflicto). */
	| { kind: 'conflict'; noteId: Id }
	| { kind: 'rate-limited'; retryAfterSec?: number }
	| { kind: 'unknown'; message?: string };

export type AppErrorKind = AppError['kind'];

/** Excepción que transporta un `AppError`. Es lo único que lanzan los repositorios. */
export class AppFailure extends Error {
	readonly error: AppError;

	constructor(error: AppError) {
		super(error.kind);
		this.name = 'AppFailure';
		this.error = error;
	}
}

/** Atajos para crear fallos tipados. */
export const fail = {
	network: () => new AppFailure({ kind: 'network' }),
	server: (status = 500) => new AppFailure({ kind: 'server', status }),
	invalidCredentials: () => new AppFailure({ kind: 'unauthorized', code: 'invalid-credentials' }),
	emailNotVerified: () => new AppFailure({ kind: 'forbidden', code: 'email-not-verified' }),
	sessionExpired: () => new AppFailure({ kind: 'session-expired' }),
	deviceRevoked: () => new AppFailure({ kind: 'device-revoked' }),
	notFound: (entity?: string) => new AppFailure({ kind: 'not-found', entity }),
	validation: (fields: Record<string, string>) => new AppFailure({ kind: 'validation', fields }),
	conflict: (noteId: Id) => new AppFailure({ kind: 'conflict', noteId }),
	rateLimited: (retryAfterSec = 900) => new AppFailure({ kind: 'rate-limited', retryAfterSec })
};

/** Convierte cualquier excepción en un `AppError`. */
export function toAppError(e: unknown): AppError {
	if (e instanceof AppFailure) return e.error;
	return { kind: 'unknown', message: e instanceof Error ? e.message : String(e) };
}

/** Resultado de una acción de la UI que no lanza: éxito (con valor opcional) o error tipado. */
export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; error: AppError };

export const succeed = <T = void>(value?: T): ActionResult<T> => ({
	ok: true,
	value: value as T
});
