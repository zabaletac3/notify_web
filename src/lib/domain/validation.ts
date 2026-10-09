import { FOLDER_NAME_MAX_LENGTH } from './folder.js';
import {
	VERIFICATION_CODE_LENGTH,
	isMfaCode,
	type LoginInput,
	type RegisterInput
} from './auth.js';

/** Códigos de validación. El texto en español está en `core/messages.ts`. */
export type ValidationCode =
	| 'required'
	| 'invalid-email'
	| 'password-too-short'
	| 'passwords-dont-match'
	| 'terms-required'
	| 'name-too-short'
	| 'name-too-long'
	| 'name-taken'
	| 'invalid-code'
	| 'invalid-token'
	| 'email-taken'
	| 'wrong-password'
	| 'same-password'
	| 'invalid-recovery-key'
	| 'invalid-payload'
	| 'wipe-not-confirmed';

export type FieldErrors = Record<string, ValidationCode>;

export type Validation = { valid: true } | { valid: false; errors: FieldErrors };

const done = (errors: FieldErrors): Validation =>
	Object.keys(errors).length ? { valid: false, errors } : { valid: true };

export const PASSWORD_MIN_LENGTH = 8;

export function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export type PasswordStrength = {
	/** 0 = muy débil … 4 = fuerte. Son los 4 segmentos del medidor del diseño. */
	score: 0 | 1 | 2 | 3 | 4;
	label: 'Muy débil' | 'Débil' | 'Aceptable' | 'Buena' | 'Fuerte';
};

export function passwordStrength(password: string): PasswordStrength {
	if (!password) return { score: 0, label: 'Muy débil' };
	let score = 0;
	if (password.length >= PASSWORD_MIN_LENGTH) score++;
	if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
	if (/\d/.test(password)) score++;
	if (/[^A-Za-z0-9]/.test(password)) score++;
	const s = Math.min(4, score) as PasswordStrength['score'];
	const labels: PasswordStrength['label'][] = [
		'Muy débil',
		'Débil',
		'Aceptable',
		'Buena',
		'Fuerte'
	];
	return { score: s, label: labels[s] };
}

export function validateRegister(input: RegisterInput): Validation {
	const errors: FieldErrors = {};
	if (input.fullName.trim().length < 2) errors.fullName = 'name-too-short';
	if (!input.email.trim()) errors.email = 'required';
	else if (!isValidEmail(input.email)) errors.email = 'invalid-email';
	if (input.password.length < PASSWORD_MIN_LENGTH) errors.password = 'password-too-short';
	if (!input.acceptedTerms) errors.acceptedTerms = 'terms-required';
	return done(errors);
}

export function validateLogin(input: LoginInput): Validation {
	const errors: FieldErrors = {};
	if (!input.email.trim()) errors.email = 'required';
	else if (!isValidEmail(input.email)) errors.email = 'invalid-email';
	if (!input.password) errors.password = 'required';
	return done(errors);
}

export function validateEmail(email: string): Validation {
	if (!email.trim()) return done({ email: 'required' });
	return done(isValidEmail(email) ? {} : { email: 'invalid-email' });
}

export function validateNewPassword(password: string, confirmation: string): Validation {
	const errors: FieldErrors = {};
	if (password.length < PASSWORD_MIN_LENGTH) errors.password = 'password-too-short';
	if (confirmation !== password) errors.confirmation = 'passwords-dont-match';
	return done(errors);
}

/** Restablecer la contraseña: contraseña nueva y, según la opción, la clave de recuperación o la confirmación de borrado. */
export function validatePasswordReset(
	password: string,
	confirmation: string,
	choice: { mode: 'keep'; recoveryKey: string } | { mode: 'wipe'; confirmed: boolean }
): Validation {
	const errors: FieldErrors = {};
	if (password.length < PASSWORD_MIN_LENGTH) errors.password = 'password-too-short';
	if (confirmation !== password) errors.confirmation = 'passwords-dont-match';
	if (choice.mode === 'keep' && !choice.recoveryKey.trim()) errors.recoveryKey = 'required';
	if (choice.mode === 'wipe' && !choice.confirmed) errors.wipe = 'wipe-not-confirmed';
	return done(errors);
}

export function validateVerificationCode(code: string): Validation {
	return done(
		new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`).test(code) ? {} : { code: 'invalid-code' }
	);
}

/** Código del segundo paso: 6 dígitos (TOTP) o código de respaldo (`XXXXX-XXXXX`). */
export function validateMfaCode(code: string): Validation {
	return done(isMfaCode(code) ? {} : { code: 'invalid-code' });
}

/** Nombre de carpeta: 1–30 caracteres y único (sin distinguir mayúsculas ni tildes). */
export function validateFolderName(name: string, existing: string[]): Validation {
	const trimmed = name.trim();
	if (!trimmed) return done({ name: 'required' });
	if (trimmed.length > FOLDER_NAME_MAX_LENGTH) return done({ name: 'name-too-long' });
	const fold = (s: string) =>
		s
			.normalize('NFD')
			.replace(/\p{Diacritic}/gu, '')
			.toLowerCase();
	if (existing.some((e) => fold(e) === fold(trimmed))) return done({ name: 'name-taken' });
	return done({});
}

export function validateProfileName(fullName: string): Validation {
	return done(fullName.trim().length < 2 ? { fullName: 'name-too-short' } : {});
}

/** Cambio de correo: correo nuevo válido y contraseña actual (para confirmar que eres tú). */
export function validateEmailChange(email: string, password: string): Validation {
	const errors: FieldErrors = {};
	if (!email.trim()) errors.email = 'required';
	else if (!isValidEmail(email)) errors.email = 'invalid-email';
	if (!password) errors.password = 'required';
	return done(errors);
}

export function validateChangePassword(
	currentPassword: string,
	newPassword: string,
	confirmation: string
): Validation {
	const errors: FieldErrors = {};
	if (!currentPassword) errors.currentPassword = 'required';
	if (newPassword.length < PASSWORD_MIN_LENGTH) errors.password = 'password-too-short';
	else if (newPassword === currentPassword) errors.password = 'same-password';
	if (confirmation !== newPassword) errors.confirmation = 'passwords-dont-match';
	return done(errors);
}
