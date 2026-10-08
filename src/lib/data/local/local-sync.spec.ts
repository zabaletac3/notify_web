import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { TRASH_RETENTION_DAYS, type Note } from '#lib/domain/index.js';
import { decryptNote } from '../crypto/index.js';
import { createDemoVault } from '../mock/demo-vault.js';
import { DEMO_USER_ID, MockDatabase } from '../mock/mock-database.js';
import { ApunteDb } from './apunte-db.js';
import { createLocalBackend, type LocalBackend } from './create-local-backend.js';

let seq = 0;
const NOW = new Date('2026-10-07T12:00:00.000Z');

/** Un dispositivo nuevo (base local vacía) contra un servidor, que puede ser compartido. */
async function device(
	name: string,
	server?: MockDatabase,
	now: () => Date = () => NOW
): Promise<LocalBackend> {
	const vault = await createDemoVault();
	return createLocalBackend({
		vault: () => vault,
		dbName: `test-${++seq}`,
		userId: 'u_test',
		server,
		now,
		device: { id: `d_${name}`, name }
	});
}

const notesOf = (b: LocalBackend) => b.repos.notes.list();
const byTitle = async (b: LocalBackend, title: string) =>
	(await notesOf(b)).find((n) => n.title === title) as Note;
/** La nota tal como la tiene el servidor, descifrada con la clave de la cuenta (solo las pruebas la tienen). */
async function serverNote(b: LocalBackend, id: string) {
	const row = b.db.account(DEMO_USER_ID).notes.find((n) => n.id === id);
	return row ? decryptNote(await createDemoVault(), row, 'synced') : undefined;
}

describe('primera sincronización', () => {
	it('un dispositivo nuevo descarga todo el servidor', async () => {
		const a = await device('a');
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
		const a = await device('a');
		await a.repos.sync.syncNow();
		const before = await notesOf(a);
		await a.repos.sync.syncNow();
		expect(await notesOf(a)).toEqual(before);
	});
});

describe('escritura sin conexión', () => {
	it('crear y editar deja un solo cambio pendiente que sube al sincronizar', async () => {
		const a = await device('a');
		await a.repos.sync.syncNow();
		const note = await a.repos.notes.create({ title: 'Idea', content: 'uno' });
		expect(note.revision).toBe(0);
		await a.repos.notes.update(note.id, { content: 'uno dos' });
		await a.repos.notes.update(note.id, { content: 'uno dos tres' });
		expect((await a.repos.sync.snapshot()).pendingCount).toBe(1);
		expect(await serverNote(a, note.id)).toBeUndefined();

		await a.repos.sync.syncNow();
		const remote = await serverNote(a, note.id);
		expect(remote?.content).toBe('uno dos tres');
		expect(remote?.revision).toBe(1);
		const local = await a.repos.notes.get(note.id);
		expect(local.revision).toBe(1);
		expect(local.syncStatus).toBe('synced');
		expect((await a.repos.sync.snapshot()).pendingCount).toBe(0);
	});

	it('crear y borrar antes de sincronizar no manda nada al servidor', async () => {
		const a = await device('a');
		await a.repos.sync.syncNow();
		const note = await a.repos.notes.create({ title: 'Efímera' });
		await a.repos.notes.moveToTrash(note.id);
		await a.repos.notes.deleteForever(note.id);
		expect((await a.repos.sync.snapshot()).pendingCount).toBe(0);
		await a.repos.sync.syncNow();
		expect(await serverNote(a, note.id)).toBeUndefined();
	});

	it('sin red falla la sincronización pero se puede seguir escribiendo', async () => {
		const a = await device('a');
		await a.repos.sync.syncNow();
		a.scenario.offline = true;
		await expect(a.repos.sync.syncNow()).rejects.toMatchObject({ error: { kind: 'network' } });
		const note = await a.repos.notes.create({ title: 'Sin red' });
		expect((await a.repos.sync.snapshot()).phase).toBe('offline');
		expect((await a.repos.sync.snapshot()).pendingCount).toBe(1);

		a.scenario.offline = false;
		await a.repos.sync.syncNow();
		expect((await serverNote(a, note.id))?.title).toBe('Sin red');
		expect((await a.repos.sync.snapshot()).pendingCount).toBe(0);
	});

	it('si se edita mientras se sincroniza, el cambio nuevo queda pendiente', async () => {
		const a = await device('a');
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
		expect((await serverNote(a, note.id))?.content).toBe('v2');
		expect((await serverNote(a, note.id))?.revision).toBe(2);
		expect((await a.repos.sync.snapshot()).pendingCount).toBe(0);
	});
});

describe('dos dispositivos', () => {
	async function pair() {
		const a = await device('a');
		await a.repos.sync.syncNow();
		const b = await device('b', a.db);
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
			expect((await serverNote(a, id))?.content).toBe('versión de A');
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
			expect((await serverNote(a, id))?.content).toBe('versión de B');
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
			expect((await serverNote(a, copy!.id))?.content).toBe('versión de B');
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
			expect((await serverNote(a, id))?.content).toBe('versión de B');
		});
	});
});

describe('papelera', () => {
	it('lo que lleva más de 30 días en la papelera se elimina y se avisa al servidor', async () => {
		let now = NOW;
		const a = await device('a', undefined, () => now);
		await a.repos.sync.syncNow();
		const note = await byTitle(a, 'Ideas para la exposición');
		await a.repos.notes.moveToTrash(note.id);
		await a.repos.sync.syncNow();
		now = new Date(NOW.getTime() + (TRASH_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
		const trash = await a.repos.notes.list({ filter: { kind: 'trash' } });
		expect(trash.some((n) => n.id === note.id)).toBe(false);
		expect((await a.repos.sync.snapshot()).pendingCount).toBeGreaterThan(0);
		await a.repos.sync.syncNow();
		expect(await serverNote(a, note.id)).toBeUndefined();
	});
});

describe('simulador', () => {
	it('"conflicto en la próxima sincronización" deja un conflicto real', async () => {
		const a = await device('a');
		await a.repos.sync.syncNow();
		a.scenario.injectConflict = true;
		const snap = await a.repos.sync.syncNow();
		expect(snap.conflicts).toHaveLength(1);
		expect(snap.conflicts[0].remote.deviceName).toBe('Pixel 8');
		expect(a.scenario.injectConflict).toBe(false);
	});
});

describe('cifrado', () => {
	/** Todo lo que hay en IndexedDB y en el servidor, como texto, para buscar en él. */
	async function everything(b: LocalBackend) {
		const { db } = b.local;
		const local = JSON.stringify({
			notes: await db.notes.toArray(),
			folders: await db.folders.toArray(),
			outbox: await db.outbox.toArray(),
			conflicts: await db.conflicts.toArray()
		});
		const account = b.db.account(DEMO_USER_ID);
		const server = JSON.stringify({ notes: account.notes, folders: account.folders });
		return { local, server };
	}

	it('ni IndexedDB ni el servidor contienen el texto de las notas ni los nombres de carpeta', async () => {
		const a = await device('a');
		await a.repos.sync.syncNow();
		const folder = await a.repos.folders.create('Carpeta ultrasecreta');
		await a.repos.notes.create({
			title: 'Contraseñas del banco',
			content: 'La clave es tortuga-azul-42',
			tags: ['privado'],
			folderId: folder.id
		});
		// Una parte ya sincronizada y otra todavía en la cola.
		await a.repos.sync.syncNow();
		await a.repos.notes.create({ title: 'Pendiente secreta', content: 'texto-pendiente-77' });

		const { local, server } = await everything(a);
		for (const secret of [
			'Carpeta ultrasecreta',
			'Contraseñas del banco',
			'tortuga-azul-42',
			'privado',
			'Pendiente secreta',
			'texto-pendiente-77',
			// y los datos de ejemplo
			'Resumen: Bases de datos II',
			'Universidad'
		]) {
			expect(local, `local: ${secret}`).not.toContain(secret);
			expect(server, `servidor: ${secret}`).not.toContain(secret);
		}
	});

	it('con la app bloqueada no se puede leer ni escribir, pero la sincronización sigue', async () => {
		const vault = await createDemoVault();
		const a = createLocalBackend({
			vault: () => vault,
			dbName: `test-${++seq}`,
			userId: 'u_test',
			now: () => NOW,
			device: { id: 'd_a', name: 'a' }
		});
		await a.repos.sync.syncNow();
		await a.repos.notes.create({ title: 'Antes de bloquear' });
		vault.lock();

		await expect(a.repos.notes.list()).rejects.toMatchObject({ error: { kind: 'locked' } });
		await expect(a.repos.notes.create({ title: 'Bloqueada' })).rejects.toMatchObject({
			error: { kind: 'locked' }
		});
		await expect(a.repos.folders.list()).rejects.toMatchObject({ error: { kind: 'locked' } });
		// Subir lo pendiente y bajar lo nuevo no necesita descifrar nada.
		expect((await a.repos.sync.snapshot()).pendingCount).toBe(1);
		const snap = await a.repos.sync.syncNow();
		expect(snap.pendingCount).toBe(0);

		vault.unlockWith((await createDemoVault()).requireKey());
		expect((await notesOf(a)).some((n) => n.title === 'Antes de bloquear')).toBe(true);
	});

	it('si el servidor intercambia el contenido de dos notas, solo esas salen como "Nota ilegible"', async () => {
		const a = await device('a');
		await a.repos.sync.syncNow();
		const account = a.db.account(DEMO_USER_ID);
		const [one, two] = account.notes.filter((n) => !n.deletedAt);
		[one.payload, two.payload] = [two.payload, one.payload];
		account.entitySeq.set(`note:${one.id}`, ++account.seq);
		account.entitySeq.set(`note:${two.id}`, ++account.seq);

		const b = await device('b', a.db);
		await b.repos.sync.syncNow();
		const notes = await notesOf(b);
		expect(notes).toHaveLength(48);
		const unreadable = notes.filter((n) => n.title === 'Nota ilegible');
		expect(unreadable.map((n) => n.id).sort()).toEqual([one.id, two.id].sort());
		expect(notes.filter((n) => n.title !== 'Nota ilegible')).toHaveLength(46);
	});

	it('cada nota tiene su propia clave, también la copia de un conflicto', async () => {
		const a = await device('a');
		await a.repos.sync.syncNow();
		const rows = await a.local.db.notes.toArray();
		expect(new Set(rows.map((r) => r.wrappedKey)).size).toBe(rows.length);

		const copy = await a.repos.notes.duplicate(rows[0].id);
		const copyRow = await a.local.db.notes.get(copy.id);
		expect(copyRow?.wrappedKey).not.toBe(rows[0].wrappedKey);
	});

	it('editar una nota conserva su clave; solo cambia el texto cifrado', async () => {
		const a = await device('a');
		await a.repos.sync.syncNow();
		const note = await a.repos.notes.create({ title: 'Mutable', content: 'uno' });
		const before = await a.local.db.notes.get(note.id);
		await a.repos.notes.update(note.id, { content: 'dos' });
		const after = await a.local.db.notes.get(note.id);
		expect(after?.wrappedKey).toBe(before?.wrappedKey);
		expect(after?.payload).not.toBe(before?.payload);
	});

	it('mover una nota a la papelera o de carpeta no vuelve a cifrar su texto de otra forma', async () => {
		const a = await device('a');
		await a.repos.sync.syncNow();
		const note = await byTitle(a, 'Resumen: Bases de datos II');
		const trashed = await a.repos.notes.moveToTrash(note.id);
		expect(trashed.deletedAt).not.toBeNull();
		expect((await a.repos.notes.get(note.id)).title).toBe('Resumen: Bases de datos II');
	});

	it('el servidor rechaza lo que no tiene forma de texto cifrado', async () => {
		const a = await device('a');
		await a.repos.sync.syncNow();
		const bad = a.local.server.sync({
			deviceId: 'd_a',
			deviceName: 'a',
			cursor: null,
			changes: [
				{
					entity: 'note',
					id: 'n_x',
					op: 'upsert',
					baseRevision: 0,
					data: {
						folderId: null,
						createdAt: NOW.toISOString(),
						updatedAt: NOW.toISOString(),
						deletedAt: null,
						wrappedKey: 'texto en claro',
						payload: 'otro texto en claro'
					}
				}
			]
		});
		await expect(bad).rejects.toMatchObject({
			error: { kind: 'validation', fields: { payload: 'invalid-payload' } }
		});
	});

	it('una cuenta nueva empieza con el servidor vacío (los datos de ejemplo son de otra cuenta)', async () => {
		const a = await device('a');
		const other = a.db.account('u_otra');
		expect(other.notes).toHaveLength(0);
		expect(other.seeded).toBe(true);
		expect(a.db.account(DEMO_USER_ID).seeded).toBe(false);
	});

	it('las bases de la versión anterior (en claro) se descartan al abrirlas', async () => {
		const name = `legacy-${++seq}`;
		const old = new Dexie(name);
		old.version(1).stores({
			notes: 'id, folderId, deletedAt, updatedAt',
			folders: 'id',
			outbox: '++seq, [entity+entityId]',
			conflicts: 'noteId',
			meta: 'key'
		});
		await old.table('notes').put({ id: 'n1', title: 'En claro', content: 'viejo' });
		await old.table('meta').bulkPut([
			{ key: 'cursor', value: '9' },
			{ key: 'lastSyncedAt', value: 'ayer' },
			{ key: 'settings', value: { theme: 'dark' } }
		]);
		old.close();

		const db = new ApunteDb(name);
		expect(await db.notes.count()).toBe(0);
		expect(await db.getMeta('cursor')).toBeUndefined();
		expect(await db.getMeta('lastSyncedAt')).toBeUndefined();
		// Lo que no depende de las notas se conserva.
		expect(await db.getMeta('settings')).toEqual({ theme: 'dark' });
		db.close();
	});
});
