import type { KdfParams, KeyBundle, LoginResult } from './crypto.js';
import type { Id, IsoDate } from './ids.js';
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

/**
 * Reto de segundo paso: el primer factor (contraseña) fue correcto pero falta el código.
 * No es una sesión: no trae `keys` ni tokens. Se completa con `AuthRepository.loginMfa`.
 */
export interface MfaChallenge {
	mfaRequired: true;
	/** Ticket de un solo uso y corta vida (5 minutos). */
	mfaToken: string;
	expiresAt: IsoDate;
}

/** Estado de la verificación en dos pasos de la cuenta. */
export interface MfaStatus {
	enabled: boolean;
	/** Cuándo se activó; `null` si no está activa. */
	enabledAt: IsoDate | null;
	/** Códigos de respaldo sin usar (0–10). */
	recoveryCodesLeft: number;
}

/**
 * Resultado de `googleExchange` (unión discriminada por `status`). Google solo aporta identidad:
 * una sesión (`authenticated`), un reto de segundo paso (`mfa-required`), o el paso previo para
 * vincular (`link-required`) o crear la cuenta (`signup-required`).
 */
export interface GoogleAuthenticated {
	status: 'authenticated';
	session: LoginResult;
}

export interface GoogleMfaRequired {
	status: 'mfa-required';
	mfaToken: string;
	expiresAt: IsoDate;
}

export interface GoogleLinkRequired {
	status: 'link-required';
	linkToken: string;
	email: string;
	kdf: KdfParams;
}

export interface GoogleSignupRequired {
	status: 'signup-required';
	signupToken: string;
	email: string;
	fullName: string;
}

export type GoogleOutcome =
	GoogleAuthenticated | GoogleMfaRequired | GoogleLinkRequired | GoogleSignupRequired;

/** Datos que la web envía para crear la cuenta desde el retorno de Google (correo ya verificado). */
export interface GoogleRegisterInput {
	signupToken: string;
	/** UUID v7 generado por el cliente (los datos asociados lo necesitan antes de que exista la cuenta). */
	userId: Id;
	fullName: string;
	acceptedTerms: boolean;
	authKey: string;
	recoveryAuth: string;
	keys: KeyBundle;
}

/** Lo que se muestra una sola vez al configurar el autenticador. */
export interface MfaSetupResult {
	/** Secreto en base32 sin relleno. */
	secret: string;
	/** URI `otpauth://` para generar el QR en el cliente. */
	otpauthUri: string;
}

/** Códigos de respaldo (se devuelven en claro una sola vez). */
export interface MfaRecoveryCodes {
	recoveryCodes: string[];
}

/** Longitud del código de verificación de correo. */
export const VERIFICATION_CODE_LENGTH = 6;

/** Longitud del código TOTP. */
export const MFA_CODE_LENGTH = 6;

/** Alfabeto y formato de un código de respaldo (`XXXXX-XXXXX`). */
export const MFA_RECOVERY_CODE_REGEX = /^[A-Z2-9]{5}-[A-Z2-9]{5}$/;

/** Un código MFA es de 6 dígitos (TOTP) o con forma de código de respaldo (`XXXXX-XXXXX`). */
export function isMfaCode(code: string): boolean {
	const trimmed = code.trim();
	return (
		new RegExp(`^\\d{${MFA_CODE_LENGTH}}$`).test(trimmed) || MFA_RECOVERY_CODE_REGEX.test(trimmed)
	);
}
