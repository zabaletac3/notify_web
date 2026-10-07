/** Identificador opaco (UUID en datos reales, `n_1`… en los datos simulados). */
export type Id = string;

/** Fecha y hora en formato ISO 8601 (UTC), p. ej. `2026-10-07T08:54:00.000Z`. */
export type IsoDate = string;

/**
 * Identificador nuevo para notas y carpetas: UUID v7 (los 48 bits altos son la hora, así que
 * ordenan por creación). Lo genera el cliente para poder crear sin conexión.
 */
export function newId(timestampMs: number = Date.now()): Id {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	let t = timestampMs;
	for (let i = 5; i >= 0; i--) {
		bytes[i] = t % 256;
		t = Math.floor(t / 256);
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x70; // versión 7
	bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
	const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
