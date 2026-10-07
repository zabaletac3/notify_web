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
import { enqueue, noteFields } from './outbox.js';
import { noGate, type LocalDeps } from './gate.js';

/** Notas guardadas en IndexedDB. Cada escritura queda en la cola para subirla cuando haya red. */
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

	/** Guarda la nota y apunta el cambio. Debe ir dentro de una transacción con `notes` y `outbox`. */
	private async save(note: Note) {
		await this.d.db.notes.put(note);
		await enqueue(
			this.d.db,
			{
				entity: 'note',
				entityId: note.id,
				op: 'upsert',
				baseRevision: note.revision,
				data: noteFields(note)
			},
			this.iso()
		);
	}

	private async find(id: Id): Promise<Note> {
		const note = await this.d.db.notes.get(id);
		if (!note) throw fail.notFound('note');
		return note;
	}

	/** La papelera se vacía sola a los 30 días. */
	private async purgeExpired() {
		const { db } = this.d;
		const limit = this.d.now().getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
		await db.transaction('rw', db.notes, db.outbox, async () => {
			const expired = await db.notes
				.filter((n) => n.deletedAt !== null && new Date(n.deletedAt).getTime() <= limit)
				.toArray();
			for (const note of expired) await this.remove(note);
		});
	}

	private async remove(note: Note) {
		await this.d.db.notes.delete(note.id);
		await enqueue(
			this.d.db,
			{ entity: 'note', entityId: note.id, op: 'delete', baseRevision: note.revision },
			this.iso()
		);
	}

	async list(query: NoteQuery = {}): Promise<Note[]> {
		await this.gate.read();
		await this.purgeExpired();
		return queryNotes(await this.d.db.notes.toArray(), query);
	}

	async get(id: Id): Promise<Note> {
		await this.gate.read();
		return this.find(id);
	}

	async create(draft: NoteDraft = {}): Promise<Note> {
		await this.gate.write();
		const { db } = this.d;
		const now = this.iso();
		const note: Note = {
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
		};
		await db.transaction('rw', db.notes, db.outbox, () => this.save(note));
		return note;
	}

	async update(id: Id, patch: NoteDraft): Promise<Note> {
		await this.gate.write();
		const { db } = this.d;
		return db.transaction('rw', db.notes, db.folders, db.outbox, async () => {
			const note = await this.find(id);
			if (note.deletedAt) throw fail.validation({ note: 'in-trash' });
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
			const saved = this.touch(next);
			await this.save(saved);
			return saved;
		});
	}

	async duplicate(id: Id): Promise<Note> {
		await this.gate.write();
		const { db } = this.d;
		return db.transaction('rw', db.notes, db.outbox, async () => {
			const src = await this.find(id);
			const now = this.iso();
			const copy: Note = {
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
			};
			await this.save(copy);
			return copy;
		});
	}

	async moveToTrash(id: Id): Promise<Note> {
		await this.gate.write();
		const { db } = this.d;
		return db.transaction('rw', db.notes, db.outbox, async () => {
			const note = await this.find(id);
			const saved = this.touch({ ...note, deletedAt: this.iso(), pinned: false });
			await this.save(saved);
			return saved;
		});
	}

	async restore(id: Id): Promise<Note> {
		await this.gate.write();
		const { db } = this.d;
		return db.transaction('rw', db.notes, db.outbox, async () => {
			const note = await this.find(id);
			const saved = this.touch({ ...note, deletedAt: null });
			await this.save(saved);
			return saved;
		});
	}

	async deleteForever(id: Id): Promise<void> {
		await this.gate.write();
		const { db } = this.d;
		await db.transaction('rw', db.notes, db.outbox, db.conflicts, async () => {
			const note = await this.find(id);
			await this.remove(note);
			await db.conflicts.delete(id);
		});
	}

	async emptyTrash(): Promise<number> {
		await this.gate.write();
		const { db } = this.d;
		return db.transaction('rw', db.notes, db.outbox, db.conflicts, async () => {
			const trashed = await db.notes.filter((n) => n.deletedAt !== null).toArray();
			for (const note of trashed) {
				await this.remove(note);
				await db.conflicts.delete(note.id);
			}
			return trashed.length;
		});
	}
}
