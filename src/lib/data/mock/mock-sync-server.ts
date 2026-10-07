import {
	type FolderFields,
	type Id,
	type Note,
	type NoteFields,
	type SyncApplied,
	type SyncChange,
	type SyncConflictReport,
	type SyncRemoteChange,
	type SyncRequest,
	type SyncResponse
} from '#lib/domain/index.js';
import type { SyncTransport } from '../contracts.js';
import type { MockDatabase } from './mock-database.js';

const clone = <T>(v: T): T => structuredClone(v);

/**
 * Servidor de sincronización en memoria. Implementa el protocolo de `domain/sync-protocol.ts`
 * sobre los datos de `MockDatabase` (que hacen de "base del servidor").
 * Varios clientes pueden compartir un mismo servidor (así se prueba con dos dispositivos).
 */
export class MockSyncServer implements SyncTransport {
	constructor(private db: MockDatabase) {}

	async sync(req: SyncRequest): Promise<SyncResponse> {
		await this.db.remote();
		this.db.deviceNames.set(req.deviceId, req.deviceName);
		const applied: SyncApplied[] = [];
		const conflicts: SyncConflictReport[] = [];
		const touched = new Set<string>();

		for (const change of req.changes) {
			if (change.entity === 'folder') this.applyFolder(change, applied, touched);
			else this.applyNote(change, req, applied, conflicts, touched);
		}

		return {
			cursor: String(this.db.serverSeq),
			applied,
			remoteChanges: this.changesSince(req.cursor, touched),
			conflicts
		};
	}

	/** Simula que otro dispositivo (Pixel 8) editó esta nota: sube su revisión y cambia el texto. */
	simulateRemoteEdit(noteId: Id): boolean {
		const note = this.db.notes.find((n) => n.id === noteId && !n.deletedAt);
		if (!note) return false;
		note.content = `${note.content}\n\n- [ ] Revisar ejercicios del parcial`;
		note.updatedAt = new Date(this.db.now().getTime() - 2 * 60000).toISOString();
		note.revision += 1;
		note.lastEditedDeviceId = 'd_pixel';
		this.bump('note', note.id);
		return true;
	}

	// ── Aplicar cambios del cliente ───────────────────────────────────

	private applyNote(
		change: SyncChange,
		req: SyncRequest,
		applied: SyncApplied[],
		conflicts: SyncConflictReport[],
		touched: Set<string>
	) {
		const db = this.db;
		const existing = db.notes.find((n) => n.id === change.id);
		const key = `note:${change.id}`;

		if (change.op === 'delete') {
			if (existing) {
				db.notes = db.notes.filter((n) => n.id !== change.id);
				this.tombstone('note', change.id, existing.revision);
			}
			applied.push({ entity: 'note', id: change.id, revision: existing?.revision ?? 0 });
			touched.add(key);
			return;
		}

		const data = change.data as NoteFields;
		if (!existing) {
			const note: Note = {
				id: change.id,
				...clone(data),
				revision: 1,
				syncStatus: 'synced',
				lastEditedDeviceId: req.deviceId
			};
			db.notes.unshift(note);
			db.tombstones = db.tombstones.filter((t) => !(t.entity === 'note' && t.id === note.id));
			this.bump('note', note.id);
			applied.push({ entity: 'note', id: note.id, revision: 1 });
			touched.add(key);
			return;
		}

		if (existing.revision !== change.baseRevision) {
			// El servidor no pisa: devuelve su versión y el cliente decide.
			conflicts.push({
				noteId: existing.id,
				remote: clone(existing),
				remoteDeviceName: this.deviceName(existing.lastEditedDeviceId)
			});
			return;
		}

		Object.assign(existing, clone(data), {
			revision: existing.revision + 1,
			lastEditedDeviceId: req.deviceId,
			syncStatus: 'synced'
		});
		this.bump('note', existing.id);
		applied.push({ entity: 'note', id: existing.id, revision: existing.revision });
		touched.add(key);
	}

	/** Las carpetas no tienen conflictos: gana el último cambio. */
	private applyFolder(change: SyncChange, applied: SyncApplied[], touched: Set<string>) {
		const db = this.db;
		const existing = db.folders.find((f) => f.id === change.id);
		const revision = (db.folderRevisions.get(change.id) ?? 0) + 1;
		touched.add(`folder:${change.id}`);

		if (change.op === 'delete') {
			if (existing) {
				db.folders = db.folders.filter((f) => f.id !== change.id);
				db.folderRevisions.delete(change.id);
				this.tombstone('folder', change.id, revision);
				// Sus notas pasan a "sin carpeta" también en el servidor.
				for (const note of db.notes) {
					if (note.folderId === change.id) {
						note.folderId = null;
						note.revision += 1;
						this.bump('note', note.id);
					}
				}
			}
			applied.push({ entity: 'folder', id: change.id, revision });
			return;
		}

		const data = change.data as FolderFields;
		if (existing) Object.assign(existing, clone(data));
		else db.folders.push({ id: change.id, ...clone(data) });
		db.folderRevisions.set(change.id, revision);
		db.tombstones = db.tombstones.filter((t) => !(t.entity === 'folder' && t.id === change.id));
		this.bump('folder', change.id);
		applied.push({ entity: 'folder', id: change.id, revision });
	}

	// ── Cambios para el cliente ───────────────────────────────────────

	private changesSince(cursor: string | null, touched: Set<string>): SyncRemoteChange[] {
		const db = this.db;
		const since = cursor ? Number(cursor) : 0;
		const seqOf = (key: string) => db.entitySeq.get(key) ?? 0;
		const out: { seq: number; change: SyncRemoteChange }[] = [];

		for (const f of db.folders) {
			const key = `folder:${f.id}`;
			if (seqOf(key) > since && !touched.has(key))
				out.push({
					seq: seqOf(key),
					change: {
						entity: 'folder',
						id: f.id,
						deleted: false,
						revision: db.folderRevisions.get(f.id) ?? 1,
						folder: clone(f)
					}
				});
		}
		for (const n of db.notes) {
			const key = `note:${n.id}`;
			if (seqOf(key) > since && !touched.has(key))
				out.push({
					seq: seqOf(key),
					change: {
						entity: 'note',
						id: n.id,
						deleted: false,
						revision: n.revision,
						note: { ...clone(n), syncStatus: 'synced' }
					}
				});
		}
		for (const t of db.tombstones) {
			const key = `${t.entity}:${t.id}`;
			if (t.seq > since && !touched.has(key))
				out.push({
					seq: t.seq,
					change: { entity: t.entity, id: t.id, deleted: true, revision: t.revision }
				});
		}
		// Carpetas antes que notas, y cada grupo por orden de cambio.
		const rank = (c: SyncRemoteChange) => (c.entity === 'folder' ? 0 : 1);
		return out
			.sort((a, b) => rank(a.change) - rank(b.change) || a.seq - b.seq)
			.map((x) => x.change);
	}

	// ── Internos ──────────────────────────────────────────────────────

	private bump(entity: 'note' | 'folder', id: Id) {
		this.db.entitySeq.set(`${entity}:${id}`, ++this.db.serverSeq);
	}

	private tombstone(entity: 'note' | 'folder', id: Id, revision: number) {
		this.db.tombstones.push({ entity, id, seq: ++this.db.serverSeq, revision });
	}

	private deviceName(deviceId: Id): string {
		return (
			this.db.deviceNames.get(deviceId) ??
			this.db.devices.find((d) => d.id === deviceId)?.name ??
			'Otro dispositivo'
		);
	}
}
