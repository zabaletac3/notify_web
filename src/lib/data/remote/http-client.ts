import { AppFailure, type AppError } from '#lib/domain/index.js';
import type { StoredTokens, TokenStore } from './token-store.js';

export interface HttpClientOptions {
	/** Origen de la API, sin barra final (p. ej. `https://api.apunte.app`). */
	baseUrl: string;
	tokens: TokenStore;
	fetch?: typeof fetch;
	/** Tiempo máximo de cada petición. */
	timeoutMs?: number;
	/** Reloj inyectable (pruebas). */
	now?: () => number;
}

export interface RequestOptions {
	body?: unknown;
	/** Con sesión (por defecto sí). Sin sesión no se envía ni se renueva ningún token. */
	auth?: boolean;
}

interface WireError {
	kind?: string;
	code?: string;
	fields?: Record<string, string>;
	entity?: string;
	noteId?: string;
	retryAfterSec?: number;
}

/** Convierte la respuesta de error de la API (forma `AppError`) en un `AppFailure`. */
export function toFailure(
	status: number,
	body: unknown,
	retryAfterHeader?: string | null
): AppFailure {
	const b = (body && typeof body === 'object' ? body : {}) as WireError;
	const retry =
		b.retryAfterSec ?? (retryAfterHeader ? Number(retryAfterHeader) || undefined : undefined);
	let error: AppError;
	switch (b.kind) {
		case 'unauthorized':
			error = {
				kind: 'unauthorized',
				code: b.code === 'invalid-credentials' ? 'invalid-credentials' : undefined
			};
			break;
		case 'forbidden':
			error = {
				kind: 'forbidden',
				code: b.code === 'email-not-verified' ? 'email-not-verified' : undefined
			};
			break;
		case 'session-expired':
			error = { kind: 'session-expired' };
			break;
		case 'device-revoked':
			error = { kind: 'device-revoked' };
			break;
		case 'not-found':
			error = { kind: 'not-found', entity: b.entity };
			break;
		case 'validation':
			error = { kind: 'validation', fields: b.fields ?? {} };
			break;
		case 'conflict':
			error = { kind: 'conflict', noteId: b.noteId ?? '' };
			break;
		case 'rate-limited':
			error = { kind: 'rate-limited', retryAfterSec: retry };
			break;
		default:
			// Sin cuerpo reconocible: se decide por el estado HTTP. Nunca se muestra el texto del servidor.
			if (status === 429) error = { kind: 'rate-limited', retryAfterSec: retry };
			else if (status === 401) error = { kind: 'session-expired' };
			else error = { kind: 'server', status };
	}
	return new AppFailure(error);
}

/**
 * Cliente HTTP de la API. Añade el token de acceso, renueva la sesión una sola vez cuando vence
 * (serializado entre pestañas: reutilizar un token de renovación hace que el servidor cierre la sesión)
 * y traduce los errores a `AppFailure`.
 */
export class HttpClient {
	private refreshing: Promise<StoredTokens | null> | null = null;
	private readonly f: typeof fetch;

	constructor(private o: HttpClientOptions) {
		this.f = o.fetch ?? ((...a) => fetch(...a));
	}

	get hasSession(): boolean {
		return this.o.tokens.read() !== null;
	}

	/** Guarda los tokens de una respuesta de inicio de sesión o de renovación. */
	saveTokens(t: { accessToken?: string; refreshToken?: string; expiresAt: string }) {
		if (t.accessToken && t.refreshToken)
			this.o.tokens.write({
				accessToken: t.accessToken,
				refreshToken: t.refreshToken,
				expiresAt: t.expiresAt
			});
	}

	clearSession() {
		this.o.tokens.clear();
	}

	async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
		const auth = opts.auth ?? true;
		const sent = auth ? this.o.tokens.read() : null;
		if (auth && !sent) throw new AppFailure({ kind: 'session-expired' });
		try {
			return await this.once<T>(method, path, opts.body, sent?.accessToken);
		} catch (e) {
			// Token de acceso vencido: se renueva una vez y se reintenta.
			if (auth && e instanceof AppFailure && e.error.kind === 'session-expired' && sent) {
				const fresh = await this.refresh(sent.accessToken);
				if (!fresh) throw new AppFailure({ kind: 'session-expired' });
				return this.once<T>(method, path, opts.body, fresh.accessToken);
			}
			if (e instanceof AppFailure && e.error.kind === 'device-revoked') this.o.tokens.clear();
			throw e;
		}
	}

	private async once<T>(method: string, path: string, body: unknown, token?: string): Promise<T> {
		const ctl = new AbortController();
		const timer = setTimeout(() => ctl.abort(), this.o.timeoutMs ?? 30_000);
		let res: Response;
		try {
			res = await this.f(`${this.o.baseUrl}/v1${path}`, {
				method,
				headers: {
					Accept: 'application/json',
					...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
					...(token ? { Authorization: `Bearer ${token}` } : {})
				},
				body: body !== undefined ? JSON.stringify(body) : undefined,
				signal: ctl.signal,
				credentials: 'omit',
				cache: 'no-store',
				referrerPolicy: 'no-referrer'
			});
		} catch {
			throw new AppFailure({ kind: 'network' });
		} finally {
			clearTimeout(timer);
		}
		const text = await res.text().catch(() => '');
		let json: unknown = undefined;
		if (text) {
			try {
				json = JSON.parse(text);
			} catch {
				json = undefined;
			}
		}
		if (!res.ok) throw toFailure(res.status, json, res.headers.get('Retry-After'));
		return json as T;
	}

	/**
	 * Renueva la sesión. Una sola renovación a la vez en esta pestaña y, con Web Locks, entre pestañas:
	 * si otra pestaña ya renovó (el token guardado ya no es el que falló), se usa el suyo.
	 */
	private refresh(failedAccess: string): Promise<StoredTokens | null> {
		this.refreshing ??= this.lock(() => this.doRefresh(failedAccess)).finally(
			() => (this.refreshing = null)
		);
		return this.refreshing;
	}

	private lock<T>(fn: () => Promise<T>): Promise<T> {
		const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
		return locks ? locks.request('apunte-refresh', fn) : fn();
	}

	private async doRefresh(failedAccess: string): Promise<StoredTokens | null> {
		const current = this.o.tokens.read();
		if (!current) return null;
		if (current.accessToken !== failedAccess) return current; // otra pestaña ya renovó
		try {
			const res = await this.once<{
				accessToken?: string;
				refreshToken?: string;
				expiresAt: string;
			}>('POST', '/auth/refresh', { refreshToken: current.refreshToken });
			if (!res.accessToken || !res.refreshToken) throw new AppFailure({ kind: 'session-expired' });
			const next = {
				accessToken: res.accessToken,
				refreshToken: res.refreshToken,
				expiresAt: res.expiresAt
			};
			this.o.tokens.write(next);
			return next;
		} catch (e) {
			// Sin red: la sesión sigue siendo válida, solo no se pudo renovar ahora.
			if (
				e instanceof AppFailure &&
				(e.error.kind === 'network' || e.error.kind === 'server' || e.error.kind === 'rate-limited')
			)
				throw e;
			this.o.tokens.clear();
			if (e instanceof AppFailure && e.error.kind === 'device-revoked') throw e;
			return null;
		}
	}
}
