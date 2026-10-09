import { generateDeviceKey, unwrap, wrap, type Sealed } from '#lib/core/crypto/index.js';
import { newId, type Id } from '#lib/domain/index.js';
import { KeysDb } from './device-keys.js';

/** Datos asociados con los que se cifra la clave maestra para un dispositivo de confianza. */
export const trustedDeviceAad = (userId: Id, trustId: Id) =>
	`apunte/v1/mk/${userId}/trusted/${trustId}`;

/** Clave local de un dispositivo de confianza: solo la `deviceKey` no exportable; **nunca** la maestra. */
export interface LocalTrust {
	trustId: Id;
	deviceKey: CryptoKey;
}

/**
 * Almacén de los dispositivos de confianza en este navegador (junto a `DeviceKeyStore`, en la base
 * `apunte-keys`). Guarda una clave AES-GCM **no exportable** por cuenta; la clave maestra solo existe
 * cifrada en el servidor (mitad y mitad). Es independiente de `DeviceKeyStore`: este último reabre la
 * app dentro de una sesión viva, el de confianza solo interviene al iniciar sesión con Google.
 */
export class TrustedDeviceStore {
	private db: KeysDb;

	constructor(private name = 'apunte-keys') {
		this.db = new KeysDb(name);
	}

	/**
	 * Genera una clave de dispositivo nueva y envuelve la clave maestra. **No guarda nada**: el alta
	 * solo se confirma (con `save`) tras aceptar el servidor.
	 */
	async prepare(
		userId: Id,
		masterKey: CryptoKey
	): Promise<{ trustId: Id; deviceKey: CryptoKey; wrappedMasterKey: Sealed }> {
		const trustId = newId();
		const deviceKey = await generateDeviceKey();
		return {
			trustId,
			deviceKey,
			wrappedMasterKey: await wrap(deviceKey, masterKey, trustedDeviceAad(userId, trustId))
		};
	}

	/** Guarda la clave del dispositivo tras darse de alta en el servidor. */
	async save(userId: Id, trustId: Id, deviceKey: CryptoKey): Promise<void> {
		try {
			await this.db.trustedDevices.put({ userId, trustId, deviceKey });
		} catch {
			// Sin almacenamiento disponible: se pedirá la contraseña la próxima vez.
		}
	}

	/** La clave guardada de esa cuenta, o `null` si no hay (o no se puede leer). */
	async get(userId: Id): Promise<LocalTrust | null> {
		try {
			const row = await this.db.trustedDevices.get(userId);
			return row ? { trustId: row.trustId, deviceKey: row.deviceKey } : null;
		} catch {
			return null;
		}
	}

	/** Descifra la clave maestra que entrega el servidor. `null` si no hay fila, no coincide o falla. */
	async unwrap(userId: Id, trustId: Id, wrappedMasterKey: Sealed): Promise<CryptoKey | null> {
		try {
			const row = await this.db.trustedDevices.get(userId);
			if (!row || row.trustId !== trustId) return null;
			return await unwrap(row.deviceKey, wrappedMasterKey, trustedDeviceAad(userId, trustId));
		} catch {
			return null;
		}
	}

	/** Borra la fila local y devuelve el `trustId` que tenía (para revocarla en el servidor). */
	async remove(userId: Id): Promise<Id | null> {
		try {
			const row = await this.db.trustedDevices.get(userId);
			if (!row) return null;
			await this.db.trustedDevices.delete(userId);
			return row.trustId;
		} catch {
			return null;
		}
	}

	close(): void {
		this.db.close();
	}
}
