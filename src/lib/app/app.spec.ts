import { describe, expect, it } from 'vitest';
import { fail } from '#lib/domain/index.js';
import { DevicesState, SettingsState } from '#lib/features/settings/index.js';
import { testApp } from '#lib/test/test-app.js';

describe('arranque', () => {
	it('bootstrap carga sesión, ajustes, carpetas, notas y sincronización', async () => {
		const app = await testApp();
		expect(app.auth.status).toBe('authenticated');
		expect(app.settings.status).toBe('ready');
		expect(app.folders.list).toHaveLength(5);
		expect(app.notes.counts.all).toBe(48);
		expect(app.sync.phase).toBe('idle');
		expect(app.sync.lastSyncedAt).toBeTruthy();
	});

	it('resetData cambia de dataset y recarga todo', async () => {
		const app = await testApp();
		await app.notes.create({ title: 'Efímera' });
		await app.resetData('first-time');
		expect(app.notes.isFirstTime).toBe(true);
		expect(app.folders.list).toEqual([]);
		await app.resetData('normal');
		expect(app.notes.counts.all).toBe(48);
		expect(app.notes.filter).toEqual({ kind: 'all' });
	});
});

describe('sincronización y estados del sistema', () => {
	it('sin conexión: las notas se guardan, quedan pendientes y la sincronización marca "offline"', async () => {
		const app = await testApp();
		app.scenario.offline = true;
		await app.sync.refresh();
		expect(app.sync.phase).toBe('offline');
		expect(app.sync.isOffline).toBe(true);

		await app.notes.create({ title: 'Escrita sin red' });
		await app.sync.refresh();
		expect(app.sync.pendingCount).toBe(1);

		const r = await app.sync.syncNow();
		expect(r.ok).toBe(false);
		expect(app.sync.phase).toBe('offline');
		expect(app.sync.pendingCount).toBe(1);
	});

	it('al volver la conexión sincroniza y recarga las notas', async () => {
		const app = await testApp();
		app.scenario.offline = true;
		await app.notes.create({ title: 'Escrita sin red' });
		await app.sync.syncNow();
		expect(app.sync.isOffline).toBe(true);

		app.scenario.offline = false;
		expect((await app.sync.syncNow()).ok).toBe(true);
		expect(app.sync.phase).toBe('idle');
		expect(app.sync.pendingCount).toBe(0);
		expect(app.notes.all.every((n) => n.syncStatus === 'synced')).toBe(true);
	});

	it('error de servidor al sincronizar → fase "error"; al recuperarse vuelve a "idle"', async () => {
		const app = await testApp();
		app.scenario.serverError = true;
		await app.sync.syncNow();
		expect(app.sync.phase).toBe('error');
		app.scenario.serverError = false;
		await app.sync.syncNow();
		expect(app.sync.phase).toBe('idle');
	});

	it('conflicto: aparece, se resuelve de a uno y la lista se actualiza', async () => {
		const app = await testApp();
		app.scenario.injectConflict = true;
		await app.sync.syncNow();
		const conflict = app.sync.firstConflict!;
		expect(conflict).toBeTruthy();
		expect(app.notes.all.find((n) => n.id === conflict.noteId)?.syncStatus).toBe('conflict');

		const before = app.notes.counts.all;
		expect((await app.sync.resolve(conflict.noteId, 'both')).ok).toBe(true);
		expect(app.sync.firstConflict).toBeNull();
		expect(app.notes.counts.all).toBe(before + 1);
		expect(app.notes.all.some((n) => n.syncStatus === 'conflict')).toBe(false);
	});

	it('sesión expirada: una llamada remota marca la sesión como vencida', async () => {
		const app = await testApp();
		app.scenario.sessionExpired = true;
		await app.sync.syncNow();
		expect(app.auth.status).toBe('expired');
		expect(app.sync.lastError).toBeNull(); // no es un error de red: es de sesión
	});

	it('volver a iniciar sesión tras expirar restablece la sesión', async () => {
		const app = await testApp();
		app.scenario.sessionExpired = true;
		await app.auth.bootstrap();
		expect(app.auth.status).toBe('expired');
		app.scenario.sessionExpired = false;
		const r = await app.auth.login({ email: 'ana@correo.com', password: 'Secret123!' });
		expect(r.ok).toBe(true);
		expect(app.auth.status).toBe('authenticated');
	});
});

describe('carpetas', () => {
	it('valida en el cliente: vacío y repetido no llegan al repositorio', async () => {
		const app = await testApp();
		expect((await app.folders.create('  ')).ok).toBe(false);
		const dup = await app.folders.create('universidad');
		expect(dup).toEqual({
			ok: false,
			error: { kind: 'validation', fields: { name: 'name-taken' } }
		});
		expect(app.folders.list).toHaveLength(5);
	});

	it('crea, renombra y resuelve el nombre por id', async () => {
		const app = await testApp();
		const created = await app.folders.create('Viajes');
		expect(created.ok).toBe(true);
		const id = created.ok ? created.value.id : '';
		expect(app.folders.name(id)).toBe('Viajes');
		await app.folders.rename(id, 'Viajes 2026');
		expect(app.folders.name(id)).toBe('Viajes 2026');
		expect(app.folders.name(null)).toBe('Sin carpeta');
	});

	it('al borrar una carpeta las notas pasan a "sin carpeta" y los conteos se actualizan', async () => {
		const app = await testApp();
		const ideas = app.folders.list.find((f) => f.name === 'Ideas')!;
		expect(app.notes.counts.byFolder[ideas.id]).toBe(5);
		await app.folders.remove(ideas.id);
		expect(app.folders.list.some((f) => f.id === ideas.id)).toBe(false);
		expect(app.notes.counts.byFolder[ideas.id]).toBeUndefined();
		expect(app.notes.counts.unfiled).toBe(23);
	});
});

describe('ajustes y dispositivos', () => {
	it('guarda un ajuste y lo conserva', async () => {
		const app = await testApp();
		await app.settings.update({ wifiOnly: true });
		expect(app.settings.values.wifiOnly).toBe(true);
		await app.settings.load();
		expect(app.settings.values.wifiOnly).toBe(true);
	});

	it('revierte el ajuste si no se pudo guardar', async () => {
		const app = await testApp();
		const failing = new SettingsState(
			Object.assign(Object.create(app.backend.repos.settings), {
				update: async () => {
					throw fail.server();
				}
			})
		);
		await failing.load();
		const r = await failing.update({ theme: 'dark' });
		expect(r.ok).toBe(false);
		expect(failing.values.theme).toBe('system');
		expect(failing.lastError?.kind).toBe('server');
	});

	it('lista dispositivos separando el actual y permite quitar otro', async () => {
		const app = await testApp();
		await app.devices.load();
		expect(app.devices.current?.name).toBe('Laptop Fedora');
		expect(app.devices.others.map((d) => d.name)).toEqual(['Pixel 8', 'PC de la universidad']);
		await app.devices.remove('d_pixel');
		expect(app.devices.others).toHaveLength(1);
		expect((await app.devices.remove('d_laptop')).ok).toBe(false);
	});

	it('sin conexión la lista de dispositivos falla con error de red', async () => {
		const app = await testApp();
		app.scenario.offline = true;
		const r = await new DevicesState(app.backend.repos.devices).load();
		expect(r.ok).toBe(false);
	});
});

describe('compartir', () => {
	it('crea el enlace de una nota y lo revoca', async () => {
		const app = await testApp();
		const id = app.notes.visible[0].id;
		const r = await app.share.create(id);
		expect(r.ok && r.value.url).toMatch(/^https:\/\/apunte\.app\/n\//);
		expect(app.share.linkFor(id)).not.toBeNull();
		await app.share.revoke(id);
		expect(app.share.linkFor(id)).toBeNull();
	});

	it('sin conexión no se puede crear el enlace', async () => {
		const app = await testApp();
		app.scenario.offline = true;
		const r = await app.share.create(app.notes.visible[0].id);
		expect(r.ok).toBe(false);
		expect(app.share.error?.kind).toBe('network');
	});

	it('con la sesión vencida avisa a la sesión', async () => {
		const app = await testApp();
		app.scenario.sessionExpired = true;
		await app.share.create(app.notes.visible[0].id);
		expect(app.auth.status).toBe('expired');
	});
});
