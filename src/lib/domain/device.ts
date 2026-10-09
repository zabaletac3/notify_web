import type { Sealed } from './crypto.js';
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

/**
 * Navegador de confianza: el servidor guarda la clave maestra cifrada con la clave propia del
 * dispositivo. Ninguna de las dos mitades sirve sola (ver ADR 0006, D16).
 */
export interface TrustedDevice {
	id: Id;
	name: string;
	platform: DevicePlatform;
	createdAt: IsoDate;
	lastUsedAt: IsoDate;
}

/** Alta de un dispositivo de confianza: la clave maestra llega ya cifrada con la clave del navegador. */
export interface TrustedDeviceInput {
	/** UUID v7 generado por el cliente (los datos asociados lo necesitan antes de crearlo). */
	id: Id;
	name: string;
	platform: DevicePlatform;
	wrappedMasterKey: Sealed;
}
