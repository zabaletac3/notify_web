import type { Id, IsoDate } from './ids.js';

export interface User {
	id: Id;
	email: string;
	fullName: string;
	emailVerified: boolean;
	/** La cuenta tiene una identidad de Google vinculada (la contraseña sigue siendo necesaria). */
	hasGoogle: boolean;
	createdAt: IsoDate;
}
