import { describe, expect, it } from 'vitest';
import type { EncryptedSyncChange } from '#lib/domain/index.js';
import { MockDatabase } from './mock-database.js';
import { MockSyncServer } from './mock-sync-server.js';

const TS = '2026-03-01T10:00:00.000Z';
const sealedKey = 'a1.AAAAAAAAAAAAAAAA.QUJDRA';
const sealedPl = 'a1.BBBBBBBBBBBBBBBB.QUJDREVGRw';
const sealedPl2 = 'a1.CCCCCCCCCCCCCCCC.QUJDREVGRw';
const sealedPl3 = 'a1.DDDDDDDDDDDDDDDD.QUJDREVGRw';

let seq = 0;
const newId = () => `id_${++seq}`;

/** Servidor aislado con una cuenta propia (sin los datos de ejemplo ni su cifrado simulado). */
function makeServer() {
	const db = new MockDatabase({ startAuthenticated: false });
	db.session = {
		user: {
			id: `u_${++seq}`,
			email: 'test@example.com',
			fullName: 'Test',
			emailVerified: true,
			hasGoogle: false,
			createdAt: TS
		},
		expiresAt: '2099-01-01T00:00:00.000Z'
	};
	return { db, server: new MockSyncServer(db) };
}

function noteUpsert(id: string, baseRevision: number, folderId: string | null, payload: string): EncryptedSyncChange {
	return {
		entity: 'note',
		id,
		op: 'upsert',
		baseRevision,
		data: { folderId, createdAt: TS, updatedAt: TS, deletedAt: null, wrappedKey: sealedKey, payload }
	};
}

function folderUpsert(id: string, baseRevision: number, payload: string): EncryptedSyncChange {
	return {
		entity: 'folder',
		id,
		op: 'upsert',
		baseRevision,
		data: { createdAt: TS, updatedAt: TS, wrappedKey: sealedKey, payload }
	};
}

function del(entity: 'note' | 'folder', id: string, baseRevision: number): EncryptedSyncChange {
	return { entity, id, op: 'delete', baseRevision };
}

describe('MockSyncServer: borrar una carpeta con notas', () => {
	it('no genera un conflicto espurio con el upsert de sus propias notas en la misma petición', async () => {
		const { db, server } = makeServer();
		const userId = db.session!.user.id;
		const folder = newId();
		const n1 = newId();
		const n2 = newId();

		await server.sync({
			deviceId: 'd1',
			deviceName: 'Portátil',
			cursor: null,
			changes: [
				folderUpsert(folder, 0, sealedPl),
				noteUpsert(n1, 0, folder, sealedPl),
				noteUpsert(n2, 0, folder, sealedPl)
			]
		});

		const r = await server.sync({
			deviceId: 'd1',
			deviceName: 'Portátil',
			cursor: null,
			changes: [
				del('folder', folder, 1),
				noteUpsert(n1, 1, null, sealedPl2),
				noteUpsert(n2, 1, null, sealedPl2)
			]
		});

		expect(r.conflicts).toEqual([]);
		expect(r.applied).toHaveLength(3);
		const folderApplied = r.applied.find((a) => a.entity === 'folder');
		expect(folderApplied?.revision).toBe(2);
		for (const id of [n1, n2]) {
			const applied = r.applied.find((a) => a.entity === 'note' && a.id === id);
			// 1 al crearla + 1 por el borrado de su carpeta + 1 por su propio upsert.
			expect(applied?.revision).toBe(3);
		}

		const account = db.account(userId);
		expect(account.folders).toHaveLength(0);
		for (const id of [n1, n2]) {
			const note = account.notes.find((n) => n.id === id);
			expect(note?.folderId).toBeNull();
			expect(note?.revision).toBe(3);
			expect(note?.payload).toBe(sealedPl2);
		}
	});

	it('sigue habiendo conflicto si otra petición cambió la nota antes', async () => {
		const { db, server } = makeServer();
		const folder = newId();
		const note = newId();

		await server.sync({
			deviceId: 'd1',
			deviceName: 'Portátil',
			cursor: null,
			changes: [folderUpsert(folder, 0, sealedPl), noteUpsert(note, 0, folder, sealedPl)]
		});

		// Otro dispositivo edita la nota (revisión 1 -> 2) en una petición aparte, antes de que A borre la carpeta.
		const edit = await server.sync({
			deviceId: 'd2',
			deviceName: 'Pixel 8',
			cursor: null,
			changes: [noteUpsert(note, 1, folder, sealedPl2)]
		});
		expect(edit.conflicts).toEqual([]);

		// A no vio esa edición: borra la carpeta y sube la nota con la baseRevision que tenía antes (1), ya obsoleta.
		const r = await server.sync({
			deviceId: 'd1',
			deviceName: 'Portátil',
			cursor: null,
			changes: [del('folder', folder, 1), noteUpsert(note, 1, null, sealedPl3)]
		});

		expect(r.conflicts).toHaveLength(1);
		expect(r.conflicts[0].noteId).toBe(note);
		expect(r.conflicts[0].remote.payload).toBe(sealedPl2);
		expect(r.conflicts[0].remote.revision).toBe(3);
		expect(r.conflicts[0].remote.folderId).toBeNull();
		// El borrado de la carpeta sí se aplica: no depende de la nota.
		expect(r.applied).toEqual([{ entity: 'folder', id: folder, revision: 2 }]);
	});
});
