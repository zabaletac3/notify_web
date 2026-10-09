export type ThemePreference = 'system' | 'light' | 'dark';
export type TextSize = 'small' | 'medium' | 'large';
export type LockTimeout = 'immediately' | '1m' | '5m' | '15m' | 'never';

export interface AppSettings {
	theme: ThemePreference;
	textSize: TextSize;
	noteOrder: 'updated' | 'created' | 'title';
	openWithNewNote: boolean;
	showPreview: boolean;
	language: 'es';
	autoSync: boolean;
	wifiOnly: boolean;
	biometricLock: boolean;
	lockOnExit: boolean;
	lockTimeout: LockTimeout;
	twoFactor: boolean;
}

/**
 * Campos que se pueden cambiar desde Ajustes. `twoFactor` es de solo lectura: la verificación en dos
 * pasos se gestiona con los endpoints `/mfa` y el servidor lo calcula; enviarlo da `422`.
 */
export type AppSettingsPatch = Partial<Omit<AppSettings, 'twoFactor'>>;

export const DEFAULT_SETTINGS: AppSettings = {
	theme: 'system',
	textSize: 'medium',
	noteOrder: 'updated',
	openWithNewNote: false,
	showPreview: true,
	language: 'es',
	autoSync: true,
	wifiOnly: false,
	biometricLock: true,
	// Por defecto no se pide la contraseña al recargar: la clave se recuerda en el dispositivo y el
	// tiempo de bloqueo decide cuándo se vuelve a pedir. El modo estricto es opcional.
	lockOnExit: false,
	lockTimeout: '1m',
	twoFactor: false
};

/** Cuánto tiempo sin actividad (ms) tras el que se bloquea sola. `immediately` lo gestiona la visibilidad. */
export const LOCK_TIMEOUT_MS: Record<LockTimeout, number | 'visibility' | 'never'> = {
	immediately: 'visibility',
	'1m': 60_000,
	'5m': 300_000,
	'15m': 900_000,
	never: 'never'
};

/**
 * Si al volver a abrir la app hay que pedir la contraseña por haber pasado el tiempo de bloqueo con
 * la pestaña cerrada. `never` e `immediately` no dependen del tiempo; sin dato de actividad, no bloquea.
 */
export function lockTimeoutExceeded(
	timeout: LockTimeout,
	lastActiveAt: number | null,
	nowMs: number
): boolean {
	const after = LOCK_TIMEOUT_MS[timeout];
	if (typeof after !== 'number' || lastActiveAt === null) return false;
	return nowMs - lastActiveAt > after;
}

/**
 * Mezcla lo guardado con los valores por defecto y descarta valores desconocidos (por ejemplo, un
 * `lockTimeout` que ya no existe). Sirve para leer preferencias del dispositivo de forma tolerante.
 */
export function normalizeSettings(stored: Partial<AppSettings> | null | undefined): AppSettings {
	const value = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
	if (!['immediately', '1m', '5m', '15m', 'never'].includes(value.lockTimeout))
		value.lockTimeout = DEFAULT_SETTINGS.lockTimeout;
	if (!['system', 'light', 'dark'].includes(value.theme)) value.theme = DEFAULT_SETTINGS.theme;
	if (!['small', 'medium', 'large'].includes(value.textSize))
		value.textSize = DEFAULT_SETTINGS.textSize;
	if (!['updated', 'created', 'title'].includes(value.noteOrder))
		value.noteOrder = DEFAULT_SETTINGS.noteOrder;
	return value;
}
