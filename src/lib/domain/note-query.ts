import type { Note, NoteQuery } from './note.js';

/** Aplica filtro y orden de una consulta. La papelera solo sale con `filter: { kind: 'trash' }`. */
export function queryNotes(notes: Note[], query: NoteQuery = {}): Note[] {
	const filter = query.filter ?? { kind: 'all' };
	const items = notes.filter((n) => {
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
	return items.sort((a, b) =>
		sort === 'title'
			? a.title.localeCompare(b.title, 'es', { sensitivity: 'base' })
			: sort === 'created'
				? b.createdAt.localeCompare(a.createdAt)
				: b.updatedAt.localeCompare(a.updatedAt)
	);
}
