import { DeviceKeyStore, TrustedDeviceStore, Vault } from '#lib/data/index.js';
import { fail, type Id, type Sealed, type VaultStatus } from '#lib/domain/index.js';

/** Ganchos del cofre para revocar en el servidor la confianza que se borra en el dispositivo. */
export interface VaultHooks {
	/** Intenta revocar en el servidor un dispositivo de confianza; nunca debe lanzar (mejor esfuerzo). */
	forgetTrustOnServer?: (userId: Id, trustId: Id) => void | Promise<void>;
}

/**
 * Estado del cofre de claves visible para la interfaz: bloqueado o desbloqueado.
 * Guarda la clave maestra solo en memoria; opcionalmente la recuerda cifrada en este dispositivo
 * (cuando el bloqueo al salir está desactivado).
 *
 * Además gestiona la mitad **local** de los dispositivos de confianza (D16): una clave no exportable
 * con la que el servidor envuelve la clave maestra. Esa confianza se borra al bloquear (S1) y, si se
 * pide, al cerrar sesión; pero solo se pide olvidarla explícitamente para no perderla al salir.
 */
export class VaultState {
	status = $state<VaultStatus>('locked');

	private vault: Vault | null = null;
	private readonly store: DeviceKeyStore;
	private readonly trusted: TrustedDeviceStore;
	private readonly forgetTrustOnServer: (userId: Id, trustId: Id) => void | Promise<void>;

	constructor(
		store: DeviceKeyStore = new DeviceKeyStore(),
		trusted: TrustedDeviceStore = new TrustedDeviceStore(),
		hooks: VaultHooks = {}
	) {
		this.store = store;
		this.trusted = trusted;
		this.forgetTrustOnServer = hooks.forgetTrustOnServer ?? (() => {});
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

	/** Borra la clave maestra de la memoria y la guardada en el dispositivo (sin tocar la confianza). */
	private async lockDevice(): Promise<void> {
		const userId = this.vault?.userId;
		this.vault?.lock();
		this.status = 'locked';
		if (userId) await this.store.remove(userId);
	}

	/**
	 * Bloquea la app (S1). Además de olvidar la clave recordada, **borra la confianza local** e intenta
	 * revocarla en el servidor: así «cerrar sesión → Google» no puede saltarse el bloqueo.
	 */
	async lock(): Promise<void> {
		const userId = this.vault?.userId;
		await this.lockDevice();
		if (userId) await this.forgetTrust(userId);
	}

	/** Borra la clave recordada en este dispositivo sin tocar la memoria ni la confianza. */
	async forgetDevice(userId: Id): Promise<void> {
		await this.store.remove(userId);
	}

	/** La confianza local de esa cuenta, o `null`. */
	trustOf(userId: Id): Promise<{ trustId: Id; deviceKey: CryptoKey } | null> {
		return this.trusted.get(userId);
	}

	/** Genera la clave del dispositivo y envuelve la MK; **no** guarda nada hasta `saveTrust`. */
	prepareTrust(
		userId: Id,
		masterKey: CryptoKey
	): Promise<{ trustId: Id; deviceKey: CryptoKey; wrappedMasterKey: Sealed }> {
		return this.trusted.prepare(userId, masterKey);
	}

	/** Guarda la confianza local de un dispositivo que el servidor ya aceptó. */
	async saveTrust(userId: Id, trustId: Id, deviceKey: CryptoKey): Promise<void> {
		await this.trusted.save(userId, trustId, deviceKey);
	}

	/** Descifra con la clave del dispositivo la clave maestra que entrega el servidor. */
	unwrapTrust(userId: Id, trustId: Id, wrappedMasterKey: Sealed): Promise<CryptoKey | null> {
		return this.trusted.unwrap(userId, trustId, wrappedMasterKey);
	}

	/** Borra la confianza local de esa cuenta e intenta revocarla en el servidor (mejor esfuerzo). */
	async forgetTrust(userId: Id): Promise<void> {
		const trustId = await this.trusted.remove(userId);
		if (!trustId) return;
		try {
			await this.forgetTrustOnServer(userId, trustId);
		} catch {
			// Sin red: el servidor la purgará sola. La fila local ya no existe.
		}
	}

	/** Activa o desactiva el recuerdo de la clave en este dispositivo. */
	async setRemember(remember: boolean): Promise<void> {
		if (!this.vault || this.status !== 'unlocked') return;
		if (remember) await this.store.save(this.vault.userId, this.vault.requireKey());
		else await this.store.remove(this.vault.userId);
	}

	/**
	 * Cierra la sesión: olvida la clave de la memoria y la guardada en el dispositivo. La confianza se
	 * conserva salvo que se pida `forgetTrust: true` (la app la borra al «olvidar este dispositivo»).
	 */
	async signOut(options: { forgetTrust?: boolean } = {}): Promise<void> {
		const userId = this.vault?.userId;
		await this.lockDevice();
		if (userId && options.forgetTrust) await this.forgetTrust(userId);
		this.vault = null;
	}
}
