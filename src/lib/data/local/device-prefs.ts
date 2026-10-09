import { normalizeSettings, type AppSettings } from '#lib/domain/index.js';

/** Prefijo de la clave por cuenta en `localStorage`. */
export const DEVICE_PREFS_PREFIX = 'apunte-prefs-';
/** Prefijo de la última actividad por cuenta (para bloquear al recargar si pasó el tiempo). */
export const DEVICE_ACTIVE_PREFIX = 'apunte-active-';
/** Prefijo de la marca «en este dispositivo se entra con Google» (dispositivo de confianza). */
export const DEVICE_TRUST_PREFIX = 'apunte-trust-';

export const devicePrefsKey = (userId: string) => `${DEVICE_PREFS_PREFIX}${userId}`;
export const deviceActiveAtKey = (userId: string) => `${DEVICE_ACTIVE_PREFIX}${userId}`;
export const deviceTrustKey = (userId: string) => `${DEVICE_TRUST_PREFIX}${userId}`;

/** Lo mínimo de `localStorage` que usa el almacén (se puede sustituir en pruebas y SSR). */
export interface PrefsStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/**
 * Preferencias que viven en este dispositivo (no se sincronizan con el servidor): sobre todo, los
 * ajustes de bloqueo. Se leen y escriben **de forma síncrona** en `localStorage`, con una clave por
 * cuenta, para poder consultarlos en cuanto se conoce el `userId` (antes de desbloquear el cofre).
 * Tolerantes a `localStorage` no disponible (SSR, pruebas) y a un JSON inválido.
 */
export class DevicePrefs {
	constructor(private storage?: PrefsStorage) {}

	private get store(): PrefsStorage | null {
		if (this.storage) return this.storage;
		try {
			return typeof localStorage !== 'undefined' ? localStorage : null;
		} catch {
			return null;
		}
	}

	/** Preferencias guardadas de esa cuenta, o `null` si no hay. */
	read(userId: string): Partial<AppSettings> | null {
		const store = this.store;
		if (!store) return null;
		try {
			const raw = store.getItem(devicePrefsKey(userId));
			if (!raw) return null;
			const parsed: unknown = JSON.parse(raw);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
			return normalizeSettings(parsed as Partial<AppSettings>);
		} catch {
			return null;
		}
	}

	write(userId: string, settings: AppSettings): void {
		const store = this.store;
		if (!store) return;
		try {
			store.setItem(devicePrefsKey(userId), JSON.stringify(settings));
		} catch {
			// Sin almacenamiento disponible: las preferencias no persisten.
		}
	}

	/** Instante (ms) de la última actividad conocida con la pestaña abierta, o `null`. */
	readActiveAt(userId: string): number | null {
		const store = this.store;
		if (!store) return null;
		try {
			const raw = store.getItem(deviceActiveAtKey(userId));
			if (!raw) return null;
			const value = JSON.parse(raw) as unknown;
			return typeof value === 'number' && Number.isFinite(value) ? value : null;
		} catch {
			return null;
		}
	}

	writeActiveAt(userId: string, atMs: number): void {
		const store = this.store;
		if (!store) return;
		try {
			store.setItem(deviceActiveAtKey(userId), JSON.stringify(atMs));
		} catch {
			// Sin almacenamiento disponible: no hay dato de actividad.
		}
	}

	/** Borra solo la marca de actividad de esa cuenta (al cerrar sesión). Las preferencias se conservan. */
	removeActiveAt(userId: string): void {
		const store = this.store;
		if (!store) return;
		try {
			store.removeItem(deviceActiveAtKey(userId));
		} catch {
			// Nada que borrar.
		}
	}

	remove(userId: string): void {
		const store = this.store;
		if (!store) return;
		try {
			store.removeItem(devicePrefsKey(userId));
			store.removeItem(deviceActiveAtKey(userId));
			store.removeItem(deviceTrustKey(userId));
		} catch {
			// Nada que borrar.
		}
	}

	/**
	 * `true` si en este dispositivo se ha entrado con Google (marca que decide el diálogo de cierre de
	 * sesión con dos opciones). Se borra al olvidar el dispositivo y al borrar la cuenta.
	 */
	readTrust(userId: string): boolean {
		const store = this.store;
		if (!store) return false;
		try {
			return store.getItem(deviceTrustKey(userId)) === '1';
		} catch {
			return false;
		}
	}

	writeTrust(userId: string): void {
		const store = this.store;
		if (!store) return;
		try {
			store.setItem(deviceTrustKey(userId), '1');
		} catch {
			// Sin almacenamiento disponible: la marca no persiste.
		}
	}

	removeTrust(userId: string): void {
		const store = this.store;
		if (!store) return;
		try {
			store.removeItem(deviceTrustKey(userId));
		} catch {
			// Nada que borrar.
		}
	}
}
