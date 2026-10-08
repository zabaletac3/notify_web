import { CryptoFormatError, randomBytes } from './bytes.js';

/** Alfabeto Crockford base32 (sin I, L, O, U) + símbolos de control de Crockford. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CHECK_SYMBOLS = ALPHABET + '*~$=U';
const KEY_BYTES = 32;
const CHARS = 52; // ceil(256 / 5)

export const generateRecoveryKey = (): Uint8Array<ArrayBuffer> => randomBytes(KEY_BYTES);

const toBigInt = (bytes: Uint8Array) => bytes.reduce((n, b) => (n << 8n) | BigInt(b), 0n);

/** Texto legible: 52 caracteres base32 + 1 de control, en grupos de 4 separados por «-». */
export function formatRecoveryKey(key: Uint8Array): string {
	if (key.length !== KEY_BYTES) throw new CryptoFormatError('longitud inválida');
	const n = toBigInt(key) << 4n; // 256 bits → 260 bits (52 × 5)
	let text = '';
	for (let i = CHARS - 1; i >= 0; i--) text += ALPHABET[Number((n >> BigInt(i * 5)) & 31n)];
	text += CHECK_SYMBOLS[Number(toBigInt(key) % 37n)];
	return text.match(/.{1,4}/g)!.join('-');
}

/** Lee lo que escribió una persona: tolera minúsculas, espacios, guiones y O→0, I/L→1. */
export function parseRecoveryKey(text: string): Uint8Array<ArrayBuffer> {
	const clean = text.toUpperCase().replace(/[\s-]/g, '').replaceAll('O', '0').replace(/[IL]/g, '1');
	if (clean.length !== CHARS + 1) throw new CryptoFormatError('longitud inválida');

	let n = 0n;
	for (const char of clean.slice(0, CHARS)) {
		const value = ALPHABET.indexOf(char);
		if (value < 0) throw new CryptoFormatError('carácter inválido');
		n = (n << 5n) | BigInt(value);
	}
	if ((n & 15n) !== 0n) throw new CryptoFormatError('relleno inválido');
	n >>= 4n;

	const key = new Uint8Array(KEY_BYTES);
	for (let i = KEY_BYTES - 1; i >= 0; i--) {
		key[i] = Number(n & 255n);
		n >>= 8n;
	}
	if (CHECK_SYMBOLS[Number(toBigInt(key) % 37n)] !== clean[CHARS])
		throw new CryptoFormatError('dígito de control incorrecto');
	return key;
}
