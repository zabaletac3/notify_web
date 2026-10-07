import type { IsoDate } from './ids.js';
import type { User } from './user.js';

export interface Session {
	user: User;
	/** Vence el token de acceso; el de renovación lo gestiona la capa de datos. */
	expiresAt: IsoDate;
}

export interface RegisterInput {
	fullName: string;
	email: string;
	password: string;
	acceptedTerms: boolean;
}

export interface LoginInput {
	email: string;
	password: string;
}

/** Estado de autenticación visible para la UI. */
export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated' | 'expired';

/** Longitud del código de verificación de correo. */
export const VERIFICATION_CODE_LENGTH = 6;
