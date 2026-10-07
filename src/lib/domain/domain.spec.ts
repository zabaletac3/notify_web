import { describe, expect, it } from 'vitest';
import {
	TRASH_RETENTION_DAYS,
	countWords,
	daysUntilPurge,
	derivePreview,
	foldText,
	groupNotes,
	isValidEmail,
	normalizeTag,
	passwordStrength,
	toAppError,
	validateFolderName,
	validateLogin,
	validateNewPassword,
	validateRegister,
	validateVerificationCode,
	AppFailure,
	fail,
	type Note
} from './index.js';

const note = (over: Partial<Note>): Note => ({
	id: 'n',
	folderId: null,
	title: 't',
	content: '',
	tags: [],
	pinned: false,
	createdAt: '2026-10-01T00:00:00.000Z',
	updatedAt: '2026-10-01T00:00:00.000Z',
	deletedAt: null,
	revision: 1,
	syncStatus: 'synced',
	lastEditedDeviceId: 'd',
	...over
});

describe('validación', () => {
	it('valida correos', () => {
		expect(isValidEmail('ana@correo.com')).toBe(true);
		expect(isValidEmail(' ana@correo.com ')).toBe(true);
		for (const bad of ['', 'ana', 'ana@', 'ana@correo', 'a b@correo.com']) {
			expect(isValidEmail(bad), bad).toBe(false);
		}
	});

	it('mide la fortaleza de la contraseña en 4 niveles', () => {
		expect(passwordStrength('').score).toBe(0);
		expect(passwordStrength('abc').score).toBe(0);
		expect(passwordStrength('abcdefgh').score).toBe(1);
		expect(passwordStrength('Abcdefgh').score).toBe(2);
		expect(passwordStrength('Abcdefg1').score).toBe(3);
		expect(passwordStrength('Abcdef1!')).toEqual({ score: 4, label: 'Fuerte' });
	});

	it('valida el registro campo por campo', () => {
		const v = validateRegister({
			fullName: 'A',
			email: 'x',
			password: '123',
			acceptedTerms: false
		});
		expect(v).toEqual({
			valid: false,
			errors: {
				fullName: 'name-too-short',
				email: 'invalid-email',
				password: 'password-too-short',
				acceptedTerms: 'terms-required'
			}
		});
		expect(
			validateRegister({
				fullName: 'Ana Pérez',
				email: 'ana@correo.com',
				password: 'Secret123!',
				acceptedTerms: true
			})
		).toEqual({ valid: true });
	});

	it('valida el inicio de sesión', () => {
		expect(validateLogin({ email: '', password: '' })).toEqual({
			valid: false,
			errors: { email: 'required', password: 'required' }
		});
		expect(validateLogin({ email: 'ana@correo.com', password: 'x' }).valid).toBe(true);
	});

	it('valida la nueva contraseña y su confirmación', () => {
		expect(validateNewPassword('Secret123!', 'otra')).toEqual({
			valid: false,
			errors: { confirmation: 'passwords-dont-match' }
		});
		expect(validateNewPassword('corta', 'corta')).toMatchObject({
			valid: false,
			errors: { password: 'password-too-short' }
		});
		expect(validateNewPassword('Secret123!', 'Secret123!').valid).toBe(true);
	});

	it('valida el código de verificación de 6 dígitos', () => {
		expect(validateVerificationCode('123456').valid).toBe(true);
		for (const bad of ['', '12345', '1234567', 'abcdef', '12 456']) {
			expect(validateVerificationCode(bad).valid, bad).toBe(false);
		}
	});

	it('valida el nombre de carpeta: obligatorio, máximo 30 y único sin tildes ni mayúsculas', () => {
		const existing = ['Universidad', 'Recetas'];
		expect(validateFolderName('  ', existing)).toEqual({
			valid: false,
			errors: { name: 'required' }
		});
		expect(validateFolderName('x'.repeat(31), existing)).toMatchObject({
			errors: { name: 'name-too-long' }
		});
		expect(validateFolderName('universidad', existing)).toMatchObject({
			errors: { name: 'name-taken' }
		});
		expect(validateFolderName('RÉCETAS', existing)).toMatchObject({
			errors: { name: 'name-taken' }
		});
		expect(validateFolderName('Proyectos', existing).valid).toBe(true);
	});
});

describe('texto de notas', () => {
	it('deriva una vista previa sin sintaxis Markdown', () => {
		const md =
			'# Título\n\nLa **normalización** organiza [tablas](http://x).\n\n- [x] Hecho\n- [ ] Pendiente';
		expect(derivePreview(md)).toBe('Título La normalización organiza tablas. Hecho Pendiente');
	});

	it('recorta la vista previa larga con elipsis', () => {
		const p = derivePreview('palabra '.repeat(40), 30);
		expect(p.length).toBeLessThanOrEqual(30);
		expect(p.endsWith('…')).toBe(true);
	});

	it('cuenta palabras', () => {
		expect(countWords('')).toBe(0);
		expect(countWords('# Hola mundo\n\n- uno\n- dos')).toBe(4);
	});

	it('normaliza etiquetas', () => {
		expect(normalizeTag('#Proyecto Final')).toBe('proyecto-final');
		expect(normalizeTag('  Parcial!  ')).toBe('parcial');
	});

	it('quita tildes y mayúsculas para buscar', () => {
		expect(foldText('Normalización ÁÉÍ')).toBe('normalizacion aei');
	});
});

describe('agrupación de notas (como la lista del diseño)', () => {
	const now = new Date(2026, 9, 7, 12, 0); // 7 oct 2026, hora local
	const at = (y: number, m: number, d: number, h = 10) => new Date(y, m, d, h).toISOString();

	it('agrupa en Fijadas · Hoy · Esta semana · mes', () => {
		const groups = groupNotes(
			[
				note({ id: 'a', pinned: true, updatedAt: at(2026, 9, 1) }),
				note({ id: 'b', updatedAt: at(2026, 9, 7, 9) }),
				note({ id: 'c', updatedAt: at(2026, 9, 4) }),
				note({ id: 'd', updatedAt: at(2026, 8, 28) }),
				note({ id: 'e', updatedAt: at(2025, 8, 3) })
			],
			now
		);
		expect(groups.map((g) => [g.key, g.label, g.notes.map((n) => n.id)])).toEqual([
			['pinned', 'Fijadas', ['a']],
			['today', 'Hoy', ['b']],
			['week', 'Esta semana', ['c']],
			['2026-09', 'Septiembre', ['d']],
			['2025-09', 'Septiembre 2025', ['e']]
		]);
	});

	it('no genera grupos vacíos', () => {
		expect(groupNotes([], now)).toEqual([]);
	});

	it('calcula los días que faltan para vaciar la papelera', () => {
		const days = (ago: number) =>
			daysUntilPurge(
				new Date(now.getTime() - ago * 86400000).toISOString(),
				now,
				TRASH_RETENTION_DAYS
			);
		expect(days(1)).toBe(29);
		expect(days(14)).toBe(16);
		expect(days(21)).toBe(9);
		expect(days(45)).toBe(0);
	});
});

describe('errores', () => {
	it('AppFailure transporta un AppError tipado', () => {
		const f = fail.validation({ email: 'email-taken' });
		expect(f).toBeInstanceOf(AppFailure);
		expect(toAppError(f)).toEqual({ kind: 'validation', fields: { email: 'email-taken' } });
	});

	it('convierte excepciones desconocidas en `unknown`', () => {
		expect(toAppError(new Error('boom'))).toEqual({ kind: 'unknown', message: 'boom' });
		expect(toAppError('x')).toEqual({ kind: 'unknown', message: 'x' });
	});
});

describe('agrupación: orden de los grupos', () => {
	const now = new Date(2026, 9, 7, 12, 0);
	const at = (y: number, m: number, d: number) => new Date(y, m, d, 10).toISOString();

	it('Fijadas siempre primero y los meses de más nuevo a más viejo, aunque las notas vengan desordenadas', () => {
		const groups = groupNotes(
			[
				note({ id: 'old', updatedAt: at(2026, 7, 3) }),
				note({ id: 'today', updatedAt: at(2026, 9, 7) }),
				note({ id: 'sep', updatedAt: at(2026, 8, 20) }),
				note({ id: 'pin', pinned: true, updatedAt: at(2026, 0, 1) })
			],
			now
		);
		expect(groups.map((g) => g.key)).toEqual(['pinned', 'today', '2026-09', '2026-08']);
	});
});
