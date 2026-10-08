import {
	AppFailure,
	fail,
	newId,
	type Conflict,
	type ConflictResolution,
	type EncryptedSyncRequest,
	type EncryptedSyncResponse,
	type Id,
	type SyncSnapshot
} from '#lib/domain/index.js';
import type { SyncRepository, SyncTransport } from '../contracts.js';
import type { ApunteDb, ConflictRow, NoteRow, OutboxEntry } from './apunte-db.js';
import { noGate, type DataGate, type Mutex } from './gate.js';
import type { LocalCodec } from './local-codec.js';
import { enqueue, noteFields } from './outbox.js';

export interface LocalSyncDeps {
	db: ApunteDb;
	codec: LocalCodec;
	lock: Mutex;
	transport: SyncTransport;
	now: () => Date;
	device: { id: Id; name: string };
	gate?: DataGate;
	/** Hay una base abierta (si no, no hay nada pendiente ni en conflicto). */
	isOpen?: () => boolean;
	/** Estado de la conectividad según el entorno (en producción, `navigator.onLine`). */
	connectivity?: () => 'online' | 'offline' | 'error';
	/** Se ejecuta justo antes de cada sincronización (lo usa el simulador para inyectar conflictos). */
	beforeSync?: () => Promise<void>;
}

const entryKey = (e: { entity: string; entityId: string }) => `${e.entity}:${e.entityId}`;

/**
 * Sincroniza la base local con el servidor.
 *
 *  1. Toma la cola de cambios (sin las notas que están en conflicto).
 *  2. Los envía con el cursor y la `baseRevision` de cada uno.
 *  3. Aplica la respuesta: confirma lo aceptado, guarda los conflictos y trae lo remoto.
 */
export class LocalSyncRepository implements SyncRepository {
	private running: Promise<SyncSnapshot> | null = null;

	constructor(private d: LocalSyncDeps) {}

	private get gate() {
		return this.d.gate ?? noGate;
	}
	private iso() {
		return this.d.now().toISOString();
	}

	async snapshot(): Promise<SyncSnapshot> {
		await this.gate.write();
		if (this.d.isOpen && !this.d.isOpen()) {
			const link = this.d.connectivity?.() ?? 'online';
			return {
				phase: link === 'online' ? 'idle' : link,
				lastSyncedAt: null,
				pendingCount: 0,
				conflicts: []
			};
		}
		const { db } = this.d;
		const [pendingCount, rows, lastSyncedAt] = await Promise.all([
			db.outbox.count(),
			db.conflicts.toArray(),
			db.getMeta<string>('lastSyncedAt')
		]);
		const conflicts = await this.describeConflicts(rows);
		const link = this.d.connectivity?.() ?? 'online';
		return {
			phase: link === 'online' ? 'idle' : link,
			lastSyncedAt: lastSyncedAt ?? null,
			pendingCount,
			conflicts
		};
	}

	/** Las dos versiones de cada conflicto, descifradas. Con la app bloqueada no se pueden mostrar. */
	private async describeConflicts(rows: ConflictRow[]): Promise<Conflict[]> {
		const { db, codec } = this.d;
		const conflicts: Conflict[] = [];
		try {
			for (const row of rows) {
				const localRow = await db.notes.get(row.noteId);
				if (!localRow) continue;
				const local = await codec.note(localRow);
				const remote = await codec.note({ ...row.remote, syncStatus: 'synced' });
				conflicts.push({
					noteId: row.noteId,
					local: {
						title: local.title,
						content: local.content,
						editedAt: local.updatedAt,
						deviceName: this.d.device.name
					},
					remote: {
						title: remote.title,
						content: remote.content,
						editedAt: remote.updatedAt,
						deviceName: row.remoteDeviceName
					}
				});
			}
		} catch (e) {
			if (e instanceof AppFailure && e.error.kind === 'locked') return [];
			throw e;
		}
		return conflicts;
	}

	syncNow(): Promise<SyncSnapshot> {
		// Si ya hay una sincronización en curso, se espera a esa.
		this.running ??= this.run().finally(() => (this.running = null));
		return this.running;
	}

	private async run(): Promise<SyncSnapshot> {
		await this.d.beforeSync?.();
		const { db } = this.d;
		const cursor = (await db.getMeta<string>('cursor')) ?? null;
		const inConflict = new Set((await db.conflicts.toArray()).map((c) => c.noteId));
		const sent = (await db.outbox.orderBy('seq').toArray()).filter(
			(e) => !(e.entity === 'note' && inConflict.has(e.entityId))
		);
		const request: EncryptedSyncRequest = {
			deviceId: this.d.device.id,
			deviceName: this.d.device.name,
			cursor,
			changes: sent.map((e) => ({
				entity: e.entity,
				id: e.entityId,
				op: e.op,
				baseRevision: e.baseRevision,
				data: e.data
			}))
		};
		const response = await this.d.transport.sync(request);
		await this.d.lock.run(() => this.apply(response, sent));
		return this.snapshot();
	}

	private async apply(response: EncryptedSyncResponse, sent: OutboxEntry[]) {
		const { db } = this.d;
		const sentVersion = new Map(sent.map((e) => [entryKey(e), e.version]));
		const now = this.iso();

		await db.transaction('rw', db.notes, db.folders, db.outbox, db.conflicts, db.meta, async () => {
			const pendingFor = (entity: string, id: string) =>
				db.outbox.where('[entity+entityId]').equals([entity, id]).first();

			// 1) Lo que el servidor aceptó.
			for (const a of response.applied) {
				const entry = await pendingFor(a.entity, a.id);
				const unchanged = !!entry && entry.version === sentVersion.get(entryKey(entry));
				const editedWhileSyncing = !!entry && !unchanged;
				if (a.entity === 'note') {
					const note = await db.notes.get(a.id);
					if (note)
						await db.notes.put({
							...note,
							revision: a.revision,
							syncStatus: editedWhileSyncing ? 'pending' : 'synced'
						});
				} else {
					const folder = await db.folders.get(a.id);
					if (folder) await db.folders.put({ ...folder, revision: a.revision });
				}
				if (entry) {
					if (unchanged) await db.outbox.delete(entry.seq!);
					else await db.outbox.put({ ...entry, baseRevision: a.revision });
				}
			}

			// 2) Conflictos: el servidor no aplicó el cambio.
			for (const c of response.conflicts) {
				await db.conflicts.put({
					noteId: c.noteId,
					remote: c.remote,
					remoteDeviceName: c.remoteDeviceName,
					detectedAt: now
				});
				const note = await db.notes.get(c.noteId);
				if (note) await db.notes.put({ ...note, syncStatus: 'conflict' });
			}

			// 3) Lo que cambió en otros dispositivos.
			for (const ch of response.remoteChanges) {
				const pending = await pendingFor(ch.entity, ch.id);
				if (ch.entity === 'note') {
					const conflict = await db.conflicts.get(ch.id);
					if (conflict && ch.note) await db.conflicts.put({ ...conflict, remote: ch.note });
					// Con un cambio local pendiente no se pisa: se resolverá al subirlo.
					if (pending) continue;
					if (ch.deleted) {
						await db.notes.delete(ch.id);
						await db.conflicts.delete(ch.id);
					} else if (ch.note) {
						await db.notes.put({ ...ch.note, syncStatus: 'synced' });
					}
				} else {
					if (pending && !ch.deleted) continue;
					if (ch.deleted) await db.folders.delete(ch.id);
					else if (ch.folder) await db.folders.put(ch.folder);
				}
			}

			await db.setMeta('cursor', response.cursor);
			await db.setMeta('lastSyncedAt', now);
		});
	}

	async resolveConflict(noteId: Id, resolution: ConflictResolution): Promise<SyncSnapshot> {
		await this.gate.write();
		await this.d.lock.run(() => this.resolve(noteId, resolution));
		return this.snapshot();
	}

	private async resolve(noteId: Id, resolution: ConflictResolution) {
		const { db, codec } = this.d;
		const conflict = await db.conflicts.get(noteId);
		const local = await db.notes.get(noteId);
		if (!conflict || !local) throw fail.notFound('conflict');
		const now = this.iso();
		const remote: NoteRow = { ...conflict.remote, syncStatus: 'synced' };

		// Para "ambas" hay que descifrar la versión de este dispositivo y cifrar la copia con una clave
		// nueva; eso es asíncrono y va antes de abrir la transacción.
		let copy: NoteRow | null = null;
		if (resolution === 'both') {
			const mine = await codec.note(local);
			copy = await codec.encryptNote({
				...mine,
				tags: [...mine.tags],
				id: newId(this.d.now().getTime()),
				title: `${mine.title} (conflicto)`,
				pinned: false,
				createdAt: now,
				updatedAt: now,
				revision: 0,
				syncStatus: 'pending',
				lastEditedDeviceId: this.d.device.id
			});
		}

		await db.transaction('rw', db.notes, db.outbox, db.conflicts, async () => {
			const pending = await db.outbox.where('[entity+entityId]').equals(['note', noteId]).first();
			if (resolution === 'remote') {
				// Se queda la versión del servidor y se descarta lo hecho aquí.
				await db.notes.put(remote);
				if (pending) await db.outbox.delete(pending.seq!);
			} else if (resolution === 'both' && copy) {
				// La versión del servidor ocupa el lugar de la original; lo de este dispositivo pasa a una copia.
				await db.notes.put(copy);
				await enqueue(
					db,
					{
						entity: 'note',
						entityId: copy.id,
						op: 'upsert',
						baseRevision: 0,
						data: noteFields(copy)
					},
					now
				);
				await db.notes.put(remote);
				if (pending) await db.outbox.delete(pending.seq!);
			} else {
				// 'local': se conserva lo de este dispositivo, ya sobre la revisión del servidor.
				await db.notes.put({
					...local,
					revision: conflict.remote.revision,
					syncStatus: 'pending'
				});
				if (pending) await db.outbox.put({ ...pending, baseRevision: conflict.remote.revision });
			}
			await db.conflicts.delete(noteId);
		});
	}
}
