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

const KEY = 'apunte.tokens';

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
