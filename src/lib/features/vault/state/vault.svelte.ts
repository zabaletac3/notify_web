import { DeviceKeyStore, Vault } from '#lib/data/index.js';
import { fail, type Id, type VaultStatus } from '#lib/domain/index.js';

/**
 * Estado del cofre de claves visible para la interfaz: bloqueado o desbloqueado.
 * Guarda la clave maestra solo en memoria; opcionalmente la recuerda cifrada en este dispositivo
 * (cuando el bloqueo al salir está desactivado).
 */
export class VaultState {
	status = $state<VaultStatus>('locked');

	private vault: Vault | null = null;
	private readonly store: DeviceKeyStore;

	constructor(store: DeviceKeyStore = new DeviceKeyStore()) {
		this.store = store;
	}

	isUnlocked = $derived(this.status === 'unlocked');

	/** Cuenta de la sesión actual, si hay cofre. */
	get userId(): Id | null {
		return this.vault?.userId ?? null;
	}

	/** El cofre para cifrar y descifrar. Lanza `locked` si la app está bloqueada. */
	get current(): Vault {
		if (!this.vault) throw fail.locked();
		this.vault.requireKey();
		return this.vault;
	}

	private open(userId: Id): Vault {
		if (this.vault?.userId !== userId) {
			this.vault?.lock();
			this.vault = new Vault({ userId });
		}
		return this.vault;
	}

	/** Desbloquea con la clave maestra de la cuenta. Con `remember` la guarda cifrada en el dispositivo. */
	async unlock(userId: Id, masterKey: CryptoKey, remember: boolean): Promise<void> {
		this.open(userId).unlockWith(masterKey);
		this.status = 'unlocked';
		if (remember) await this.store.save(userId, masterKey);
	}

	/** Intenta desbloquear con la clave guardada en este dispositivo. `false` si no hay. */
	async restore(userId: Id): Promise<boolean> {
		if (this.status === 'unlocked' && this.vault?.userId === userId) return true;
		const key = await this.store.load(userId);
		if (!key) return false;
		this.open(userId).unlockWith(key);
		this.status = 'unlocked';
		return true;
	}

	/**
	 * Olvida la clave maestra de la memoria y **borra la clave guardada en el dispositivo**: un bloqueo
	 * (por inactividad, al ocultar la pestaña o manual) no debe poder saltarse recargando. Al desbloquear
	 * con la contraseña se vuelve a guardar si `rememberDevice()` lo permite.
	 */
	async lock(): Promise<void> {
		const userId = this.vault?.userId;
		this.vault?.lock();
		this.status = 'locked';
		if (userId) await this.store.remove(userId);
	}

	/** Borra la clave guardada en este dispositivo sin tocar la memoria. */
	async forgetDevice(userId: Id): Promise<void> {
		await this.store.remove(userId);
	}

	/** Activa o desactiva el recuerdo de la clave en este dispositivo. */
	async setRemember(remember: boolean): Promise<void> {
		if (!this.vault || this.status !== 'unlocked') return;
		if (remember) await this.store.save(this.vault.userId, this.vault.requireKey());
		else await this.store.remove(this.vault.userId);
	}

	/** Cierra la sesión: olvida la clave de la memoria y la guardada en el dispositivo. */
	async signOut(): Promise<void> {
		await this.lock();
		this.vault = null;
	}
}
