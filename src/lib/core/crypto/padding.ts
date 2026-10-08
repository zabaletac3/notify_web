import { fromUtf8 } from './bytes.js';

/** Rellena con espacios (0x20) hasta el siguiente múltiplo de `block`, para no revelar el tamaño exacto. */
export function pad(bytes: Uint8Array, block = 256): Uint8Array<ArrayBuffer> {
	const size = Math.max(1, Math.ceil(bytes.length / block)) * block;
	const out = new Uint8Array(size).fill(0x20);
	out.set(bytes);
	return out;
}

/** Quita el relleno de un JSON (que nunca termina en espacio). */
export const unpadJson = (bytes: Uint8Array): string => fromUtf8(bytes).trimEnd();
