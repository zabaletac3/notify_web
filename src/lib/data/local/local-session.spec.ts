import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '#lib/app/index.js';
import { createDemoVault } from '../mock/demo-vault.js';
import { createLocalBackend } from './create-local-backend.js';

const NOW = new Date('2026-10-07T12:00:00.000Z');
let seq = 0;
const dbName = () => `sess-${++seq}`;

/** Un dispositivo de la cuenta de ejemplo con la app desbloqueada. */
async function localBackend(name = dbName()) {
	const vault = await createDemoVault();
	return createLocalBackend({ dbName: name, now: () => NOW, vault: () => vault });
}

async function dbNames() {
	return (await indexedDB.databases()).map((d) => d.name);
}

describe('base local por cuenta', () => {
	it('sin sesión no hay base: leer o escribir falla como sesión vencida', async () => {
		const b = await localBackend();
		await expect(b.repos.notes.list()).rejects.toMatchObject({
			error: { kind: 'session-expired' }
		});
		await expect(b.repos.settings.get()).rejects.toMatchObject({
			error: { kind: 'session-expired' }
		});
		const snap = await b.repos.sync.snapshot();
		expect(snap.pendingCount).toBe(0);
	});

	it('otra cuenta no ve las notas de la anterior ni sube sus cambios pendientes', async () => {
		const b = await localBackend();
		await b.local.open('u_a');
		await b.repos.sync.syncNow();
		await b.repos.notes.create({ title: 'Secreta de A', content: 'solo A' });
		expect((await b.repos.sync.snapshot()).pendingCount).toBe(1);

		// La sesión de A vence sin cerrar sesión y entra B en el mismo navegador.
		await b.local.open('u_b');
		expect(await b.repos.notes.list()).toHaveLength(0);
		expect((await b.repos.sync.snapshot()).pendingCount).toBe(0);
		await b.repos.sync.syncNow();
		expect(b.db.notes.some((n) => n.title === 'Secreta de A')).toBe(false);

		// Lo de A sigue intacto y pendiente en su propia base.
		await b.local.open('u_a');
		expect((await b.repos.sync.snapshot()).pendingCount).toBe(1);
	});

	it('una base que pertenece a otra cuenta se borra y se recrea', async () => {
		const name = dbName();
		const first = await localBackend(name);
		await first.local.open('u_a');
		await first.repos.notes.create({ title: 'De A' });
		// Se simula una base corrupta: la de B contiene datos marcados como de A.
		const evil = await localBackend(name);
		await evil.local.open('u_b');
		await evil.local.db.setMeta('userId', 'u_a');
		await evil.repos.notes.create({ title: 'Ajena' });
		evil.local.close();

		const again = await localBackend(name);
		await again.local.open('u_b');
		expect(await again.repos.notes.list()).toHaveLength(0);
		expect(await again.local.db.getMeta('userId')).toBe('u_b');
	});

	it('destroy borra la base por completo y deja el repositorio sin sesión', async () => {
		const name = dbName();
		const b = await localBackend(name);
		await b.local.open('u_a');
		await b.repos.notes.create({ title: 'x' });
		expect(await dbNames()).toContain(`${name}-u_a`);
		await b.local.destroy();
		expect(await dbNames()).not.toContain(`${name}-u_a`);
		await expect(b.repos.notes.list()).rejects.toMatchObject({
			error: { kind: 'session-expired' }
		});
	});
});

describe('sesión en la app', () => {
	// Las apps comparten el canal entre pestañas: se destruyen siempre para que no contaminen otras pruebas.
	const apps: App[] = [];
	afterEach(() => {
		for (const app of apps.splice(0)) app.destroy();
	});
	function newApp(name: string) {
		const app = createApp({ persistence: 'indexeddb', dbName: name, now: () => NOW, latencyMs: 0 });
		apps.push(app);
		return app;
	}
	async function localApp() {
		const name = dbName();
		const app = newApp(name);
		await app.bootstrap();
		return { app, name };
	}

	it('cerrar sesión sin conexión igualmente la cierra y borra la copia local', async () => {
		const { app, name } = await localApp();
		expect(app.notes.all.length).toBeGreaterThan(0);
		const dbId = `${name}-${app.auth.user!.id}`;
		expect(await dbNames()).toContain(dbId);

		app.scenario.offline = true;
		const result = await app.auth.logout();
		expect(result.ok).toBe(true);
		expect(app.auth.status).toBe('anonymous');
		expect(app.notes.all).toHaveLength(0);
		expect(await dbNames()).not.toContain(dbId);
	});

	it('dispositivo revocado: cierra sesión, borra la copia local y avisa', async () => {
		const { app, name } = await localApp();
		const dbId = `${name}-${app.auth.user!.id}`;
		app.scenario.deviceRevoked = true;
		await app.sync.syncNow();
		expect(app.auth.status).toBe('anonymous');
		expect(app.auth.notice).toBe('device-revoked');
		await vi.waitFor(async () => expect(await dbNames()).not.toContain(dbId));
		expect(app.notes.all).toHaveLength(0);
	});

	it('hay cambios pendientes que avisar antes de salir', async () => {
		const { app } = await localApp();
		app.scenario.offline = true;
		await app.notes.create();
		await app.sync.refresh();
		expect(app.sync.pendingCount).toBeGreaterThan(0);
	});

	it('cerrar sesión en una pestaña la cierra en las demás', async () => {
		const first = await localApp();
		const other = newApp(first.name);
		await other.bootstrap();
		expect(other.auth.isAuthenticated).toBe(true);

		await first.app.auth.logout();
		await new Promise((r) => setTimeout(r, 50));
		expect(other.auth.status).toBe('anonymous');
		expect(other.auth.notice).toBe('signed-out-elsewhere');
	});
});
