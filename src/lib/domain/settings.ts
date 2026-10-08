export type ThemePreference = 'system' | 'light' | 'dark';
export type TextSize = 'small' | 'medium' | 'large';
export type LockTimeout = 'immediately' | '1m' | '5m' | '15m';

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
	lockOnExit: true,
	lockTimeout: '1m',
	twoFactor: false
};
