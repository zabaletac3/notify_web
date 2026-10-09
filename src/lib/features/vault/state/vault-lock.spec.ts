import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DeviceKeyStore } from '#lib/data/index.js';
import { VaultState } from './vault.svelte.js';

// Extractable: la clave maestra real también lo es, porque el dispositivo la envuelve con `exportKey`.
const newKey = () =>
	crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

const newStore = () =>
	new DeviceKeyStore(`vault-lock-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Punto 4a: al bloquear (por inactividad o al ocultar la pestaña) debe borrarse la clave del
 * dispositivo, para que el bloqueo no se pueda saltar recargando.
 */
describe('bloqueo y clave del dispositivo', () => {
	it('al bloquear se borra la clave guardada y ya no se restaura', async () => {
		const store = newStore();
		const vault = new VaultState(store);
		await vault.unlock('u_a', await newKey(), true);
		expect(await store.load('u_a')).not.toBeNull();

		await vault.lock();
		expect(vault.status).toBe('locked');
		expect(await store.load('u_a')).toBeNull();
		expect(await vault.restore('u_a')).toBe(false);
	});

	it('forgetDevice borra solo la clave de esa cuenta', async () => {
		const store = newStore();
		await store.save('u_a', await newKey());
		await store.save('u_b', await newKey());
		const vault = new VaultState(store);
		await vault.forgetDevice('u_a');
		expect(await store.load('u_a')).toBeNull();
		expect(await store.load('u_b')).not.toBeNull();
	});

	it('cerrar sesión también borra la clave', async () => {
		const store = newStore();
		const vault = new VaultState(store);
		await vault.unlock('u_a', await newKey(), true);
		expect(await store.load('u_a')).not.toBeNull();
		await vault.signOut();
		expect(await store.load('u_a')).toBeNull();
		expect(vault.status).toBe('locked');
	});
});
