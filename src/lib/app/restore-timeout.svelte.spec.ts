import { afterEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { createLocalBackend, MockDatabase, type LocalBackend } from '#lib/data/index.js';
import { createClock } from '#lib/test/test-app.js';
import { createApp, type App } from './create-app.svelte.js';

const settle = () => new Promise((r) => setTimeout(r, 30));

/**
 * Punto 4a: al "recargar" (segunda app sobre el mismo servidor y el mismo IndexedDB) con
 * `lockOnExit = false`, la clave guardada se restaura solo si no pasó el tiempo de bloqueo.
 * Necesita el navegador porque usa `$effect` (la actividad se escribe al desbloquear).
 */
describe('recarga con "bloquear al salir" desactivado', () => {
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

	/** Deja una cuenta con la sesión iniciada y la clave guardada en el dispositivo. */
	async function signedIn(
		server: MockDatabase,
		name: string,
		clock: ReturnType<typeof createClock>
	) {
		const app = await createAppOn(server, name, clock);
		await app.bootstrap();
		await app.auth.register({
			fullName: 'Luis Gómez',
			email: 'luis@correo.com',
			password: 'Secret123!',
			acceptedTerms: true
		});
		await app.auth.verify('123456');
		flushSync();
		await settle();
		await app.settings.update({ lockOnExit: false });
		await app.vault.setRemember(true);
		return app;
	}

	/** Cierra la app actual y crea otra sobre el mismo servidor y base, como al recargar. */
	async function reload(server: MockDatabase, name: string, clock: ReturnType<typeof createClock>) {
		const first = apps[apps.length - 1];
		(first.backend as LocalBackend).local.close();
		first.destroy();
		apps.pop();
		const app = await createAppOn(server, name, clock);
		await app.bootstrap();
		flushSync();
		await settle();
		return app;
	}

	it('dentro del plazo no pide la contraseña: restaura la clave', async () => {
		const clock = createClock();
		const name = `restore-${Date.now()}-a`;
		const server = new MockDatabase({ now: clock.now, startAuthenticated: false });
		await signedIn(server, name, clock);

		const app = await reload(server, name, clock);
		expect(app.vault.status).toBe('unlocked');
	});

	it('fuera del plazo pide la contraseña y borra la clave guardada', async () => {
		const clock = createClock();
		const name = `restore-${Date.now()}-b`;
		const server = new MockDatabase({ now: clock.now, startAuthenticated: false });
		const first = await signedIn(server, name, clock);
		const userId = first.auth.user!.id;

		clock.advance(2 * 60_000); // el tiempo de bloqueo por defecto es 1 minuto
		const app = await reload(server, name, clock);
		expect(app.vault.status).toBe('locked');
		expect(await app.vault.restore(userId)).toBe(false);
	});
});
