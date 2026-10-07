import type { Id, IsoDate } from './ids.js';

export interface Folder {
	id: Id;
	name: string;
	createdAt: IsoDate;
	updatedAt: IsoDate;
}

export const FOLDER_NAME_MAX_LENGTH = 30;
