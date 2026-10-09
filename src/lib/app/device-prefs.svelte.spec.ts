import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { deviceActiveAtKey, devicePrefsKey } from '#lib/data/index.js';
import { DEFAULT_SETTINGS } from '#lib/domain/index.js';
import { testApp } from '#lib/test/test-app.js';

const settle = () => new Promise((r) => setTimeout(r, 30));
let seq = 0;
const dbName = () => `prefs-${Date.now()}-${++seq}`;

const account = (email: string) => ({
	fullName: 'Luis Gómez',
	email,
	password: 'Secret123!',
	acceptedTerms: true
});

/** Crea una cuenta nueva (no la de ejemplo) y la deja con la sesión iniciada. */
async function signedIn(email: string) {
	const app = await testApp({
		startAuthenticated: false,
		persistence: 'indexeddb',
		dbName: dbName()
	});
	await app.bootstrap();
	await app.auth.register(account(email));
	await app.auth.verify('123456');
	flushSync();
	await settle();
	return app;
}

/**
 * Punto 1: los ajustes viven en el dispositivo (localStorage, por cuenta), no en la base de la
 * cuenta. Cerrar sesión no los borra; eliminar la cuenta sí; cada cuenta tiene los suyos.
 * Necesita IndexedDB y localStorage reales (navegador).
 */
describe('preferencias del dispositivo', () => {
	it('los ajustes sobreviven al cerrar y volver a iniciar sesión', async () => {
		const app = await signedIn('a@correo.com');
		try {
			await app.settings.update({ lockTimeout: '15m', lockOnExit: false });
			await app.auth.logout();

			expect((await app.auth.login({ email: 'a@correo.com', password: 'Secret123!' })).ok).toBe(
				true
			);
			flushSync();
			await settle();
			expect(app.settings.values.lockTimeout).toBe('15m');
			expect(app.settings.values.lockOnExit).toBe(false);
		} finally {
			app.destroy();
		}
	});

	it('con "bloquear al salir" desactivado, iniciar sesión recuerda la clave', async () => {
		const app = await signedIn('b@correo.com');
		try {
			await app.settings.update({ lockOnExit: false });

			// Se anota con qué valor se desbloquea el cofre al iniciar sesión.
			const original = app.vault.unlock.bind(app.vault);
			let remembered: boolean | undefined;
			app.vault.unlock = async (userId, key, remember) => {
				remembered = remember;
				return original(userId, key, remember);
			};

			await app.auth.logout();
			expect((await app.auth.login({ email: 'b@correo.com', password: 'Secret123!' })).ok).toBe(
				true
			);
			// Sin cargar las preferencias antes, `rememberDevice` usaría el valor por defecto (false).
			expect(remembered).toBe(true);
		} finally {
			app.destroy();
		}
	});

	it('eliminar la cuenta borra las preferencias del dispositivo', async () => {
		const app = await signedIn('c@correo.com');
		try {
			await app.settings.update({ lockTimeout: '15m' });
			const userId = app.auth.user!.id;
			expect(localStorage.getItem(devicePrefsKey(userId))).not.toBeNull();

			expect((await app.auth.deleteAccount('Secret123!')).ok).toBe(true);
			expect(localStorage.getItem(devicePrefsKey(userId))).toBeNull();
		} finally {
			app.destroy();
		}
	});

	it('cerrar sesión borra la marca de actividad pero conserva las preferencias', async () => {
		const app = await signedIn('f@correo.com');
		try {
			await app.settings.update({ lockTimeout: '15m' });
			const userId = app.auth.user!.id;
			// El desbloqueo deja una marca de actividad.
			expect(localStorage.getItem(deviceActiveAtKey(userId))).not.toBeNull();

			await app.auth.logout();
			expect(localStorage.getItem(deviceActiveAtKey(userId))).toBeNull();
			expect(localStorage.getItem(devicePrefsKey(userId))).not.toBeNull();
		} finally {
			app.destroy();
		}
	});

	it('tras cerrar sesión los ajustes vuelven al defecto y no pisan las preferencias de la cuenta', async () => {
		const app = await signedIn('g@correo.com');
		try {
			await app.settings.update({ lockTimeout: '15m' });
			const userId = app.auth.user!.id;

			await app.auth.logout();
			// Sin sesión se olvida la cuenta y se vuelve a los valores por defecto.
			expect(app.settings.values.lockTimeout).toBe(DEFAULT_SETTINGS.lockTimeout);
			await app.settings.update({ lockTimeout: '5m' });

			// La preferencia guardada de la cuenta no cambia.
			const stored = JSON.parse(localStorage.getItem(devicePrefsKey(userId)) ?? '{}') as {
				lockTimeout?: string;
			};
			expect(stored.lockTimeout).toBe('15m');
		} finally {
			app.destroy();
		}
	});

	it('dos cuentas en el mismo navegador no comparten preferencias', async () => {
		const app = await signedIn('d@correo.com');
		try {
			await app.settings.update({ lockTimeout: '15m' });
			await app.auth.logout();

			await app.auth.register(account('e@correo.com'));
			await app.auth.verify('123456');
			flushSync();
			await settle();
			expect(app.settings.values.lockTimeout).toBe('1m');
			await app.settings.update({ lockTimeout: '5m' });
			await app.auth.logout();

			expect((await app.auth.login({ email: 'd@correo.com', password: 'Secret123!' })).ok).toBe(
				true
			);
			flushSync();
			await settle();
			expect(app.settings.values.lockTimeout).toBe('15m');
		} finally {
			app.destroy();
		}
	});
});
