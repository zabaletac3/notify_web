import type { Folder } from './folder.js';
import type { Id } from './ids.js';
import type { Note } from './note.js';

/**
 * Protocolo de sincronización entre un cliente y el servidor (ver `docs/adr/0004-sincronizacion.md`).
 *
 *  - Cada nota y carpeta tiene una `revision` que el servidor incrementa en cada escritura aceptada.
 *  - El cliente guarda sus cambios en una cola (outbox) y los envía con la `baseRevision` que conocía.
 *  - Si la revisión del servidor es distinta de `baseRevision` y es una nota, hay **conflicto**:
 *    el servidor no aplica el cambio y devuelve su versión; el cliente decide.
 *  - El servidor numera sus cambios con un contador; el `cursor` del cliente es el último que vio.
 *  - Mover a la papelera y restaurar son `upsert` (llevan `deletedAt`); `delete` es borrado definitivo.
 */

export type SyncEntity = 'note' | 'folder';
export type SyncOp = 'upsert' | 'delete';

/** Campos de una nota que viajan en un `upsert` (el resto los pone el servidor). */
export type NoteFields = Pick<
	Note,
	'folderId' | 'title' | 'content' | 'tags' | 'pinned' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;
export type FolderFields = Pick<Folder, 'name' | 'createdAt' | 'updatedAt'>;

export interface SyncChange {
	entity: SyncEntity;
	id: Id;
	op: SyncOp;
	/** Revisión que el cliente conocía (0 = la creó sin conexión). */
	baseRevision: number;
	/** Presente en `upsert`. */
	data?: NoteFields | FolderFields;
}

export interface SyncRequest {
	deviceId: Id;
	deviceName: string;
	/** Último cursor recibido, o `null` en el primer arranque (descarga todo). */
	cursor: string | null;
	changes: SyncChange[];
}

/** Un cambio del cliente que el servidor aceptó. */
export interface SyncApplied {
	entity: SyncEntity;
	id: Id;
	revision: number;
}

/** Algo que cambió en el servidor desde el cursor del cliente. */
export interface SyncRemoteChange {
	entity: SyncEntity;
	id: Id;
	deleted: boolean;
	revision: number;
	note?: Note;
	folder?: Folder;
}

export interface SyncConflictReport {
	noteId: Id;
	/** Versión actual del servidor. */
	remote: Note;
	remoteDeviceName: string;
}

export interface SyncResponse {
	cursor: string;
	applied: SyncApplied[];
	remoteChanges: SyncRemoteChange[];
	conflicts: SyncConflictReport[];
}
