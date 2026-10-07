import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { createApp } from './create-app.svelte.js';

/**
 * Los interruptores del simulador deben reflejarse solos en el estado (sin que nadie recargue).
 * Necesita el navegador porque usa $effect.
 */
describe('reacción a los escenarios (en el navegador)', () => {
	const settle = () => new Promise((r) => setTimeout(r, 20));

	it('al activar "sin conexión" la sincronización pasa a offline y al desactivar vuelve', async () => {
		const app = createApp({ latencyMs: 0 });
		await app.bootstrap();
		expect(app.sync.phase).toBe('idle');

		app.scenario.offline = true;
		flushSync();
		await settle();
		expect(app.sync.phase).toBe('offline');

		app.scenario.offline = false;
		flushSync();
		await settle();
		expect(app.sync.phase).toBe('idle');
		app.destroy();
	});

	it('al activar "sesión expirada" la sesión pasa a expired y al quitarla se recupera', async () => {
		const app = createApp({ latencyMs: 0 });
		await app.bootstrap();
		expect(app.auth.status).toBe('authenticated');

		app.scenario.sessionExpired = true;
		flushSync();
		await settle();
		expect(app.auth.status).toBe('expired');

		app.scenario.sessionExpired = false;
		flushSync();
		await settle();
		expect(app.auth.status).toBe('authenticated');
		app.destroy();
	});
});
