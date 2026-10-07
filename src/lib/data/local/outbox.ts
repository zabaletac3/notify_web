import type {
	Folder,
	FolderFields,
	Id,
	IsoDate,
	Note,
	NoteFields,
	SyncEntity
} from '#lib/domain/index.js';
import type { ApunteDb, OutboxEntry } from './apunte-db.js';

export const noteFields = (n: Note): NoteFields => ({
	folderId: n.folderId,
	title: n.title,
	content: n.content,
	tags: [...n.tags],
	pinned: n.pinned,
	createdAt: n.createdAt,
	updatedAt: n.updatedAt,
	deletedAt: n.deletedAt
});

export const folderFields = (f: Folder): FolderFields => ({
	name: f.name,
	createdAt: f.createdAt,
	updatedAt: f.updatedAt
});

export interface PendingChange {
	entity: SyncEntity;
	entityId: Id;
	op: 'upsert' | 'delete';
	baseRevision: number;
	data?: NoteFields | FolderFields;
}

/**
 * Apunta un cambio en la cola. Debe llamarse dentro de una transacción que incluya `db.outbox`.
 *
 * Se funden los cambios de una misma entidad:
 *  - varias ediciones → una sola, con la `baseRevision` más antigua y los datos más recientes;
 *  - crear y borrar sin haber sincronizado → no queda nada que contarle al servidor;
 *  - editar y luego borrar → solo el borrado.
 */
export async function enqueue(db: ApunteDb, change: PendingChange, now: IsoDate): Promise<void> {
	const existing = await db.outbox
		.where('[entity+entityId]')
		.equals([change.entity, change.entityId])
		.first();

	if (!existing) {
		if (change.op === 'delete' && change.baseRevision === 0) return; // nunca llegó al servidor
		await db.outbox.add({ ...change, version: 1, changedAt: now });
		return;
	}

	if (change.op === 'delete') {
		if (existing.baseRevision === 0) {
			await db.outbox.delete(existing.seq!);
			return;
		}
		await db.outbox.put({
			...existing,
			op: 'delete',
			data: undefined,
			version: existing.version + 1,
			changedAt: now
		});
		return;
	}

	await db.outbox.put({
		...existing,
		op: 'upsert',
		data: change.data,
		version: existing.version + 1,
		changedAt: now
	});
}

export type { OutboxEntry };
