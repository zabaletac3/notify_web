import type { Id } from './ids.js';

/**
 * Texto cifrado con AES-256-GCM: `a1.<iv>.<ct>` (base64url). Se genera y se lee en `core/crypto`;
 * aquí solo es un tipo, porque el dominio no depende de la criptografía.
 */
export type Sealed = string;

/** Parámetros de derivación de la contraseña (Argon2id). Se guardan en el servidor. */
export interface KdfParams {
	alg: 'argon2id';
	memoryKiB: number;
	iterations: number;
	parallelism: number;
	/** 16 bytes aleatorios en base64url. */
	salt: string;
}

/**
 * Lo que el servidor guarda de las claves de una cuenta. Nada de esto permite descifrar sin la
 * contraseña o la clave de recuperación.
 */
export interface KeyBundle {
	kdf: KdfParams;
	/** Clave maestra cifrada con la clave derivada de la contraseña (AAD `apunte/v1/mk/{userId}/password`). */
	wrappedMasterKey: Sealed;
	/** La misma clave maestra, cifrada con la clave de recuperación (AAD `apunte/v1/mk/{userId}/recovery`). */
	recoveryWrappedMasterKey: Sealed;
	/** Sube al cambiar la contraseña o la clave de recuperación. */
	keysVersion: number;
}

/** Estado del cofre de claves en este dispositivo. */
export type VaultStatus = 'locked' | 'unlocking' | 'unlocked';

/** Qué viaja al servidor al registrarse: nunca la contraseña, solo derivados y claves cifradas. */
export interface RegisterKeys {
	/** Lo elige el cliente: el AAD de las claves lo necesita antes de que exista la cuenta. */
	userId: Id;
	/** Derivada de la contraseña (base64url). El servidor guarda un hash de este valor. */
	authKey: string;
	/** Derivada de la clave de recuperación (base64url). El servidor guarda un hash. */
	recoveryAuth: string;
	keys: KeyBundle;
}
