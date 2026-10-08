import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { EncryptedSyncRequest, EncryptedSyncResponse } from '#lib/domain/index.js';
import type { SyncTransport } from '../contracts.js';
import { createDemoVault } from '../mock/demo-vault.js';
import { MockDatabase } from '../mock/mock-database.js';
import { MockSyncServer } from '../mock/mock-sync-server.js';
import { createLocalBackend } from './create-local-backend.js';

/** Servidor que reparte lo que baja en páginas pequeñas, como hace la API real con cuentas grandes. */
class PagingTransport implements SyncTransport {
	requests: EncryptedSyncRequest[] = [];
	private pending: EncryptedSyncResponse['remoteChanges'] = [];
	private lastCursor = '';
	constructor(
		private inner: SyncTransport,
		private pageSize: number
	) {}

	async sync(req: EncryptedSyncRequest): Promise<EncryptedSyncResponse> {
		this.requests.push(structuredClone(req));
		if (req.cursor && req.cursor.startsWith('page')) {
			// Continuación: ya no hay cambios que subir, y se sigue desde el cursor de la página anterior.
			expect(req.changes).toHaveLength(0);
		} else {
			const full = await this.inner.sync(req);
			this.pending = full.remoteChanges;
			this.lastCursor = full.cursor;
			const page = this.pending.splice(0, this.pageSize);
			return {
				...full,
				remoteChanges: page,
				cursor: this.pending.length ? `page${this.requests.length}` : full.cursor,
				hasMore: this.pending.length > 0
			};
		}
		const page = this.pending.splice(0, this.pageSize);
		return {
			cursor: this.pending.length ? `page${this.requests.length}` : this.lastCursor,
			applied: [],
			remoteChanges: page,
			conflicts: [],
			hasMore: this.pending.length > 0
		};
	}
}

async function backend(pageSize: number) {
	const db = new MockDatabase({ now: () => new Date('2026-10-07T12:00:00.000Z') });
	const transport = new PagingTransport(new MockSyncServer(db), pageSize);
	const vault = await createDemoVault();
	const b = createLocalBackend({
		vault: () => vault,
		dbName: `paging-${pageSize}`,
		userId: 'u_test',
		server: db,
		remote: { transport } as never
	});
	return { b, transport };
}

describe('sincronización paginada', () => {
	it('sigue pidiendo páginas hasta estar al día y no pierde ni repite nada', async () => {
		const { b, transport } = await backend(10);
		await b.repos.sync.syncNow();
		expect(await b.repos.notes.list()).toHaveLength(48);
		expect(await b.repos.folders.list()).toHaveLength(5);
		// 56 elementos (48 notas + 5 carpetas + 3 en papelera cuentan dentro de las 48 ya) en páginas de 10.
		expect(transport.requests.length).toBeGreaterThan(2);
		expect(transport.requests.slice(1).every((r) => r.changes.length === 0)).toBe(true);
		const snap = await b.repos.sync.snapshot();
		expect(snap.pendingCount).toBe(0);
		expect(snap.lastSyncedAt).not.toBeNull();
	});

	it('los cambios locales solo se envían en la primera petición', async () => {
		const { b, transport } = await backend(10);
		await b.repos.sync.syncNow();
		const before = transport.requests.length;
		const note = await b.repos.notes.create({ title: 'Nueva', content: 'x' });
		await b.repos.sync.syncNow();
		const sent = transport.requests.slice(before);
		expect(sent[0].changes.map((c) => c.id)).toContain(note.id);
		expect(sent.slice(1).every((r) => r.changes.length === 0)).toBe(true);
	});
});
