import { AppFailure, type AppError } from '#lib/domain/index.js';
import type { SessionMarker, TokenStore } from './token-store.js';

/**
 * `body` guarda el token de acceso y el de renovación en el `TokenStore` (escritorio, móvil y
 * clientes web antiguos). `cookie` deja el de renovación solo en una cookie `HttpOnly` y guarda el de
 * acceso en memoria de la pestaña; es el modo de la web real.
 */
export type SessionMode = 'cookie' | 'body';

/** Cabecera que activa el modo cookie en el servidor (login, verify-email, refresh y logout). */
export const SESSION_HEADER = 'X-AxoNote-Session';

export interface HttpClientOptions {
	/** Origen de la API, sin barra final (p. ej. `https://api.apunte.app`). */
	baseUrl: string;
	tokens: TokenStore;
	/** Por defecto `body` (comportamiento de siempre). En `cookie`, `marker` es obligatorio. */
	sessionMode?: SessionMode;
	/** Marcador no secreto de sesión (modo cookie). */
	marker?: SessionMarker;
	fetch?: typeof fetch;
	/** Tiempo máximo de cada petición. */
	timeoutMs?: number;
	/** Reloj inyectable (pruebas). */
	now?: () => number;
}

export interface RequestOptions {
	body?: unknown;
	/**
	 * Con sesión: `true` (por defecto) exige y renueva; `'optional'` envía el token si lo hay pero no
	 * falla sin él ni renueva (logout en modo cookie); `false` es una ruta pública.
	 */
	auth?: boolean | 'optional';
	/** Añade `X-AxoNote-Session: cookie` en modo cookie (login, verify-email y logout). */
	session?: boolean;
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
	private refreshing: Promise<string | null> | null = null;
	/** Token de acceso en memoria (solo modo cookie); el de renovación vive en la cookie `HttpOnly`. */
	private access: { token: string; expiresAt: string } | null = null;
	private readonly f: typeof fetch;

	constructor(private o: HttpClientOptions) {
		this.f = o.fetch ?? ((...a) => fetch(...a));
	}

	private get cookieMode(): boolean {
		return this.o.sessionMode === 'cookie';
	}

	/** Modo de sesión configurado (`body` por defecto). */
	get sessionMode(): SessionMode {
		return this.o.sessionMode ?? 'body';
	}

	get hasSession(): boolean {
		if (this.cookieMode) return this.o.marker?.has() ?? false;
		return this.o.tokens.read() !== null;
	}

	/** Guarda los tokens de una respuesta de inicio de sesión o de renovación. */
	saveTokens(t: { accessToken?: string; refreshToken?: string; expiresAt: string }) {
		if (this.cookieMode) {
			// El token de renovación vive en la cookie `HttpOnly`: cualquier `refreshToken` que llegara
			// por error en el JSON se ignora y nunca se guarda.
			if (t.accessToken) {
				this.access = { token: t.accessToken, expiresAt: t.expiresAt };
				this.o.marker?.set();
			}
			return;
		}
		if (t.accessToken && t.refreshToken)
			this.o.tokens.write({
				accessToken: t.accessToken,
				refreshToken: t.refreshToken,
				expiresAt: t.expiresAt
			});
	}

	clearSession() {
		if (this.cookieMode) {
			this.access = null;
			this.o.marker?.clear();
			return;
		}
		this.o.tokens.clear();
	}

	async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
		const auth = opts.auth ?? true;
		if (auth === false) return this.once<T>(method, path, opts.body, undefined, opts.session);
		const sent = this.accessToken();
		if (!sent) {
			// `'optional'` (logout en modo cookie): se envía el Bearer si lo hay, sin exigirlo ni renovar.
			if (auth === 'optional')
				return this.once<T>(method, path, opts.body, undefined, opts.session);
			// Arranque o recarga en modo cookie: hay marcador pero el acceso vive solo en memoria.
			if (this.cookieMode && this.o.marker?.has()) {
				const fresh = await this.refresh('');
				if (!fresh) throw new AppFailure({ kind: 'session-expired' });
				return this.once<T>(method, path, opts.body, fresh, opts.session);
			}
			throw new AppFailure({ kind: 'session-expired' });
		}
		try {
			return await this.once<T>(method, path, opts.body, sent, opts.session);
		} catch (e) {
			// Token de acceso vencido: se renueva una vez y se reintenta.
			if (auth !== 'optional' && e instanceof AppFailure && e.error.kind === 'session-expired') {
				const fresh = await this.refresh(sent);
				if (!fresh) throw new AppFailure({ kind: 'session-expired' });
				return this.once<T>(method, path, opts.body, fresh, opts.session);
			}
			if (e instanceof AppFailure && e.error.kind === 'device-revoked') this.clearSession();
			throw e;
		}
	}

	private accessToken(): string | null {
		if (this.cookieMode) return this.access?.token ?? null;
		return this.o.tokens.read()?.accessToken ?? null;
	}

	private async once<T>(
		method: string,
		path: string,
		body: unknown,
		token?: string,
		session = false
	): Promise<T> {
		const ctl = new AbortController();
		const timer = setTimeout(() => ctl.abort(), this.o.timeoutMs ?? 30_000);
		let res: Response;
		try {
			res = await this.f(`${this.o.baseUrl}/v1${path}`, {
				method,
				headers: {
					Accept: 'application/json',
					...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
					...(token ? { Authorization: `Bearer ${token}` } : {}),
					...(this.cookieMode && session ? { [SESSION_HEADER]: 'cookie' } : {})
				},
				body: body !== undefined ? JSON.stringify(body) : undefined,
				signal: ctl.signal,
				credentials: this.cookieMode ? 'include' : 'omit',
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
	 * en modo cuerpo, si otra pestaña ya renovó (el token guardado ya no es el que falló), se usa el suyo;
	 * en modo cookie la cookie la rotó la pestaña que ganó el cerrojo.
	 */
	private refresh(failedAccess: string): Promise<string | null> {
		this.refreshing ??= this.lock(() => this.doRefresh(failedAccess)).finally(
			() => (this.refreshing = null)
		);
		return this.refreshing;
	}

	private lock<T>(fn: () => Promise<T>): Promise<T> {
		const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
		return locks ? locks.request('apunte-refresh', fn) : fn();
	}

	private doRefresh(failedAccess: string): Promise<string | null> {
		return this.cookieMode ? this.doRefreshCookie(failedAccess) : this.doRefreshBody(failedAccess);
	}

	/** Renovación en modo cookie: POST sin cuerpo; la cookie `HttpOnly` viaja y rota sola. */
	private async doRefreshCookie(failedAccess: string): Promise<string | null> {
		const current = this.access;
		if (current && failedAccess && current.token !== failedAccess) return current.token;
		if (!this.o.marker?.has()) return null;
		try {
			const res = await this.once<{ accessToken?: string; expiresAt: string }>(
				'POST',
				'/auth/refresh',
				undefined,
				undefined,
				true
			);
			if (!res.accessToken) throw new AppFailure({ kind: 'session-expired' });
			this.access = { token: res.accessToken, expiresAt: res.expiresAt };
			this.o.marker?.set();
			return res.accessToken;
		} catch (e) {
			// Sin red/servidor/límite: la sesión sigue siendo válida; no se borra el marcador.
			if (
				e instanceof AppFailure &&
				(e.error.kind === 'network' || e.error.kind === 'server' || e.error.kind === 'rate-limited')
			)
				throw e;
			this.clearSession();
			if (e instanceof AppFailure && e.error.kind === 'device-revoked') throw e;
			return null;
		}
	}

	/** Renovación en modo cuerpo: `refreshToken` en el JSON y guardado en el `TokenStore`. */
	private async doRefreshBody(failedAccess: string): Promise<string | null> {
		const current = this.o.tokens.read();
		if (!current) return null;
		if (current.accessToken !== failedAccess) return current.accessToken; // otra pestaña ya renovó
		try {
			const res = await this.once<{
				accessToken?: string;
				refreshToken?: string;
				expiresAt: string;
			}>('POST', '/auth/refresh', { refreshToken: current.refreshToken });
			if (!res.accessToken || !res.refreshToken) throw new AppFailure({ kind: 'session-expired' });
			this.o.tokens.write({
				accessToken: res.accessToken,
				refreshToken: res.refreshToken,
				expiresAt: res.expiresAt
			});
			return res.accessToken;
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
