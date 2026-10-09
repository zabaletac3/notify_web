import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, lockTimeoutExceeded, normalizeSettings } from './settings.js';

const NOW = 1_000_000_000_000;

describe('lockTimeoutExceeded', () => {
	it('con un valor numérico compara con la última actividad', () => {
		expect(lockTimeoutExceeded('1m', NOW - 30_000, NOW)).toBe(false);
		expect(lockTimeoutExceeded('1m', NOW - 61_000, NOW)).toBe(true);
	});

	it('sin dato de actividad no bloquea', () => {
		expect(lockTimeoutExceeded('1m', null, NOW)).toBe(false);
	});

	it('"Nunca" no bloquea aunque pasen horas', () => {
		expect(lockTimeoutExceeded('never', NOW - 10 * 60 * 60_000, NOW)).toBe(false);
	});

	it('"Inmediatamente" no depende del tiempo (lo gestiona la visibilidad)', () => {
		expect(lockTimeoutExceeded('immediately', NOW - 10 * 60 * 60_000, NOW)).toBe(false);
	});
});

describe('normalizeSettings', () => {
	it('mezcla con los valores por defecto', () => {
		expect(normalizeSettings({ lockTimeout: '5m' }).lockTimeout).toBe('5m');
		expect(normalizeSettings({}).theme).toBe(DEFAULT_SETTINGS.theme);
	});

	it('descarta valores desconocidos', () => {
		expect(
			normalizeSettings({ lockTimeout: '2h' as never, theme: 'neon' as never }).lockTimeout
		).toBe(DEFAULT_SETTINGS.lockTimeout);
	});

	it('acepta "never"', () => {
		expect(normalizeSettings({ lockTimeout: 'never' }).lockTimeout).toBe('never');
	});
});
