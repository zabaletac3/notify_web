import { succeed, toAppError, type ActionResult } from '#lib/domain/index.js';

/** Ejecuta una acción asíncrona y devuelve éxito o error tipado, sin lanzar. */
export async function attempt<T>(action: () => Promise<T>): Promise<ActionResult<T>> {
	try {
		return succeed(await action());
	} catch (e) {
		return { ok: false, error: toAppError(e) };
	}
}
