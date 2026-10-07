import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { TRASH_RETENTION_DAYS, type Note } from '#lib/domain/index.js';
import { MockDatabase } from '../mock/mock-database.js';
import { createLocalBackend, type LocalBackend } from './create-local-backend.js';

let seq = 0;
const NOW = new Date('2026-10-07T12:00:00.000Z');

/** Un dispositivo nuevo (base local vacía) contra un servidor, que puede ser compartido. */
function device(name: string, server?: MockDatabase, now: () => Date = () => NOW): LocalBackend {
	return createLocalBackend({
		dbName: `test-${++seq}`,
		server,
		now,
		device: { id: `d_${name}`, name }
	});
}

const notesOf = (b: LocalBackend) => b.repos.notes.list();
const byTitle = async (b: LocalBackend, title: string) =>
	(await notesOf(b)).find((n) => n.title === title) as Note;
const serverNote = (b: LocalBackend, id: string) => b.db.notes.find((n) => n.id === id);

describe('primera sincronización', () => {
	it('un dispositivo nuevo descarga todo el servidor', async () => {
		const a = device('a');
		expect(await notesOf(a)).toHaveLength(0);
		await a.repos.sync.syncNow();
		expect(await notesOf(a)).toHaveLength(48);
		expect(await a.repos.folders.list()).toHaveLength(5);
		expect(await a.repos.notes.list({ filter: { kind: 'trash' } })).toHaveLength(3);
		const snap = await a.repos.sync.snapshot();
		expect(snap.pendingCount).toBe(0);
		expect(snap.lastSyncedAt).not.toBeNull();
	});

	it('una segunda sincronización no cambia nada', async () => {
		const a = device('a');
		await a.repos.sync.syncNow();
		const before = await notesOf(a);
		await a.repos.sync.syncNow();
		expect(await notesOf(a)).toEqual(before);
	});
});

describe('escritura sin conexión', () => {
	it('crear y editar deja un solo cambio pendiente que sube al sincronizar', async () => {
		const a = device('a');
		await a.repos.sync.syncNow();
		const note = await a.repos.notes.create({ title: 'Idea', content: 'uno' });
		expect(note.revision).toBe(0);
		await a.repos.notes.update(note.id, { content: 'uno dos' });
		await a.repos.notes.update(note.id, { content: 'uno dos tres' });
		expect((await a.repos.sync.snapshot()).pendingCount).toBe(1);
		expect(serverNote(a, note.id)).toBeUndefined();

		await a.repos.sync.syncNow();
		const remote = serverNote(a, note.id);
		expect(remote?.content).toBe('uno dos tres');
		expect(remote?.revision).toBe(1);
		const local = await a.repos.notes.get(note.id);
		expect(local.revision).toBe(1);
		expect(local.syncStatus).toBe('synced');
		expect((await a.repos.sync.snapshot()).pendingCount).toBe(0);
	});

	it('crear y borrar antes de sincronizar no manda nada al servidor', async () => {
		const a = device('a');
		await a.repos.sync.syncNow();
		const note = await a.repos.notes.create({ title: 'Efímera' });
		await a.repos.notes.moveToTrash(note.id);
		await a.repos.notes.deleteForever(note.id);
		expect((await a.repos.sync.snapshot()).pendingCount).toBe(0);
		await a.repos.sync.syncNow();
		expect(serverNote(a, note.id)).toBeUndefined();
	});

	it('sin red falla la sincronización pero se puede seguir escribiendo', async () => {
		const a = device('a');
		await a.repos.sync.syncNow();
		a.scenario.offline = true;
		await expect(a.repos.sync.syncNow()).rejects.toMatchObject({ error: { kind: 'network' } });
		const note = await a.repos.notes.create({ title: 'Sin red' });
		expect((await a.repos.sync.snapshot()).phase).toBe('offline');
		expect((await a.repos.sync.snapshot()).pendingCount).toBe(1);

		a.scenario.offline = false;
		await a.repos.sync.syncNow();
		expect(serverNote(a, note.id)?.title).toBe('Sin red');
		expect((await a.repos.sync.snapshot()).pendingCount).toBe(0);
	});

	it('si se edita mientras se sincroniza, el cambio nuevo queda pendiente', async () => {
		const a = device('a');
		await a.repos.sync.syncNow();
		const note = await a.repos.notes.create({ title: 'En vuelo', content: 'v1' });
		const original = a.local.server.sync.bind(a.local.server);
		a.local.server.sync = async (req) => {
			const response = await original(req);
			await a.repos.notes.update(note.id, { content: 'v2' }); // el usuario sigue escribiendo
			return response;
		};
		await a.repos.sync.syncNow();
		const local = await a.repos.notes.get(note.id);
		expect(local.content).toBe('v2');
		expect(local.syncStatus).toBe('pending');
		expect(local.revision).toBe(1);
		expect((await a.repos.sync.snapshot()).pendingCount).toBe(1);

		a.local.server.sync = original;
		await a.repos.sync.syncNow();
		expect(serverNote(a, note.id)?.content).toBe('v2');
		expect(serverNote(a, note.id)?.revision).toBe(2);
		expect((await a.repos.sync.snapshot()).pendingCount).toBe(0);
	});
});

describe('dos dispositivos', () => {
	async function pair() {
		const a = device('a');
		await a.repos.sync.syncNow();
		const b = device('b', a.db);
		await b.repos.sync.syncNow();
		return { a, b };
	}

	it('los cambios de uno llegan al otro', async () => {
		const { a, b } = await pair();
		const note = await a.repos.notes.create({ title: 'Compartida', content: 'hola' });
		await a.repos.notes.update((await byTitle(a, 'Resumen: Bases de datos II')).id, {
			pinned: true
		});
		await a.repos.sync.syncNow();
		await b.repos.sync.syncNow();
		expect((await b.repos.notes.get(note.id)).content).toBe('hola');
		expect((await byTitle(b, 'Resumen: Bases de datos II')).pinned).toBe(true);
	});

	it('papelera, restaurar y borrado definitivo se propagan', async () => {
		const { a, b } = await pair();
		const target = await byTitle(a, 'Ideas para la exposición');
		await a.repos.notes.moveToTrash(target.id);
		await a.repos.sync.syncNow();
		await b.repos.sync.syncNow();
		expect((await b.repos.notes.get(target.id)).deletedAt).not.toBeNull();

		await a.repos.notes.restore(target.id);
		await a.repos.sync.syncNow();
		await b.repos.sync.syncNow();
		expect((await b.repos.notes.get(target.id)).deletedAt).toBeNull();

		await a.repos.notes.moveToTrash(target.id);
		await a.repos.notes.deleteForever(target.id);
		await a.repos.sync.syncNow();
		await b.repos.sync.syncNow();
		await expect(b.repos.notes.get(target.id)).rejects.toMatchObject({
			error: { kind: 'not-found' }
		});
	});

	it('borrar una carpeta deja sus notas sin carpeta en el otro dispositivo', async () => {
		const { a, b } = await pair();
		const [folder] = (await a.repos.folders.list()).filter((f) => f.name === 'Universidad');
		await a.repos.folders.delete(folder.id);
		await a.repos.sync.syncNow();
		await b.repos.sync.syncNow();
		expect((await b.repos.folders.list()).some((f) => f.id === folder.id)).toBe(false);
		const note = await byTitle(b, 'Resumen: Bases de datos II');
		expect(note.folderId).toBeNull();
	});

	it('una carpeta creada y renombrada sin conexión llega al servidor', async () => {
		const { a, b } = await pair();
		const folder = await a.repos.folders.create('Proyectos 2');
		await a.repos.folders.rename(folder.id, 'Proyectos nuevos');
		await a.repos.sync.syncNow();
		await b.repos.sync.syncNow();
		expect((await b.repos.folders.list()).map((f) => f.name)).toContain('Proyectos nuevos');
	});

	describe('conflictos', () => {
		async function conflict() {
			const { a, b } = await pair();
			const id = (await byTitle(a, 'Resumen: Bases de datos II')).id;
			await a.repos.notes.update(id, { content: 'versión de A' });
			await b.repos.notes.update(id, { content: 'versión de B' });
			await a.repos.sync.syncNow(); // A llega primero
			const snap = await b.repos.sync.syncNow(); // B choca
			return { a, b, id, snap };
		}

		it('editar la misma nota en dos dispositivos produce un conflicto, sin pisar nada', async () => {
			const { a, b, id, snap } = await conflict();
			expect(snap.conflicts).toHaveLength(1);
			expect(snap.conflicts[0].local.content).toBe('versión de B');
			expect(snap.conflicts[0].remote.content).toBe('versión de A');
			expect(snap.conflicts[0].remote.deviceName).toBe('a');
			expect(serverNote(a, id)?.content).toBe('versión de A');
			expect((await b.repos.notes.get(id)).syncStatus).toBe('conflict');
		});

		it('mientras hay conflicto no se vuelve a enviar esa nota', async () => {
			const { b, id } = await conflict();
			let sent = 0;
			const original = b.local.server.sync.bind(b.local.server);
			b.local.server.sync = async (req) => {
				sent += req.changes.filter((c) => c.id === id).length;
				return original(req);
			};
			await b.repos.sync.syncNow();
			expect(sent).toBe(0);
			expect((await b.repos.sync.snapshot()).conflicts).toHaveLength(1);
		});

		it('"local" conserva lo de este dispositivo y gana al sincronizar', async () => {
			const { a, b, id } = await conflict();
			await b.repos.sync.resolveConflict(id, 'local');
			await b.repos.sync.syncNow();
			expect(serverNote(a, id)?.content).toBe('versión de B');
			expect((await b.repos.sync.snapshot()).conflicts).toHaveLength(0);
			expect((await b.repos.notes.get(id)).syncStatus).toBe('synced');
			await a.repos.sync.syncNow();
			expect((await a.repos.notes.get(id)).content).toBe('versión de B');
		});

		it('"remote" descarta lo de este dispositivo', async () => {
			const { b, id } = await conflict();
			await b.repos.sync.resolveConflict(id, 'remote');
			const note = await b.repos.notes.get(id);
			expect(note.content).toBe('versión de A');
			expect(note.syncStatus).toBe('synced');
			expect((await b.repos.sync.snapshot()).pendingCount).toBe(0);
		});

		it('"both" conserva la versión remota y crea una copia con lo local', async () => {
			const { a, b, id } = await conflict();
			await b.repos.sync.resolveConflict(id, 'both');
			await b.repos.sync.syncNow();
			expect((await b.repos.notes.get(id)).content).toBe('versión de A');
			const copy = (await notesOf(b)).find((n) => n.title.endsWith('(conflicto)'));
			expect(copy?.content).toBe('versión de B');
			expect(serverNote(a, copy!.id)?.content).toBe('versión de B');
		});

		it('si la nota cambia otra vez en el servidor, el conflicto muestra la versión más reciente', async () => {
			const { a, b, id } = await conflict();
			await a.repos.notes.update(id, { content: 'versión 2 de A' });
			await a.repos.sync.syncNow();
			await b.repos.sync.syncNow();
			const snap = await b.repos.sync.snapshot();
			expect(snap.conflicts[0].remote.content).toBe('versión 2 de A');
			await b.repos.sync.resolveConflict(id, 'local');
			await b.repos.sync.syncNow();
			expect(serverNote(a, id)?.content).toBe('versión de B');
		});
	});
});

describe('papelera', () => {
	it('lo que lleva más de 30 días en la papelera se elimina y se avisa al servidor', async () => {
		let now = NOW;
		const a = device('a', undefined, () => now);
		await a.repos.sync.syncNow();
		const note = await byTitle(a, 'Ideas para la exposición');
		await a.repos.notes.moveToTrash(note.id);
		await a.repos.sync.syncNow();
		now = new Date(NOW.getTime() + (TRASH_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
		const trash = await a.repos.notes.list({ filter: { kind: 'trash' } });
		expect(trash.some((n) => n.id === note.id)).toBe(false);
		expect((await a.repos.sync.snapshot()).pendingCount).toBeGreaterThan(0);
		await a.repos.sync.syncNow();
		expect(serverNote(a, note.id)).toBeUndefined();
	});
});

describe('simulador', () => {
	it('"conflicto en la próxima sincronización" deja un conflicto real', async () => {
		const a = device('a');
		await a.repos.sync.syncNow();
		a.scenario.injectConflict = true;
		const snap = await a.repos.sync.syncNow();
		expect(snap.conflicts).toHaveLength(1);
		expect(snap.conflicts[0].remote.deviceName).toBe('Pixel 8');
		expect(a.scenario.injectConflict).toBe(false);
	});
});
