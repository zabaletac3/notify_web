import type { Sealed } from './crypto.js';
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

// ── Variante cifrada (ver `docs/adr/0005-cifrado-extremo-a-extremo.md`) ──────────────────────
//
// Con cifrado de extremo a extremo el servidor solo ve los metadatos que necesita (id, carpeta,
// fechas, papelera, revisión) y dos textos cifrados: la clave de la nota (`wrappedKey`, cifrada con
// la clave maestra) y su contenido (`payload`: título, texto, etiquetas y fijada, cifrado con esa clave).
// Estos tipos sustituyen a `NoteFields`/`Note` en el transporte cuando se activa la fase 5.

/** Una nota tal como la guarda el servidor. */
export interface EncryptedNote {
	id: Id;
	folderId: Id | null;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
	revision: number;
	lastEditedDeviceId: Id;
	wrappedKey: Sealed;
	/** JSON `{ title, content, tags, pinned }` rellenado y cifrado. */
	payload: Sealed;
}

/** Una carpeta tal como la guarda el servidor. */
export interface EncryptedFolder {
	id: Id;
	createdAt: string;
	updatedAt: string;
	revision: number;
	wrappedKey: Sealed;
	/** JSON `{ name }` rellenado y cifrado. */
	payload: Sealed;
}

/** Campos de una nota cifrada que viajan en un `upsert` (el resto los pone el servidor). */
export type EncryptedNoteFields = Omit<EncryptedNote, 'id' | 'revision' | 'lastEditedDeviceId'>;
export type EncryptedFolderFields = Omit<EncryptedFolder, 'id' | 'revision'>;

export interface EncryptedSyncChange extends Omit<SyncChange, 'data'> {
	data?: EncryptedNoteFields | EncryptedFolderFields;
}

export interface EncryptedSyncRequest extends Omit<SyncRequest, 'changes'> {
	changes: EncryptedSyncChange[];
}

export interface EncryptedSyncRemoteChange extends Omit<SyncRemoteChange, 'note' | 'folder'> {
	note?: EncryptedNote;
	folder?: EncryptedFolder;
}

export interface EncryptedSyncConflictReport extends Omit<SyncConflictReport, 'remote'> {
	remote: EncryptedNote;
}

export interface EncryptedSyncResponse extends Omit<SyncResponse, 'remoteChanges' | 'conflicts'> {
	remoteChanges: EncryptedSyncRemoteChange[];
	conflicts: EncryptedSyncConflictReport[];
}
