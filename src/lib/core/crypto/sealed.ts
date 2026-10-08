import { CryptoFormatError, fromB64u, randomBytes, toB64u, utf8 } from './bytes.js';

/** Texto cifrado con AES-256-GCM: `a1.<iv>.<ct>` (base64url; `ct` incluye la etiqueta de 16 bytes). */
export type Sealed = string;

/** La etiqueta GCM no coincide: clave incorrecta, datos asociados distintos o texto alterado. */
export class DecryptError extends Error {
	constructor() {
		super('no se pudo descifrar');
		this.name = 'DecryptError';
	}
}

const SEALED = /^a1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;
const IV_BYTES = 12;

export const isSealed = (value: unknown): value is Sealed =>
	typeof value === 'string' && SEALED.test(value);

/**
 * Cifra con un IV aleatorio nuevo. `aad` (datos asociados) liga el texto a su contexto
 * —cuenta, tipo e id—: si el servidor lo mueve a otro sitio, `open` falla.
 */
export async function seal(key: CryptoKey, plaintext: Uint8Array, aad: string): Promise<Sealed> {
	const iv = randomBytes(IV_BYTES);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv, additionalData: utf8(aad) },
		key,
		plaintext as BufferSource
	);
	return `a1.${toB64u(iv)}.${toB64u(new Uint8Array(ciphertext))}`;
}

export async function open(key: CryptoKey, sealed: Sealed, aad: string): Promise<Uint8Array> {
	if (!isSealed(sealed)) throw new CryptoFormatError();
	const [, iv, ciphertext] = sealed.split('.');
	let data: Uint8Array<ArrayBuffer>;
	try {
		data = fromB64u(ciphertext);
	} catch {
		throw new CryptoFormatError();
	}
	try {
		const plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: fromB64u(iv), additionalData: utf8(aad) },
			key,
			data
		);
		return new Uint8Array(plain);
	} catch {
		throw new DecryptError();
	}
}
