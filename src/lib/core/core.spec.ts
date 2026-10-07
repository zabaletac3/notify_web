import { describe, expect, it } from 'vitest';
import type { ValidationCode } from '#lib/domain/index.js';
import { fail } from '#lib/domain/index.js';
import {
	attempt,
	errorMessage,
	formatNoteDate,
	formatRelativeTime,
	validationMessage,
	validationMessages
} from './index.js';

const now = new Date(2026, 9, 7, 12, 0);
const at = (y: number, m: number, d: number, h = 9, min = 12) =>
	new Date(y, m, d, h, min).toISOString();

describe('formatNoteDate (lista de notas)', () => {
	it('hoy → hora', () => expect(formatNoteDate(at(2026, 9, 7, 9, 12), now)).toBe('09:12'));
	it('ayer → "Ayer"', () => expect(formatNoteDate(at(2026, 9, 6), now)).toBe('Ayer'));
	it('últimos días → día de la semana', () =>
		expect(formatNoteDate(at(2026, 9, 5), now)).toBe('Lun'));
	it('antes → día y mes', () => expect(formatNoteDate(at(2026, 8, 28), now)).toMatch(/^28 sep/));
	it('otro año → con año', () => expect(formatNoteDate(at(2025, 8, 28), now)).toMatch(/2025/));
});

describe('tiempo relativo', () => {
	it('expresa minutos, horas y días', () => {
		const ago = (min: number) => new Date(now.getTime() - min * 60000).toISOString();
		expect(formatRelativeTime(ago(0), now)).toBe('ahora mismo');
		expect(formatRelativeTime(ago(2), now)).toMatch(/2 minutos/);
		expect(formatRelativeTime(ago(180), now)).toMatch(/3 horas/);
		expect(formatRelativeTime(ago(60 * 24 * 3), now)).toMatch(/3 días/);
	});
});

describe('mensajes', () => {
	it('todo código de validación tiene texto en español', () => {
		const codes: ValidationCode[] = [
			'required',
			'invalid-email',
			'password-too-short',
			'passwords-dont-match',
			'terms-required',
			'name-too-short',
			'name-too-long',
			'name-taken',
			'invalid-code',
			'invalid-token',
			'email-taken'
		];
		for (const c of codes) expect(validationMessages[c], c).toBeTruthy();
		expect(validationMessage(undefined)).toBeUndefined();
	});

	it('cada tipo de error tiene un mensaje', () => {
		expect(errorMessage({ kind: 'network' })).toMatch(/Sin conexión/);
		expect(errorMessage({ kind: 'session-expired' })).toMatch(/sesión expiró/);
		expect(errorMessage({ kind: 'unauthorized' })).toMatch(/incorrectos/);
	});
});

describe('attempt', () => {
	it('devuelve éxito con valor', async () => {
		expect(await attempt(async () => 42)).toEqual({ ok: true, value: 42 });
	});
	it('captura fallos tipados sin lanzar', async () => {
		const r = await attempt(async () => {
			throw fail.network();
		});
		expect(r).toEqual({ ok: false, error: { kind: 'network' } });
	});
});
