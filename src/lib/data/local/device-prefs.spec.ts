import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '#lib/domain/index.js';
import { DevicePrefs, devicePrefsKey, type PrefsStorage } from './device-prefs.js';

/** `localStorage` en memoria para las pruebas. */
function memoryStorage(): PrefsStorage {
	const map = new Map<string, string>();
	return {
		getItem: (k) => map.get(k) ?? null,
		setItem: (k, v) => void map.set(k, String(v)),
		removeItem: (k) => void map.delete(k)
	};
}

describe('DevicePrefs', () => {
	it('guarda y lee las preferencias de cada cuenta por separado', () => {
		const prefs = new DevicePrefs(memoryStorage());
		prefs.write('u_a', { ...DEFAULT_SETTINGS, lockTimeout: '15m' });
		prefs.write('u_b', { ...DEFAULT_SETTINGS, lockTimeout: '5m' });
		expect(prefs.read('u_a')?.lockTimeout).toBe('15m');
		expect(prefs.read('u_b')?.lockTimeout).toBe('5m');
		expect(prefs.read('u_c')).toBeNull();
	});

	it('tolera un JSON inválido o con forma rara', () => {
		const storage = memoryStorage();
		const prefs = new DevicePrefs(storage);
		storage.setItem(devicePrefsKey('u_a'), '{no es json');
		expect(prefs.read('u_a')).toBeNull();
		storage.setItem(devicePrefsKey('u_a'), JSON.stringify([1, 2, 3]));
		expect(prefs.read('u_a')).toBeNull();
	});

	it('descarta valores desconocidos y cae al valor por defecto', () => {
		const storage = memoryStorage();
		const prefs = new DevicePrefs(storage);
		storage.setItem(
			devicePrefsKey('u_a'),
			JSON.stringify({ lockTimeout: '2h', theme: 'neon', textSize: 'huge' })
		);
		const read = prefs.read('u_a');
		expect(read?.lockTimeout).toBe(DEFAULT_SETTINGS.lockTimeout);
		expect(read?.theme).toBe(DEFAULT_SETTINGS.theme);
		expect(read?.textSize).toBe(DEFAULT_SETTINGS.textSize);
	});

	it('sin almacenamiento no lee ni lanza', () => {
		const prefs = new DevicePrefs(undefined);
		// En Node no hay `localStorage`; se comporta como no disponible.
		expect(() => prefs.write('u_a', { ...DEFAULT_SETTINGS })).not.toThrow();
		expect(prefs.read('u_a')).toBeNull();
		expect(() => prefs.remove('u_a')).not.toThrow();
	});

	it('borra solo las preferencias de la cuenta indicada', () => {
		const prefs = new DevicePrefs(memoryStorage());
		prefs.write('u_a', { ...DEFAULT_SETTINGS });
		prefs.write('u_b', { ...DEFAULT_SETTINGS });
		prefs.remove('u_a');
		expect(prefs.read('u_a')).toBeNull();
		expect(prefs.read('u_b')).not.toBeNull();
	});
});
