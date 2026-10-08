import { CryptoFormatError, fromB64u, toB64u } from './bytes.js';
import { open, seal, type Sealed } from './sealed.js';

const AES = { name: 'AES-GCM', length: 256 } as const;
const BOTH: KeyUsage[] = ['encrypt', 'decrypt'];

/** Clave maestra de la cuenta. Es extraíble solo para poder envolverla (con la contraseña o la clave de recuperación). */
export const generateMasterKey = (): Promise<CryptoKey> =>
	crypto.subtle.generateKey(AES, true, BOTH);

/** Clave de una nota o carpeta. */
export const generateItemKey = (): Promise<CryptoKey> => crypto.subtle.generateKey(AES, true, BOTH);

/** Clave del dispositivo: no se puede exportar, solo usar desde este navegador. */
export const generateDeviceKey = (): Promise<CryptoKey> =>
	crypto.subtle.generateKey(AES, false, BOTH);

/** Cifra una clave con otra (exporta los bytes y los sella con AES-GCM). */
export async function wrap(wrapping: CryptoKey, key: CryptoKey, aad: string): Promise<Sealed> {
	const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
	return seal(wrapping, raw, aad);
}

export async function unwrap(
	wrapping: CryptoKey,
	sealed: Sealed,
	aad: string,
	usages: KeyUsage[] = BOTH
): Promise<CryptoKey> {
	const raw = await open(wrapping, sealed, aad);
	if (raw.length !== 32) throw new CryptoFormatError('longitud de clave inválida');
	return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', true, usages);
}

/** La clave de un enlace público, para ponerla en el fragmento de la URL. */
export async function exportRawForShare(key: CryptoKey): Promise<string> {
	return toB64u(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

/** Importa la clave de un enlace público: solo sirve para descifrar. */
export function importRawForShare(b64u: string): Promise<CryptoKey> {
	const raw = fromB64u(b64u);
	if (raw.length !== 32) throw new CryptoFormatError('longitud de clave inválida');
	return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
}
