import type { Id, IsoDate } from './ids.js';

export type DevicePlatform = 'linux' | 'windows' | 'android' | 'web';

export interface Device {
	id: Id;
	name: string;
	platform: DevicePlatform;
	lastActiveAt: IsoDate;
	/** `true` en el dispositivo que está usando la sesión actual. */
	current: boolean;
}
