import type { Id, IsoDate } from './ids.js';

/** Enlace público de solo lectura a una nota. */
export interface ShareLink {
	id: Id;
	noteId: Id;
	url: string;
	readOnly: true;
	createdAt: IsoDate;
}
