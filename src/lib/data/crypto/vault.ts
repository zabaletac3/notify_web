import { generateItemKey, unwrap, wrap, type Sealed } from '#lib/core/crypto/index.js';
import { fail, type Id, type VaultStatus } from '#lib/domain/index.js';

export type ItemEntity = 'note' | 'folder';

/**
 * Cofre de claves de la sesión: guarda la clave maestra **solo en memoria** y reparte las claves de
 * cada nota y carpeta. Al bloquear se olvida todo. No sabe nada de pantallas (ver `VaultState`).
 */
export class Vault {
	readonly userId: Id;
	private master: CryptoKey | null = null;
	private cache = new Map<string, CryptoKey>();

	constructor(options: { userId: Id }) {
		this.userId = options.userId;
	}

	get status(): VaultStatus {
		return this.master ? 'unlocked' : 'locked';
	}

	/** Datos asociados (AAD) del contenido de un elemento: lo ligan a su cuenta, tipo e id. */
	dataAad(entity: ItemEntity, id: Id): string {
		return `apunte/v1/data/${this.userId}/${entity}/${id}`;
	}

	/** Datos asociados de la clave de un elemento. */
	keyAad(entity: ItemEntity, id: Id): string {
		return `apunte/v1/key/${this.userId}/${entity}/${id}`;
	}

	unlockWith(masterKey: CryptoKey): void {
		this.master = masterKey;
	}

	/** Olvida la clave maestra y todas las de elementos. */
	lock(): void {
		this.master = null;
		this.cache.clear();
	}

	requireKey(): CryptoKey {
		if (!this.master) throw fail.locked();
		return this.master;
	}

	/** Clave nueva para un elemento, ya cifrada con la maestra. */
	async newItemKey(entity: ItemEntity, id: Id): Promise<{ key: CryptoKey; wrapped: Sealed }> {
		const master = this.requireKey();
		const key = await generateItemKey();
		const wrapped = await wrap(master, key, this.keyAad(entity, id));
		this.cache.set(this.cacheKey(entity, id, wrapped), key);
		return { key, wrapped };
	}

	/** Clave de un elemento a partir de la que guarda el servidor. Se recuerda mientras esté desbloqueado. */
	async itemKey(entity: ItemEntity, id: Id, wrapped: Sealed): Promise<CryptoKey> {
		const master = this.requireKey();
		const cacheKey = this.cacheKey(entity, id, wrapped);
		const cached = this.cache.get(cacheKey);
		if (cached) return cached;
		const key = await unwrap(master, wrapped, this.keyAad(entity, id));
		this.cache.set(cacheKey, key);
		return key;
	}

	/** Cambia la clave de un elemento (al revocar un enlace público, o al duplicar). */
	rotateItemKey(entity: ItemEntity, id: Id): Promise<{ key: CryptoKey; wrapped: Sealed }> {
		return this.newItemKey(entity, id);
	}

	private cacheKey(entity: ItemEntity, id: Id, wrapped: Sealed) {
		return `${entity}:${id}:${wrapped}`;
	}
}
