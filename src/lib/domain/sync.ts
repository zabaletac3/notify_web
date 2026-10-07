import type { Id, IsoDate } from './ids.js';

/** Fase de la sincronización (la barra de estado y los avisos se derivan de aquí). */
export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

/** Una versión de la nota involucrada en un conflicto. */
export interface NoteVersion {
	title: string;
	content: string;
	editedAt: IsoDate;
	deviceName: string;
}

/** La misma nota se editó en dos dispositivos a la vez. */
export interface Conflict {
	noteId: Id;
	local: NoteVersion;
	remote: NoteVersion;
}

/** `local` = conservar esta versión · `remote` = usar la de la nube · `both` = conservar ambas. */
export type ConflictResolution = 'local' | 'remote' | 'both';

export interface SyncSnapshot {
	phase: SyncPhase;
	lastSyncedAt: IsoDate | null;
	/** Cambios locales que aún no se subieron. */
	pendingCount: number;
	conflicts: Conflict[];
}
