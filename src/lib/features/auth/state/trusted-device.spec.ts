import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_USER_ID, DEMO_USER_PASSWORD } from '#lib/data/index.js';
import { testApp } from '#lib/test/test-app.js';

let n = 0;
const newApp = () => testApp({ startAuthenticated: false, dbName: `trusted-${++n}` });

/** Stubs mínimos de las APIs de navegador que usa el retorno de Google. */
function browserApis() {
	const store = new Map<string, string>();
	vi.stubGlobal('sessionStorage', {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k)
	});
	vi.stubGlobal('location', {
		origin: 'https://app.test',
		pathname: '/auth/google',
		search: '',
		assign: vi.fn()
	});
	vi.stubGlobal('history', { state: null, replaceState: vi.fn() });
	store.set('axonote-google-verifier', 'verifier-de-prueba');
}

afterEach(() => vi.unstubAllGlobals());

type App = Awaited<ReturnType<typeof testApp>>;

/** Entra con Google (cuenta ya vinculada). Deja la app bloqueada salvo que la confianza la abra. */
async function googleLogin(app: App): Promise<void> {
	app.scenario.googleScenario = 'linked';
	browserApis();
	const result = await app.auth.completeGoogle('#code=codigo');
	expect(result.ok).toBe(true);
}

/** Desbloquea con contraseña tras entrar con Google: da de alta este dispositivo. */
async function withTrust(): Promise<App> {
	const app = await newApp();
	await googleLogin(app);
	expect(app.auth.isLocked).toBe(true);
	expect((await app.auth.unlock(DEMO_USER_PASSWORD)).ok).toBe(true);
	expect(await app.vault.trustOf(DEMO_USER_ID)).not.toBeNull();
	return app;
}

describe('dispositivos de confianza · alta', () => {
	it('desbloquear con contraseña tras entrar con Google da de alta el dispositivo', async () => {
		const app = await withTrust();
		expect(app.backend.db.trustedDevices).toHaveLength(1);
		const row = app.backend.db.trustedDevices[0];
		expect(row.userId).toBe(DEMO_USER_ID);
		expect(row.wrappedMasterKey).toMatch(/^a1\./);
	});

	it('una cuenta sin Google no da de alta nada', async () => {
		const app = await newApp();
		expect(
			(await app.auth.login({ email: 'ana@correo.com', password: DEMO_USER_PASSWORD })).ok
		).toBe(true);
		await app.vault.lock();
		expect((await app.auth.unlock(DEMO_USER_PASSWORD)).ok).toBe(true);
		expect(await app.vault.trustOf(DEMO_USER_ID)).toBeNull();
		expect(app.backend.db.trustedDevices).toHaveLength(0);
	});

	it('con «bloquear al salir» activo no se da de alta', async () => {
		const app = await newApp();
		await googleLogin(app);
		await app.settings.update({ lockOnExit: true });
		expect((await app.auth.unlock(DEMO_USER_PASSWORD)).ok).toBe(true);
		expect(await app.vault.trustOf(DEMO_USER_ID)).toBeNull();
		expect(app.backend.db.trustedDevices).toHaveLength(0);
	});
});

describe('dispositivos de confianza · uso', () => {
	it('un login con Google en un dispositivo de confianza entra sin contraseña', async () => {
		const app = await withTrust();
		await app.auth.logout();
		expect(await app.vault.trustOf(DEMO_USER_ID)).not.toBeNull();

		await googleLogin(app);
		expect(app.auth.status).toBe('authenticated');
		expect(app.auth.isLocked).toBe(false);
	});

	it('si el servidor ya no tiene la confianza (404) cae a bloqueado y limpia la fila local', async () => {
		const app = await withTrust();
		await app.auth.logout();
		// Otro dispositivo lo revocó: el servidor ya no guarda la clave envuelta.
		app.backend.db.trustedDevices = [];

		await googleLogin(app);
		expect(app.auth.isLocked).toBe(true);
		expect(await app.vault.trustOf(DEMO_USER_ID)).toBeNull();
	});

	it('con MFA activo, Google + código entra sin contraseña si hay confianza', async () => {
		const app = await withTrust();
		await app.auth.logout();
		app.scenario.googleScenario = 'with-mfa';
		browserApis();
		await app.auth.completeGoogle('#code=codigo');
		expect(app.auth.mfaPending).toBe(true);

		expect((await app.auth.verifyMfa('123456')).ok).toBe(true);
		expect(app.auth.status).toBe('authenticated');
		expect(app.auth.isLocked).toBe(false);
	});
});

describe('dispositivos de confianza · ciclo de vida', () => {
	it('bloquear la app borra la confianza local y revoca la del servidor', async () => {
		const app = await withTrust();
		const trustId = (await app.vault.trustOf(DEMO_USER_ID))!.trustId;
		await app.vault.lock();
		expect(await app.vault.trustOf(DEMO_USER_ID)).toBeNull();
		expect(app.backend.db.trustedDevices.find((d) => d.id === trustId)?.revokedAt).toBeTruthy();
	});

	it('cerrar sesión conserva la confianza y cerrar sesión olvidando la borra', async () => {
		const app = await withTrust();
		await app.auth.logout();
		expect(await app.vault.trustOf(DEMO_USER_ID)).not.toBeNull();

		await googleLogin(app);
		expect(app.auth.isLocked).toBe(false);
		await app.auth.logout({ forgetDevice: true });
		expect(await app.vault.trustOf(DEMO_USER_ID)).toBeNull();
		expect(app.backend.db.trustedDevices.every((d) => d.revokedAt)).toBe(true);
	});

	it('el estado lista y quita dispositivos de confianza', async () => {
		const app = await withTrust();
		await app.trustedDevices.load();
		expect(app.trustedDevices.list).toHaveLength(1);
		await app.trustedDevices.remove(app.trustedDevices.list[0].id);
		expect(app.trustedDevices.list).toHaveLength(0);
	});
});
