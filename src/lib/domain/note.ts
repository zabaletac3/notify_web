import type { Id, IsoDate } from './ids.js';

/** Estado de sincronización de una nota respecto al servidor. */
export type NoteSyncStatus = 'synced' | 'pending' | 'conflict';

/** Días que una nota permanece en la papelera antes de eliminarse definitivamente. */
export const TRASH_RETENTION_DAYS = 30;

export interface Note {
	id: Id;
	/** `null` = sin carpeta. */
	folderId: Id | null;
	title: string;
	/** Cuerpo en Markdown (CommonMark + GFM). Ver ADR 0002. */
	content: string;
	/** Etiquetas sin `#`, en minúsculas. */
	tags: string[];
	pinned: boolean;
	createdAt: IsoDate;
	updatedAt: IsoDate;
	/** `null` = activa; con fecha = en la papelera. */
	deletedAt: IsoDate | null;
	/** Revisión conocida del servidor. Base para detectar conflictos. */
	revision: number;
	syncStatus: NoteSyncStatus;
	lastEditedDeviceId: Id;
}

/** Campos que el usuario puede editar. */
export type NoteDraft = Partial<Pick<Note, 'title' | 'content' | 'folderId' | 'tags' | 'pinned'>>;

export type NoteSort = 'updated' | 'created' | 'title';

/** Qué lista se está viendo. */
export type NotesFilter =
	| { kind: 'all' }
	| { kind: 'pinned' }
	| { kind: 'folder'; folderId: Id | null }
	| { kind: 'tag'; tag: string }
	| { kind: 'trash' };

export interface NoteQuery {
	filter?: NotesFilter;
	sort?: NoteSort;
}

/** Conteos para la barra lateral. */
export interface NoteCounts {
	/** Notas activas (sin papelera). */
	all: number;
	pinned: number;
	trash: number;
	/** Notas activas sin carpeta. */
	unfiled: number;
	byFolder: Record<Id, number>;
	byTag: Record<string, number>;
}
