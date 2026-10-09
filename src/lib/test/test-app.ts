import { createApp, type App } from '#lib/app/index.js';
import type { Dataset } from '#lib/data/index.js';

export const TEST_NOW = new Date('2026-10-07T12:00:00.000Z');

/** Reloj mutable para pruebas (permite "avanzar el tiempo"). */
export function createClock(start: Date = TEST_NOW) {
	let t = start.getTime();
	return {
		now: () => new Date(t),
		advance: (ms: number) => {
			t += ms;
		}
	};
}

/** App completa sobre el backend simulado, sin latencia y con reloj fijo. Carga los datos al crearla. */
export async function testApp(
	options: {
		dataset?: Dataset;
		startAuthenticated?: boolean;
		now?: () => Date;
		load?: boolean;
		/** `indexeddb` permite reproducir bloqueo y persistencia reales; por defecto `memory`. */
		persistence?: 'memory' | 'indexeddb';
		dbName?: string;
	} = {}
): Promise<App> {
	const app = createApp({
		now: options.now ?? (() => TEST_NOW),
		latencyMs: 0,
		startAuthenticated: options.startAuthenticated ?? true,
		persistence: options.persistence,
		dbName: options.dbName
	});
	if (options.dataset && options.dataset !== 'normal') app.scenario.dataset = options.dataset;
	app.backend.db.reset();
	if (options.load !== false) await app.bootstrap();
	return app;
}
