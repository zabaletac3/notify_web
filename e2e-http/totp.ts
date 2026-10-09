import { createHmac } from 'node:crypto';

/**
 * Ayudante TOTP (RFC 6238: HMAC-SHA-1, 6 dígitos, 30 s) para las pruebas contra la API real.
 * El secreto llega en base32 sin relleno (así lo devuelve `POST /mfa/totp/setup`).
 */
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(secret: string): Buffer {
	const clean = secret.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const ch of clean) {
		const idx = BASE32.indexOf(ch);
		if (idx === -1) throw new Error(`base32 inválido: ${ch}`);
		value = (value << 5) | idx;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}
	return Buffer.from(out);
}

/** Paso TOTP (30 s) de un instante dado. */
export function step(at: number = Date.now()): number {
	return Math.floor(at / 1000 / 30);
}

/** Código TOTP de 6 dígitos para un paso (por defecto, el actual). */
export function totp(secret: string, at: number = Date.now()): string {
	const counter = step(at);
	const msg = Buffer.alloc(8);
	msg.writeBigInt64BE(BigInt(counter));
	const mac = createHmac('sha1', base32Decode(secret)).update(msg).digest();
	const offset = mac[mac.length - 1] & 0x0f;
	const binary =
		((mac[offset] & 0x7f) << 24) |
		((mac[offset + 1] & 0xff) << 16) |
		((mac[offset + 2] & 0xff) << 8) |
		(mac[offset + 3] & 0xff);
	return String(binary % 1_000_000).padStart(6, '0');
}

/** Código y paso actuales, calculados del mismo instante (sin carreras en el cambio de ventana). */
export function currentCode(secret: string): { code: string; step: number } {
	const s = step();
	return { code: totp(secret, s * 30_000), step: s };
}

/**
 * Devuelve un código TOTP de un paso **posterior** a `usedStep`. La API rechaza reutilizar un paso
 * (`last_step`): tras usar un código al activar, hay que esperar a la siguiente ventana de 30 s.
 */
export async function totpForNewStep(
	secret: string,
	usedStep: number
): Promise<{ code: string; step: number }> {
	if (step() <= usedStep) {
		const waitMs = (usedStep + 1) * 30_000 - Date.now() + 500;
		if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
	}
	return currentCode(secret);
}
