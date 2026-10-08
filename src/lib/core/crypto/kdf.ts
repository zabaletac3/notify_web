import { argon2id } from 'hash-wasm';
import { concatBytes, fromB64u, randomBytes, toB64u, utf8 } from './bytes.js';

/** Parámetros de derivación de una cuenta. Se guardan en el servidor para poder subirlos en el futuro. */
export interface KdfParams {
	alg: 'argon2id';
	memoryKiB: number;
	iterations: number;
	parallelism: number;
	/** 16 bytes aleatorios en base64url. No depende del correo. */
	salt: string;
}

export const DEFAULT_KDF: Omit<KdfParams, 'salt'> = {
	alg: 'argon2id',
	memoryKiB: 65536,
	iterations: 3,
	parallelism: 1
};

/** Parámetros ligeros (1 MiB, 1 iteración): solo para desarrollo y pruebas, nunca en producción. */
export const LIGHT_KDF: Omit<KdfParams, 'salt'> = {
	alg: 'argon2id',
	memoryKiB: 1024,
	iterations: 1,
	parallelism: 1
};

const SALT_BYTES = 16;

export function newKdfParams(base: Omit<KdfParams, 'salt'> = DEFAULT_KDF): KdfParams {
	return { ...base, salt: toB64u(randomBytes(SALT_BYTES)) };
}

export interface DerivedKeys {
	/** Lo que se envía al servidor en lugar de la contraseña (base64url). */
	authKey: string;
	/** Clave que envuelve la clave maestra. No sale del cliente. */
	kek: CryptoKey;
}

type Argon2Impl = (password: string, salt: Uint8Array, params: KdfParams) => Promise<Uint8Array>;

/** Argon2id en un worker si hay navegador; directo en pruebas y entornos sin `Worker`. */
const defaultArgon2: Argon2Impl = async (password, salt, params) => {
	if (typeof Worker !== 'undefined' && import.meta.env?.MODE !== 'test') {
		const worker = new Worker(new URL('./kdf.worker.ts', import.meta.url), { type: 'module' });
		try {
			return await new Promise<Uint8Array>((resolve, reject) => {
				worker.onmessage = (e: MessageEvent<Uint8Array>) => resolve(e.data);
				worker.onerror = (e) => reject(new Error(e.message));
				worker.postMessage({
					password: utf8(password.normalize('NFKC')),
					salt,
					memoryKiB: params.memoryKiB,
					iterations: params.iterations,
					parallelism: params.parallelism
				});
			});
		} finally {
			worker.terminate();
		}
	}
	return argon2id({
		password: utf8(password.normalize('NFKC')),
		salt,
		memorySize: params.memoryKiB,
		iterations: params.iterations,
		parallelism: params.parallelism,
		hashLength: 32,
		outputType: 'binary'
	});
};

let argon2: Argon2Impl = defaultArgon2;

/** Sustituye Argon2id (pruebas con parámetros ligeros, o un falso). `null` restaura el real. */
export function setArgon2Impl(impl: Argon2Impl | null): void {
	argon2 = impl ?? defaultArgon2;
}

const ZERO_SALT = new Uint8Array(32);

async function hkdfBits(base: CryptoKey, info: string): Promise<string> {
	const bits = await crypto.subtle.deriveBits(
		{ name: 'HKDF', hash: 'SHA-256', salt: ZERO_SALT, info: utf8(info) },
		base,
		256
	);
	return toB64u(new Uint8Array(bits));
}

function hkdfAesKey(base: CryptoKey, info: string): Promise<CryptoKey> {
	return crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: ZERO_SALT, info: utf8(info) },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

const importHkdf = (raw: Uint8Array) =>
	crypto.subtle.importKey('raw', raw as BufferSource, 'HKDF', false, ['deriveBits', 'deriveKey']);

/** Contraseña → `authKey` (para el servidor) y `kek` (para la clave maestra). Nunca viaja la contraseña. */
export async function deriveFromPassword(
	password: string,
	params: KdfParams
): Promise<DerivedKeys> {
	const stretched = await argon2(password, fromB64u(params.salt), params);
	const base = await importHkdf(stretched);
	const [authKey, kek] = await Promise.all([
		hkdfBits(base, 'apunte/v1/auth'),
		hkdfAesKey(base, 'apunte/v1/kek')
	]);
	return { authKey, kek };
}

/** Clave de recuperación → prueba para el servidor y clave que envuelve la clave maestra. */
export async function deriveFromRecoveryKey(
	recoveryKey: Uint8Array
): Promise<{ recoveryAuth: string; rkWrap: CryptoKey }> {
	const base = await importHkdf(concatBytes(recoveryKey));
	const [recoveryAuth, rkWrap] = await Promise.all([
		hkdfBits(base, 'apunte/v1/recovery-auth'),
		hkdfAesKey(base, 'apunte/v1/recovery-kek')
	]);
	return { recoveryAuth, rkWrap };
}
