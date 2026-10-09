import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { createLocalBackend, MockDatabase, type LocalBackend } from '#lib/data/index.js';
import { createClock } from '#lib/test/test-app.js';
import { createApp, type App } from './create-app.svelte.js';

const settle = () => new Promise((r) => setTimeout(r, 30));

/**
 * Bug 4b: al recargar con el cofre bloqueado (lockOnExit activado), `bootstrap()` no debe dejar las
 * notas en error; al desbloquear con la contraseña, deben volver a cargarse solas.
 * Se simula la recarga con una segunda app sobre el mismo servidor e IndexedDB (navegador: `$effect`).
 */
describe('arranque con el cofre bloqueado', () => {
	const apps: App[] = [];
	afterEach(() => {
		for (const app of apps.splice(0)) {
			try {
				(app.backend as LocalBackend).local.close();
			} catch {
				// Ya estaba cerrada.
			}
			app.destroy();
		}
	});

	async function createAppOn(
		server: MockDatabase,
		name: string,
		clock: ReturnType<typeof createClock>
	) {
		const ref: { app?: App } = {};
		const backend = createLocalBackend({
			dbName: name,
			now: clock.now,
			server,
			startAuthenticated: false,
			vault: () => ref.app!.vault.current
		});
		const app = createApp({
			backend,
			now: clock.now,
			latencyMs: 0,
			dbName: name,
			startAuthenticated: false
		});
		ref.app = app;
		apps.push(app);
		return app;
	}

	it('al desbloquear tras arrancar bloqueado, las notas quedan listas sin error', async () => {
		const clock = createClock();
		const name = `bug4b-${Date.now()}`;
		const server = new MockDatabase({ now: clock.now, startAuthenticated: false });

		// Primera app: cuenta nueva (no la de ejemplo) con una nota. Se activa `lockOnExit` (modo
		// estricto) para que la clave no quede guardada en el dispositivo.
		const first = await createAppOn(server, name, clock);
		await first.bootstrap();
		await first.auth.register({
			fullName: 'Luis Gómez',
			email: 'luis@correo.com',
			password: 'Secret123!',
			acceptedTerms: true
		});
		await first.auth.verify('123456');
		flushSync();
		await settle();
		expect(first.vault.status).toBe('unlocked');
		await first.settings.update({ lockOnExit: true });
		await first.vault.setRemember(false);
		expect((await first.notes.create({ title: 'Secreta', content: 'hola' })).ok).toBe(true);
		flushSync();
		await settle();

		// "Recarga": otra app sobre el mismo servidor y la misma base local.
		(first.backend as LocalBackend).local.close();
		first.destroy();
		apps.pop();
		const app = await createAppOn(server, name, clock);
		await app.bootstrap();
		flushSync();
		await settle();
		expect(app.auth.isLocked).toBe(true);

		expect((await app.auth.unlock('Secret123!')).ok).toBe(true);
		flushSync();
		// La recarga es asíncrona (varios `await`); bajo carga puede tardar algo más que unos ms.
		await vi.waitFor(() => expect(app.notes.status).toBe('ready'), { timeout: 5000 });
		expect(app.notes.error).toBeNull();
	});
});
