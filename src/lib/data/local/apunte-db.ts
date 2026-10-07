import Dexie, { type Table } from 'dexie';
import type {
	Folder,
	FolderFields,
	Id,
	IsoDate,
	Note,
	NoteFields,
	SyncEntity,
	SyncOp
} from '#lib/domain/index.js';

/** Carpeta guardada en local: lleva la revisión que el servidor le asignó. */
export interface FolderRow extends Folder {
	revision: number;
}

/** Un cambio hecho en este dispositivo que aún no se subió. Hay como máximo uno por entidad. */
export interface OutboxEntry {
	seq?: number;
	entity: SyncEntity;
	entityId: Id;
	op: SyncOp;
	/** Revisión del servidor que se conocía al hacer el primer cambio pendiente (0 = creada sin conexión). */
	baseRevision: number;
	data?: NoteFields | FolderFields;
	/** Sube con cada edición; permite saber si cambió mientras se estaba sincronizando. */
	version: number;
	changedAt: IsoDate;
}

/** Nota con edición local y remota a la vez, pendiente de que el usuario elija. */
export interface ConflictRow {
	noteId: Id;
	remote: Note;
	remoteDeviceName: string;
	detectedAt: IsoDate;
}

export interface MetaRow {
	key: string;
	value: unknown;
}

/** Base de datos local (IndexedDB): la copia de trabajo de la app. */
export class ApunteDb extends Dexie {
	notes!: Table<Note, Id>;
	folders!: Table<FolderRow, Id>;
	outbox!: Table<OutboxEntry, number>;
	conflicts!: Table<ConflictRow, Id>;
	meta!: Table<MetaRow, string>;

	constructor(name = 'apunte') {
		super(name);
		this.version(1).stores({
			notes: 'id, folderId, deletedAt, updatedAt',
			folders: 'id',
			outbox: '++seq, [entity+entityId]',
			conflicts: 'noteId',
			meta: 'key'
		});
	}

	async getMeta<T>(key: string): Promise<T | undefined> {
		return (await this.meta.get(key))?.value as T | undefined;
	}

	async setMeta(key: string, value: unknown): Promise<void> {
		await this.meta.put({ key, value });
	}

	/** Borra todo (al cerrar sesión). Los datos siguen en el servidor. */
	async clearAll(): Promise<void> {
		await this.transaction('rw', this.tables, async () => {
			for (const table of this.tables) await table.clear();
		});
	}
}
