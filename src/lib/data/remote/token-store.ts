/** Tokens de la sesión con el servidor. */
export interface StoredTokens {
	accessToken: string;
	refreshToken: string;
	/** Vence el token de acceso (ISO). */
	expiresAt: string;
}

/**
 * Dónde se guardan los tokens entre recargas y entre pestañas. El de acceso dura minutos; el de
 * renovación se rota en cada uso y el servidor detecta si alguien lo reutiliza. Aun así, es un secreto:
 * nunca se registra ni se manda a otro origen que la API.
 */
export interface TokenStore {
	read(): StoredTokens | null;
	write(tokens: StoredTokens): void;
	clear(): void;
}

export class MemoryTokenStore implements TokenStore {
	private value: StoredTokens | null = null;
	read() {
		return this.value ? { ...this.value } : null;
	}
	write(tokens: StoredTokens) {
		this.value = { ...tokens };
	}
	clear() {
		this.value = null;
	}
}

/** Clave de los tokens en modo cuerpo (`sessionMode: 'body'`), antes la única sesión de la web. */
export const TOKENS_KEY = 'apunte.tokens';
/** Clave del marcador no secreto de sesión en modo cookie; no contiene tokens ni ids. */
export const SESSION_MARKER_KEY = 'apunte.session';

const KEY = TOKENS_KEY;

/** Persistente y compartido entre pestañas. Si el almacenamiento falla, cae a memoria sin romper nada. */
export class LocalStorageTokenStore implements TokenStore {
	private fallback = new MemoryTokenStore();

	read(): StoredTokens | null {
		try {
			const raw = localStorage.getItem(KEY);
			if (!raw) return null;
			const v = JSON.parse(raw) as Partial<StoredTokens>;
			if (
				typeof v.accessToken === 'string' &&
				typeof v.refreshToken === 'string' &&
				typeof v.expiresAt === 'string'
			)
				return { accessToken: v.accessToken, refreshToken: v.refreshToken, expiresAt: v.expiresAt };
			return null;
		} catch {
			return this.fallback.read();
		}
	}

	write(tokens: StoredTokens) {
		try {
			localStorage.setItem(KEY, JSON.stringify(tokens));
		} catch {
			this.fallback.write(tokens);
		}
	}

	clear() {
		this.fallback.clear();
		try {
			localStorage.removeItem(KEY);
		} catch {
			// Sin almacenamiento: nada que borrar.
		}
	}
}

/**
 * Marca de que hubo sesión en modo cookie. Es un dato no secreto: sirve para que, al recargar sin token
 * de acceso en memoria, el cliente sepa que puede intentar renovar con la cookie `HttpOnly`.
 */
export interface SessionMarker {
	has(): boolean;
	set(): void;
	clear(): void;
}

export class MemorySessionMarker implements SessionMarker {
	private value = false;
	has() {
		return this.value;
	}
	set() {
		this.value = true;
	}
	clear() {
		this.value = false;
	}
}

/** Marcador persistente en modo cookie. Al construirse borra los tokens de una instalación anterior. */
export class LocalStorageSessionMarker implements SessionMarker {
	private fallback = new MemorySessionMarker();

	constructor() {
		dropLegacyTokens();
	}

	has(): boolean {
		try {
			return localStorage.getItem(SESSION_MARKER_KEY) !== null;
		} catch {
			return this.fallback.has();
		}
	}

	set(): void {
		try {
			localStorage.setItem(SESSION_MARKER_KEY, JSON.stringify({ v: 1 }));
		} catch {
			this.fallback.set();
		}
	}

	clear(): void {
		this.fallback.clear();
		try {
			localStorage.removeItem(SESSION_MARKER_KEY);
		} catch {
			// Sin almacenamiento: nada que borrar.
		}
	}
}

/**
 * Migración de la web antigua: si quedaban tokens en `localStorage` (`apunte.tokens`), se borran al
 * arrancar en modo cookie. No se usa su contenido y **no** se tocan la copia local cifrada (IndexedDB)
 * ni los cambios sin subir; la persona tendrá que iniciar sesión otra vez. Por eso no se llama a
 * `vault.signOut`/`onSignedOut`.
 */
export function dropLegacyTokens(): void {
	try {
		localStorage.removeItem(TOKENS_KEY);
	} catch {
		// Sin almacenamiento: nada que borrar.
	}
}
