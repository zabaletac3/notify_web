import type { Sealed } from '#lib/domain/index.js';
import {
	fail,
	newId,
	normalizeTag,
	queryNotes,
	TRASH_RETENTION_DAYS,
	type Id,
	type Note,
	type NoteDraft,
	type NoteQuery
} from '#lib/domain/index.js';
import type { NoteRepository } from '../contracts.js';
import type { NoteRow } from './axonote-db.js';
import { enqueue, noteFields } from './outbox.js';
import { noGate, type LocalDeps } from './gate.js';

/**
 * Notas guardadas en IndexedDB, siempre cifradas. Cada escritura queda en la cola para subirla cuando
 * haya red. Cifrar es asíncrono, así que cada operación lee, cifra y escribe dentro de `lock` y la
 * transacción de IndexedDB solo cubre la escritura.
 */
export class LocalNoteRepository implements NoteRepository {
	constructor(private d: LocalDeps) {}

	private get gate() {
		return this.d.gate ?? noGate;
	}
	private iso() {
		return this.d.now().toISOString();
	}

	private touch(note: Note): Note {
		return {
			...note,
			updatedAt: this.iso(),
			syncStatus: note.syncStatus === 'conflict' ? 'conflict' : 'pending',
			lastEditedDeviceId: this.d.deviceId
		};
	}

	/** Cifra la nota, la guarda y apunta el cambio. */
	private async save(note: Note, wrappedKey?: Sealed): Promise<Note> {
		const { db, codec } = this.d;
		// Una nota ilegible no se vuelve a cifrar (sería pisar lo guardado con un marcador vacío):
		// solo cambian sus metadatos (carpeta, papelera, fechas).
		const row = note.unreadable
			? { ...(await this.findRow(note.id)), ...this.metadata(note) }
			: await codec.encryptNote(note, wrappedKey);
		await db.transaction('rw', db.notes, db.outbox, async () => {
			await db.notes.put(row);
			await enqueue(
				db,
				{
					entity: 'note',
					entityId: row.id,
					op: 'upsert',
					baseRevision: row.revision,
					data: noteFields(row)
				},
				this.iso()
			);
		});
		return note;
	}

	private metadata(note: Note) {
		return {
			folderId: note.folderId,
			updatedAt: note.updatedAt,
			deletedAt: note.deletedAt,
			syncStatus: note.syncStatus,
			lastEditedDeviceId: note.lastEditedDeviceId
		};
	}

	private async findRow(id: Id): Promise<NoteRow> {
		const row = await this.d.db.notes.get(id);
		if (!row) throw fail.notFound('note');
		return row;
	}

	private async find(id: Id): Promise<{ row: NoteRow; note: Note }> {
		const row = await this.findRow(id);
		return { row, note: await this.d.codec.note(row) };
	}

	/** La papelera se vacía sola a los 30 días. (Solo mira la fecha de borrado, que no está cifrada.) */
	private purgeExpired() {
		const { db } = this.d;
		const limit = this.d.now().getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
		return this.d.lock.run(() =>
			db.transaction('rw', db.notes, db.outbox, db.conflicts, async () => {
				const expired = await db.notes
					.filter((n) => n.deletedAt !== null && new Date(n.deletedAt).getTime() <= limit)
					.toArray();
				for (const row of expired) await this.remove(row);
			})
		);
	}

	/** Borra la fila y avisa al servidor. Debe ir en una transacción con `notes`, `outbox` y `conflicts`. */
	private async remove(row: NoteRow) {
		const { db } = this.d;
		await db.notes.delete(row.id);
		await db.conflicts.delete(row.id);
		await enqueue(
			db,
			{ entity: 'note', entityId: row.id, op: 'delete', baseRevision: row.revision },
			this.iso()
		);
	}

	async list(query: NoteQuery = {}): Promise<Note[]> {
		await this.gate.read();
		await this.purgeExpired();
		const rows = await this.d.db.notes.toArray();
		const notes: Note[] = [];
		for (const row of rows) notes.push(await this.d.codec.note(row));
		return queryNotes(notes, query);
	}

	async get(id: Id): Promise<Note> {
		await this.gate.read();
		return (await this.find(id)).note;
	}

	create(draft: NoteDraft = {}): Promise<Note> {
		return this.write(async () => {
			const now = this.iso();
			return this.save({
				id: newId(this.d.now().getTime()),
				folderId: draft.folderId ?? null,
				title: draft.title ?? '',
				content: draft.content ?? '',
				tags: [...new Set((draft.tags ?? []).map(normalizeTag))].filter(Boolean),
				pinned: draft.pinned ?? false,
				createdAt: now,
				updatedAt: now,
				deletedAt: null,
				revision: 0,
				syncStatus: 'pending',
				lastEditedDeviceId: this.d.deviceId
			});
		});
	}

	update(id: Id, patch: NoteDraft): Promise<Note> {
		return this.write(async () => {
			const { db } = this.d;
			const { row, note } = await this.find(id);
			if (note.deletedAt) throw fail.validation({ note: 'in-trash' });
			// De una nota ilegible solo se puede cambiar la carpeta.
			if (
				note.unreadable &&
				(patch.title !== undefined ||
					patch.content !== undefined ||
					patch.tags !== undefined ||
					patch.pinned !== undefined)
			)
				throw fail.decrypt();
			const next = { ...note };
			if (patch.title !== undefined) next.title = patch.title;
			if (patch.content !== undefined) next.content = patch.content;
			if (patch.folderId !== undefined) {
				if (patch.folderId !== null && !(await db.folders.get(patch.folderId)))
					throw fail.notFound('folder');
				next.folderId = patch.folderId;
			}
			if (patch.tags !== undefined)
				next.tags = [...new Set(patch.tags.map(normalizeTag))].filter(Boolean);
			if (patch.pinned !== undefined) next.pinned = patch.pinned;
			return this.save(this.touch(next), row.wrappedKey);
		});
	}

	duplicate(id: Id): Promise<Note> {
		return this.write(async () => {
			const { note: src } = await this.find(id);
			if (src.unreadable) throw fail.decrypt();
			const now = this.iso();
			// La copia es otra nota: sin `wrappedKey`, para que lleve su propia clave.
			return this.save({
				...src,
				tags: [...src.tags],
				id: newId(this.d.now().getTime()),
				title: `${src.title} (copia)`,
				pinned: false,
				createdAt: now,
				updatedAt: now,
				revision: 0,
				syncStatus: 'pending',
				lastEditedDeviceId: this.d.deviceId
			});
		});
	}

	moveToTrash(id: Id): Promise<Note> {
		return this.write(async () => {
			const { row, note } = await this.find(id);
			return this.save(
				this.touch({ ...note, deletedAt: this.iso(), pinned: false }),
				row.wrappedKey
			);
		});
	}

	restore(id: Id): Promise<Note> {
		return this.write(async () => {
			const { row, note } = await this.find(id);
			return this.save(this.touch({ ...note, deletedAt: null }), row.wrappedKey);
		});
	}

	deleteForever(id: Id): Promise<void> {
		return this.write(async () => {
			const { db } = this.d;
			const row = await this.findRow(id);
			await db.transaction('rw', db.notes, db.outbox, db.conflicts, () => this.remove(row));
		});
	}

	emptyTrash(): Promise<number> {
		return this.write(async () => {
			const { db } = this.d;
			return db.transaction('rw', db.notes, db.outbox, db.conflicts, async () => {
				const trashed = await db.notes.filter((n) => n.deletedAt !== null).toArray();
				for (const row of trashed) await this.remove(row);
				return trashed.length;
			});
		});
	}

	/** Se pone en cola al momento (en el orden en que se pide); la espera simulada va dentro. */
	private write<T>(task: () => Promise<T>): Promise<T> {
		return this.d.lock.run(async () => {
			await this.gate.write();
			return task();
		});
	}
}
