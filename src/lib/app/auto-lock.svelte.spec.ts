import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { deviceActiveAtKey } from '#lib/data/index.js';
import { createClock } from '#lib/test/test-app.js';
import { createApp } from './create-app.svelte.js';

const settle = () => new Promise((r) => setTimeout(r, 20));

/**
 * Tiempo de bloqueo por inactividad (punto 3): `never` no bloquea, `1m` bloquea solo, e `immediately`
 * bloquea al ocultar la pestaña. Necesita el navegador porque usa `$effect` y `setTimeout`.
 */
describe('tiempo de bloqueo', () => {
	afterEach(() => vi.useRealTimers());

	async function app() {
		const app = createApp({ latencyMs: 0, autoLock: true });
		await app.bootstrap();
		expect(app.vault.status).toBe('unlocked');
		return app;
	}

	it('"Nunca" no bloquea por mucho que pase el tiempo', async () => {
		const a = await app();
		vi.useFakeTimers();
		await a.settings.update({ lockTimeout: 'never' });
		flushSync();
		await vi.advanceTimersByTimeAsync(30 * 60_000);
		expect(a.vault.status).toBe('unlocked');
		a.destroy();
	});

	it('"1 minuto" bloquea tras un minuto sin actividad', async () => {
		const a = await app();
		vi.useFakeTimers();
		await a.settings.update({ lockTimeout: '1m' });
		flushSync();
		await vi.advanceTimersByTimeAsync(59_000);
		expect(a.vault.status).toBe('unlocked');
		await vi.advanceTimersByTimeAsync(2_000);
		expect(a.vault.status).toBe('locked');
		a.destroy();
	});

	it('al ocultar y cerrar la pestaña guarda la última actividad real sin esperar los 15 s', async () => {
		const clock = createClock();
		const a = createApp({ latencyMs: 0, autoLock: true, now: clock.now });
		try {
			await a.bootstrap();
			flushSync();
			await settle();
			const userId = a.vault.userId!;
			const activeAt = () =>
				JSON.parse(localStorage.getItem(deviceActiveAtKey(userId)) ?? 'null') as number | null;
			expect(activeAt()).toBe(clock.now().getTime());

			// Actividad a los 5 s (por debajo del límite de 15 s): todavía no se escribe.
			const start = clock.now().getTime();
			clock.advance(5_000);
			window.dispatchEvent(new Event('pointerdown'));
			const lastActivity = clock.now().getTime();
			expect(activeAt()).toBe(start);

			// Ocultar la pestaña 3 s después guarda esa actividad, no el instante de ocultar.
			clock.advance(3_000);
			Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
			document.dispatchEvent(new Event('visibilitychange'));
			expect(activeAt()).toBe(lastActivity);

			// Y al cerrar la pestaña, igual: sin actividad nueva, el dato no avanza.
			clock.advance(5_000);
			window.dispatchEvent(new Event('pagehide'));
			expect(activeAt()).toBe(lastActivity);
		} finally {
			delete (document as unknown as Record<string, unknown>).hidden;
			a.destroy();
		}
	});

	it('"Inmediatamente" bloquea al ocultar la pestaña', async () => {
		const a = await app();
		await a.settings.update({ lockTimeout: 'immediately' });
		flushSync();
		await settle();
		try {
			Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
			document.dispatchEvent(new Event('visibilitychange'));
			expect(a.vault.status).toBe('locked');
		} finally {
			delete (document as unknown as Record<string, unknown>).hidden;
		}
		a.destroy();
	});
});
