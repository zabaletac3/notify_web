import type { Id, IsoDate } from './ids.js';

export interface User {
	id: Id;
	email: string;
	fullName: string;
	emailVerified: boolean;
	createdAt: IsoDate;
}
