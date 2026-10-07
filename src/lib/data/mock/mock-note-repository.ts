import {
	fail,
	normalizeTag,
	TRASH_RETENTION_DAYS,
	type Id,
	type Note,
	type NoteDraft,
	type NoteQuery
} from '#lib/domain/index.js';
import type { NoteRepository } from '../contracts.js';
import { DEMO_DEVICE_ID } from './fixtures/index.js';
import type { MockDatabase } from './mock-database.js';

const clone = <T>(v: T): T => structuredClone(v);

export class MockNoteRepository implements NoteRepository {
	constructor(private db: MockDatabase) {}

	private find(id: Id): Note {
		const note = this.db.notes.find((n) => n.id === id);
		if (!note) throw fail.notFound('note');
		return note;
	}

	/** La papelera se vacía sola a los 30 días. */
	private purgeExpired() {
		const limit = this.db.now().getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
		this.db.notes = this.db.notes.filter(
			(n) => !n.deletedAt || new Date(n.deletedAt).getTime() > limit
		);
	}

	private touch(note: Note) {
		note.updatedAt = this.db.now().toISOString();
		note.syncStatus = 'pending';
		note.lastEditedDeviceId = DEMO_DEVICE_ID;
	}

	async list(query: NoteQuery = {}): Promise<Note[]> {
		await this.db.local('read');
		this.purgeExpired();
		const filter = query.filter ?? { kind: 'all' };
		let items = this.db.notes.filter((n) => {
			if (filter.kind === 'trash') return n.deletedAt !== null;
			if (n.deletedAt) return false;
			switch (filter.kind) {
				case 'pinned':
					return n.pinned;
				case 'folder':
					return n.folderId === filter.folderId;
				case 'tag':
					return n.tags.includes(filter.tag);
				default:
					return true;
			}
		});
		const sort = query.sort ?? 'updated';
		items = [...items].sort((a, b) =>
			sort === 'title'
				? a.title.localeCompare(b.title, 'es', { sensitivity: 'base' })
				: sort === 'created'
					? b.createdAt.localeCompare(a.createdAt)
					: b.updatedAt.localeCompare(a.updatedAt)
		);
		return clone(items);
	}

	async get(id: Id): Promise<Note> {
		await this.db.local('read');
		return clone(this.find(id));
	}

	async create(draft: NoteDraft = {}): Promise<Note> {
		await this.db.local('write');
		const now = this.db.now().toISOString();
		const note: Note = {
			id: this.db.nextId('n'),
			folderId: draft.folderId ?? null,
			title: draft.title ?? '',
			content: draft.content ?? '',
			tags: (draft.tags ?? []).map(normalizeTag).filter(Boolean),
			pinned: draft.pinned ?? false,
			createdAt: now,
			updatedAt: now,
			deletedAt: null,
			revision: 0,
			syncStatus: 'pending',
			lastEditedDeviceId: DEMO_DEVICE_ID
		};
		this.db.notes.unshift(note);
		return clone(note);
	}

	async update(id: Id, patch: NoteDraft): Promise<Note> {
		await this.db.local('write');
		const note = this.find(id);
		if (note.deletedAt) throw fail.validation({ note: 'in-trash' });
		if (patch.title !== undefined) note.title = patch.title;
		if (patch.content !== undefined) note.content = patch.content;
		if (patch.folderId !== undefined) {
			if (patch.folderId !== null && !this.db.folders.some((f) => f.id === patch.folderId))
				throw fail.notFound('folder');
			note.folderId = patch.folderId;
		}
		if (patch.tags !== undefined)
			note.tags = [...new Set(patch.tags.map(normalizeTag))].filter(Boolean);
		if (patch.pinned !== undefined) note.pinned = patch.pinned;
		this.touch(note);
		return clone(note);
	}

	async duplicate(id: Id): Promise<Note> {
		await this.db.local('write');
		const src = this.find(id);
		const now = this.db.now().toISOString();
		const copy: Note = {
			...clone(src),
			id: this.db.nextId('n'),
			title: `${src.title} (copia)`,
			pinned: false,
			createdAt: now,
			updatedAt: now,
			revision: 0,
			syncStatus: 'pending'
		};
		this.db.notes.unshift(copy);
		return clone(copy);
	}

	async moveToTrash(id: Id): Promise<Note> {
		await this.db.local('write');
		const note = this.find(id);
		note.deletedAt = this.db.now().toISOString();
		note.pinned = false;
		this.touch(note);
		return clone(note);
	}

	async restore(id: Id): Promise<Note> {
		await this.db.local('write');
		const note = this.find(id);
		note.deletedAt = null;
		this.touch(note);
		return clone(note);
	}

	async deleteForever(id: Id): Promise<void> {
		await this.db.local('write');
		this.find(id);
		this.db.notes = this.db.notes.filter((n) => n.id !== id);
	}

	async emptyTrash(): Promise<number> {
		await this.db.local('write');
		const before = this.db.notes.length;
		this.db.notes = this.db.notes.filter((n) => !n.deletedAt);
		return before - this.db.notes.length;
	}
}
