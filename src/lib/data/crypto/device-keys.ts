import Dexie, { type Table } from 'dexie';
import { generateDeviceKey, unwrap, wrap, type Sealed } from '#lib/core/crypto/index.js';
import type { Id } from '#lib/domain/index.js';

interface DeviceKeyRow {
	userId: Id;
	/** Clave AES-GCM **no exportable**: solo se puede usar desde este navegador. */
	deviceKey: CryptoKey;
	/** La clave maestra, cifrada con `deviceKey`. */
	wrappedMasterKey: Sealed;
}

class KeysDb extends Dexie {
	deviceKeys!: Table<DeviceKeyRow, Id>;
	constructor(name: string) {
		super(name);
		this.version(1).stores({ deviceKeys: 'userId' });
	}
}

const aad = (userId: Id) => `apunte/v1/mk/${userId}/device`;

/**
 * Guarda la clave maestra en este dispositivo, cifrada con una clave que el navegador no deja
 * exportar. Es lo que permite no pedir la contraseña en cada apertura cuando el bloqueo al salir está
 * desactivado. Está en su propia base (`apunte-keys`) para poder borrarla aparte de las notas.
 */
export class DeviceKeyStore {
	private db: KeysDb;

	constructor(private name = 'apunte-keys') {
		this.db = new KeysDb(name);
	}

	async save(userId: Id, masterKey: CryptoKey): Promise<void> {
		const existing = await this.db.deviceKeys.get(userId);
		const deviceKey = existing?.deviceKey ?? (await generateDeviceKey());
		await this.db.deviceKeys.put({
			userId,
			deviceKey,
			wrappedMasterKey: await wrap(deviceKey, masterKey, aad(userId))
		});
	}

	/** La clave maestra guardada, o `null` si no hay (o no se puede leer). */
	async load(userId: Id): Promise<CryptoKey | null> {
		const row = await this.db.deviceKeys.get(userId);
		if (!row) return null;
		try {
			return await unwrap(row.deviceKey, row.wrappedMasterKey, aad(userId));
		} catch {
			return null;
		}
	}

	async remove(userId: Id): Promise<void> {
		await this.db.deviceKeys.delete(userId);
	}

	/** Borra todas las claves de este navegador (y la base). El almacén se puede seguir usando después. */
	async removeAll(): Promise<void> {
		await this.db.delete();
		this.db = new KeysDb(this.name);
	}

	close(): void {
		this.db.close();
	}
}
