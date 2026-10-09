import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromUtf8, open, seal, utf8 } from '#lib/core/crypto/index.js';
import {
	DEMO_RECOVERY_KEY,
	DEMO_USER_EMAIL,
	DEMO_USER_PASSWORD,
	RESET_TOKEN
} from '#lib/data/index.js';
import { MAX_UNLOCK_ATTEMPTS, RESEND_COOLDOWN_SECONDS } from '#lib/features/auth/index.js';
import { createClock, testApp } from '#lib/test/test-app.js';

const reg = {
	fullName: 'Luis Gómez',
	email: 'luis@correo.com',
	password: 'Secret123!',
	acceptedTerms: true
};

describe('AuthState · arranque', () => {
	it('detecta la sesión existente', async () => {
		const { auth } = await testApp();
		expect(auth.status).toBe('authenticated');
		expect(auth.user?.email).toBe(DEMO_USER_EMAIL);
	});

	it('sin sesión queda como anónimo', async () => {
		const { auth } = await testApp({ startAuthenticated: false });
		expect(auth.status).toBe('anonymous');
	});

	it('una sesión vencida queda como "expired"', async () => {
		const app = await testApp({ load: false });
		app.scenario.sessionExpired = true;
		await app.auth.bootstrap();
		expect(app.auth.status).toBe('expired');
	});
});

describe('AuthState · registro y verificación', () => {
	it('no llama al servidor si los datos son inválidos y deja los errores por campo', async () => {
		const { auth, backend } = await testApp({ startAuthenticated: false });
		const r = await auth.register({
			fullName: '',
			email: 'x',
			password: '1',
			acceptedTerms: false
		});
		expect(r.ok).toBe(false);
		expect(auth.fieldErrors).toEqual({
			fullName: 'name-too-short',
			email: 'invalid-email',
			password: 'password-too-short',
			acceptedTerms: 'terms-required'
		});
		expect(backend.db.users).toHaveLength(1); // solo el demo
		expect(auth.busy).toBe(false);
	});

	it('registro → código → sesión iniciada', async () => {
		const { auth } = await testApp({ startAuthenticated: false });
		expect((await auth.register(reg)).ok).toBe(true);
		expect(auth.pendingEmail).toBe('luis@correo.com');
		expect(auth.status).toBe('anonymous');

		expect((await auth.verify('000000')).ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ code: 'invalid-code' });
		expect((await auth.verify('abc')).ok).toBe(false); // se valida antes de llamar
		expect((await auth.verify('123456')).ok).toBe(true);
		expect(auth.status).toBe('authenticated');
		expect(auth.user?.emailVerified).toBe(true);
		expect(auth.pendingEmail).toBeNull();
	});

	it('el correo repetido se reporta en el campo email', async () => {
		const { auth } = await testApp({ startAuthenticated: false });
		await auth.register({ ...reg, email: DEMO_USER_EMAIL });
		expect(auth.fieldErrors).toEqual({ email: 'email-taken' });
	});

	it('reenviar el código exige esperar el enfriamiento', async () => {
		const clock = createClock();
		const { auth } = await testApp({ startAuthenticated: false, now: clock.now });
		await auth.register(reg);
		expect(auth.resendRemaining()).toBe(RESEND_COOLDOWN_SECONDS);
		expect((await auth.resendCode()).ok).toBe(false);
		clock.advance(30_000);
		expect(auth.resendRemaining()).toBe(30);
		clock.advance(30_000);
		expect(auth.resendRemaining()).toBe(0);
		expect((await auth.resendCode()).ok).toBe(true);
		expect(auth.resendRemaining()).toBe(RESEND_COOLDOWN_SECONDS);
	});
});

describe('AuthState · inicio de sesión', () => {
	it('inicia y cierra sesión', async () => {
		const { auth } = await testApp({ startAuthenticated: false });
		const r = await auth.login({ email: DEMO_USER_EMAIL, password: DEMO_USER_PASSWORD });
		expect(r.ok).toBe(true);
		expect(auth.isAuthenticated).toBe(true);
		await auth.logout();
		expect(auth.status).toBe('anonymous');
		expect(auth.user).toBeNull();
	});

	it('elimina la cuenta con la contraseña y deja la sesión cerrada', async () => {
		const { auth } = await testApp();
		expect(auth.isAuthenticated).toBe(true);
		const r = await auth.deleteAccount(DEMO_USER_PASSWORD);
		expect(r.ok).toBe(true);
		expect(auth.status).toBe('anonymous');
		expect(auth.user).toBeNull();
	});

	it('con la contraseña incorrecta no elimina ni cierra la sesión', async () => {
		const { auth } = await testApp();
		const r = await auth.deleteAccount('mala');
		expect(r.ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ password: 'wrong-password' });
		expect(auth.isAuthenticated).toBe(true);
		expect(auth.user?.email).toBe(DEMO_USER_EMAIL);
	});

	it('con la contraseña vacía pide la contraseña y sigue autenticado', async () => {
		const { auth } = await testApp();
		const r = await auth.deleteAccount('');
		expect(r.ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ password: 'required' });
		expect(auth.isAuthenticated).toBe(true);
	});

	it('credenciales incorrectas: error general, sin errores por campo', async () => {
		const { auth } = await testApp({ startAuthenticated: false });
		const r = await auth.login({ email: DEMO_USER_EMAIL, password: 'mal' });
		expect(r.ok).toBe(false);
		expect(auth.error).toEqual({ kind: 'unauthorized', code: 'invalid-credentials' });
		expect(auth.fieldErrors).toEqual({});
	});

	it('con el correo sin verificar deja el correo pendiente para ir a verificar', async () => {
		const { auth } = await testApp({ startAuthenticated: false });
		await auth.register(reg);
		auth.pendingEmail = null; // el usuario cerró la app antes de verificar
		const r = await auth.login({ email: ' Luis@Correo.com ', password: reg.password });
		expect(r.ok).toBe(false);
		expect(auth.error).toEqual({ kind: 'forbidden', code: 'email-not-verified' });
		expect(auth.pendingEmail).toBe('luis@correo.com');
	});

	it('sin red devuelve el error de red', async () => {
		const app = await testApp({ startAuthenticated: false });
		app.scenario.offline = true;
		await app.auth.login({ email: DEMO_USER_EMAIL, password: DEMO_USER_PASSWORD });
		expect(app.auth.error?.kind).toBe('network');
	});
});

describe('AuthState · recuperar contraseña', () => {
	it('pide el enlace aunque el correo no exista', async () => {
		const { auth } = await testApp({ startAuthenticated: false });
		expect((await auth.forgotPassword('no@existe.com')).ok).toBe(true);
		expect(auth.resetRequested).toBe(true);
	});

	it('valida el correo antes de pedir el enlace', async () => {
		const { auth } = await testApp({ startAuthenticated: false });
		expect((await auth.forgotPassword('nope')).ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ email: 'invalid-email' });
		expect(auth.resetRequested).toBe(false);
	});

	const keep = { mode: 'keep' as const, recoveryKey: DEMO_RECOVERY_KEY };

	it('cambia la contraseña con el token y la clave de recuperación', async () => {
		const { auth } = await testApp({ startAuthenticated: false });
		await auth.forgotPassword(DEMO_USER_EMAIL);
		expect((await auth.resetPassword(RESET_TOKEN, 'Nueva123!', 'distinta', keep)).ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ confirmation: 'passwords-dont-match' });
		expect((await auth.resetPassword('token-malo', 'Nueva123!', 'Nueva123!', keep)).ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ token: 'invalid-token' });
		expect((await auth.resetPassword(RESET_TOKEN, 'Nueva123!', 'Nueva123!', keep)).ok).toBe(true);
		expect((await auth.login({ email: DEMO_USER_EMAIL, password: 'Nueva123!' })).ok).toBe(true);
	});

	it('sin la clave de recuperación correcta no se restablece', async () => {
		const { auth } = await testApp({ startAuthenticated: false });
		await auth.forgotPassword(DEMO_USER_EMAIL);
		const empty = { mode: 'keep' as const, recoveryKey: ' ' };
		expect((await auth.resetPassword(RESET_TOKEN, 'Nueva123!', 'Nueva123!', empty)).ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ recoveryKey: 'required' });
		const bad = { mode: 'keep' as const, recoveryKey: 'ABCD-EFGH' };
		expect((await auth.resetPassword(RESET_TOKEN, 'Nueva123!', 'Nueva123!', bad)).ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ recoveryKey: 'invalid-recovery-key' });
		// La contraseña de ejemplo sigue siendo la válida.
		expect((await auth.login({ email: DEMO_USER_EMAIL, password: DEMO_USER_PASSWORD })).ok).toBe(
			true
		);
	});

	it('empezar de cero exige confirmar el borrado y deja una clave de recuperación nueva', async () => {
		const { auth, backend } = await testApp({ startAuthenticated: false });
		await auth.forgotPassword(DEMO_USER_EMAIL);
		const unconfirmed = { mode: 'wipe' as const, confirmed: false };
		expect((await auth.resetPassword(RESET_TOKEN, 'Nueva123!', 'Nueva123!', unconfirmed)).ok).toBe(
			false
		);
		expect(auth.fieldErrors).toEqual({ wipe: 'wipe-not-confirmed' });
		expect(backend.db.notes.length).toBeGreaterThan(0);

		const wipe = { mode: 'wipe' as const, confirmed: true };
		expect((await auth.resetPassword(RESET_TOKEN, 'Nueva123!', 'Nueva123!', wipe)).ok).toBe(true);
		expect(backend.db.notes).toHaveLength(0);
		// La clave nueva se enseña al iniciar sesión.
		expect(auth.pendingRecoveryKey).toBeNull();
		expect((await auth.login({ email: DEMO_USER_EMAIL, password: 'Nueva123!' })).ok).toBe(true);
		expect(auth.pendingRecoveryKey).toMatch(/^([0-9A-Z*~$=]{4}-){13}[0-9A-Z*~$=]$/);
		expect(auth.pendingRecoveryKey).not.toBe(DEMO_RECOVERY_KEY);
	});
});

describe('AuthState · inicio de sesión en dos pasos', () => {
	async function challenge(now?: () => Date) {
		const app = await testApp({ startAuthenticated: false, now });
		app.scenario.mfaEnabled = true;
		const result = await app.auth.login({ email: DEMO_USER_EMAIL, password: DEMO_USER_PASSWORD });
		return { app, result };
	}

	it('el primer paso no abre sesión ni desbloquea', async () => {
		const { app, result } = await challenge();
		expect(result.ok).toBe(true);
		expect(app.auth.mfaPending).toBe(true);
		expect(app.auth.status).toBe('anonymous');
		expect(app.auth.user).toBeNull();
		expect(app.vault.status).toBe('locked');
	});

	it('código erróneo no cierra el reto; el correcto desbloquea', async () => {
		const { app } = await challenge();
		expect((await app.auth.verifyMfa('000000')).ok).toBe(false);
		expect(app.auth.fieldErrors).toEqual({ code: 'invalid-code' });
		expect(app.auth.mfaPending).toBe(true);

		expect((await app.auth.verifyMfa('123456')).ok).toBe(true);
		expect(app.auth.mfaPending).toBe(false);
		expect(app.auth.status).toBe('authenticated');
		expect(app.vault.status).toBe('unlocked');
		// Un segundo intento ya no tiene reto pendiente.
		expect((await app.auth.verifyMfa('123456')).ok).toBe(false);
	});

	it('un código de respaldo sirve una vez y baja el contador', async () => {
		const { app } = await challenge();
		expect((await app.auth.verifyMfa('ABCDE-FGHJK')).ok).toBe(true);
		expect(app.auth.status).toBe('authenticated');
		await app.mfa.load();
		expect(app.mfa.recoveryCodesLeft).toBe(9);
	});

	it('si el ticket vence, se vuelve a pedir el login', async () => {
		const clock = createClock();
		const { app } = await challenge(clock.now);
		clock.advance(6 * 60 * 1000);
		const result = await app.auth.verifyMfa('123456');
		expect(result.ok).toBe(false);
		expect(app.auth.mfaPending).toBe(false);
		expect(app.auth.notice).toBe('mfa-expired');
		expect(app.auth.status).toBe('anonymous');
	});

	it('cerrar sesión olvida el reto pendiente y la kek', async () => {
		const { app } = await challenge();
		await app.auth.logout();
		expect(app.auth.mfaPending).toBe(false);
		expect((await app.auth.verifyMfa('123456')).ok).toBe(false);
		expect(app.auth.status).toBe('anonymous');
	});
});

describe('AuthState · mi cuenta', () => {
	it('cambia el nombre y lo refleja al instante', async () => {
		const { auth } = await testApp();
		const r = await auth.updateProfile('  Ana María  ');
		expect(r.ok).toBe(true);
		expect(auth.user?.fullName).toBe('Ana María');
	});

	it('rechaza un nombre vacío sin llamar al servidor', async () => {
		const { auth, backend } = await testApp();
		const before = backend.db.users[0].user.fullName;
		const r = await auth.updateProfile(' ');
		expect(r.ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ fullName: 'name-too-short' });
		expect(backend.db.users[0].user.fullName).toBe(before);
	});

	it('cambia el correo en dos pasos: contraseña y código', async () => {
		const { auth } = await testApp();
		const bad = await auth.requestEmailChange('nuevo@correo.com', 'mala');
		expect(bad.ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ password: 'wrong-password' });

		expect((await auth.requestEmailChange('nuevo@correo.com', DEMO_USER_PASSWORD)).ok).toBe(true);
		expect(auth.pendingEmailChange).toBe('nuevo@correo.com');
		expect(auth.user?.email).toBe(DEMO_USER_EMAIL); // aún no cambia

		expect((await auth.confirmEmailChange('000000')).ok).toBe(false);
		expect((await auth.confirmEmailChange('123456')).ok).toBe(true);
		expect(auth.user?.email).toBe('nuevo@correo.com');
		expect(auth.pendingEmailChange).toBeNull();
	});

	it('no permite cambiar a un correo que ya existe', async () => {
		const { auth, backend } = await testApp();
		backend.db.users.push({
			authKeyHash: 'x',
			recoveryAuthHash: 'x',
			keys: backend.db.users[0].keys,
			user: {
				id: 'u_9',
				email: 'otra@correo.com',
				fullName: 'Otra',
				emailVerified: true,
				hasGoogle: false,
				createdAt: ''
			}
		});
		const r = await auth.requestEmailChange('otra@correo.com', DEMO_USER_PASSWORD);
		expect(r.ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ email: 'email-taken' });
	});

	it('cambia la contraseña: valida y exige la actual', async () => {
		const { auth } = await testApp();
		const weak = await auth.changePassword(DEMO_USER_PASSWORD, 'corta', 'corta');
		expect(weak.ok).toBe(false);
		expect(auth.fieldErrors.password).toBe('password-too-short');

		const same = await auth.changePassword(
			DEMO_USER_PASSWORD,
			DEMO_USER_PASSWORD,
			DEMO_USER_PASSWORD
		);
		expect(same.ok).toBe(false);
		expect(auth.fieldErrors.password).toBe('same-password');

		const wrong = await auth.changePassword('mala', 'Nueva123!x', 'Nueva123!x');
		expect(wrong.ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ currentPassword: 'wrong-password' });

		expect((await auth.changePassword(DEMO_USER_PASSWORD, 'Nueva123!x', 'Nueva123!x')).ok).toBe(
			true
		);
		await auth.logout();
		expect((await auth.login({ email: DEMO_USER_EMAIL, password: 'Nueva123!x' })).ok).toBe(true);
	});
});

describe('AuthState · cofre de claves', () => {
	it('la sesión de ejemplo arranca desbloqueada', async () => {
		const { auth, vault } = await testApp();
		expect(vault.status).toBe('unlocked');
		expect(auth.isLocked).toBe(false);
	});

	it('registrarse y verificar el correo desbloquea la app y deja la clave de recuperación para mostrar', async () => {
		const { auth, vault } = await testApp({ startAuthenticated: false });
		await auth.register(reg);
		expect(vault.status).toBe('locked');
		expect(auth.pendingRecoveryKey).toBeNull();
		await auth.verify('123456');
		expect(vault.status).toBe('unlocked');
		expect(auth.pendingRecoveryKey).toMatch(/^([0-9A-Z*~$=]{4}-){13}[0-9A-Z*~$=]$/);
		auth.acknowledgeRecoveryKey();
		expect(auth.pendingRecoveryKey).toBeNull();
	});

	it('iniciar sesión desbloquea con la contraseña; con una errónea no', async () => {
		const { auth, vault } = await testApp({ startAuthenticated: false });
		expect((await auth.login({ email: DEMO_USER_EMAIL, password: 'mal' })).ok).toBe(false);
		expect(vault.status).toBe('locked');
		expect((await auth.login({ email: DEMO_USER_EMAIL, password: DEMO_USER_PASSWORD })).ok).toBe(
			true
		);
		expect(vault.status).toBe('unlocked');
	});

	it('bloqueada, pide la contraseña: una errónea se cuenta y la correcta desbloquea', async () => {
		const { auth, vault } = await testApp();
		vault.lock();
		expect(auth.isLocked).toBe(true);
		expect((await auth.unlock('')).ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ password: 'required' });
		expect((await auth.unlock('mal')).ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ password: 'wrong-password' });
		expect(auth.unlockFailures).toBe(1);
		expect(vault.status).toBe('locked');
		expect((await auth.unlock(DEMO_USER_PASSWORD)).ok).toBe(true);
		expect(vault.status).toBe('unlocked');
		expect(auth.isLocked).toBe(false);
		expect(auth.unlockFailures).toBe(0);
	});

	it('tras 5 intentos fallidos cierra la sesión', async () => {
		const { auth, vault } = await testApp();
		vault.lock();
		for (let i = 0; i < MAX_UNLOCK_ATTEMPTS; i++) await auth.unlock('mal');
		expect(auth.status).toBe('anonymous');
		expect(auth.user).toBeNull();
	});

	it('cerrar sesión olvida la clave maestra', async () => {
		const { auth, vault } = await testApp();
		await auth.logout();
		expect(vault.status).toBe('locked');
		expect(() => vault.current).toThrow();
	});

	it('cambiar la contraseña no cambia la clave maestra: lo cifrado antes sigue abriéndose', async () => {
		const { auth, vault } = await testApp();
		const before = await seal(vault.current.requireKey(), utf8('nota'), 'ctx');
		expect((await auth.changePassword(DEMO_USER_PASSWORD, 'Nueva123!x', 'Nueva123!x')).ok).toBe(
			true
		);
		await auth.logout();
		expect((await auth.login({ email: DEMO_USER_EMAIL, password: DEMO_USER_PASSWORD })).ok).toBe(
			false
		);
		expect((await auth.login({ email: DEMO_USER_EMAIL, password: 'Nueva123!x' })).ok).toBe(true);
		expect(fromUtf8(await open(vault.current.requireKey(), before, 'ctx'))).toBe('nota');
	});

	it('restablecer con la clave de recuperación conserva la clave maestra', async () => {
		const { auth, vault } = await testApp();
		const before = await seal(vault.current.requireKey(), utf8('nota'), 'ctx');
		await auth.logout();
		await auth.forgotPassword(DEMO_USER_EMAIL);
		const keep = { mode: 'keep' as const, recoveryKey: DEMO_RECOVERY_KEY };
		expect((await auth.resetPassword(RESET_TOKEN, 'Nueva123!', 'Nueva123!', keep)).ok).toBe(true);
		await auth.login({ email: DEMO_USER_EMAIL, password: 'Nueva123!' });
		expect(fromUtf8(await open(vault.current.requireKey(), before, 'ctx'))).toBe('nota');
	});

	it('crear una clave de recuperación nueva exige la contraseña y deja la clave para mostrar', async () => {
		const { auth } = await testApp();
		expect((await auth.rotateRecoveryKey('mal')).ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ password: 'wrong-password' });
		expect(auth.pendingRecoveryKey).toBeNull();
		expect((await auth.rotateRecoveryKey(DEMO_USER_PASSWORD)).ok).toBe(true);
		expect(auth.pendingRecoveryKey).not.toBe(DEMO_RECOVERY_KEY);
		expect(auth.pendingRecoveryKey).toMatch(/^([0-9A-Z*~$=]{4}-){13}[0-9A-Z*~$=]$/);
	});
});

describe('AuthState · acceso con Google', () => {
	/** Stubs de las APIs de navegador que usa el flujo (en el entorno de node no existen). */
	function browserApis() {
		const store = new Map<string, string>();
		vi.stubGlobal('sessionStorage', {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => void store.set(k, v),
			removeItem: (k: string) => void store.delete(k)
		});
		const replaceState = vi.fn();
		const assign = vi.fn();
		vi.stubGlobal('location', {
			origin: 'https://app.test',
			pathname: '/auth/google',
			search: '',
			assign
		});
		vi.stubGlobal('history', { state: null, replaceState });
		return { store, replaceState, assign };
	}

	afterEach(() => vi.unstubAllGlobals());

	async function withScenario(scenario: 'new' | 'unlinked' | 'linked' | 'with-mfa') {
		const app = await testApp({ startAuthenticated: false });
		app.scenario.googleScenario = scenario;
		const apis = browserApis();
		apis.store.set('axonote-google-verifier', 'verifier-de-prueba');
		const result = await app.auth.completeGoogle('#code=codigo');
		return { app, apis, result };
	}

	it('empieza el flujo guardando el verifier y redirigiendo', async () => {
		const app = await testApp({ startAuthenticated: false });
		app.scenario.googleScenario = 'linked';
		const { store, assign } = browserApis();
		const result = await app.auth.startGoogle();
		expect(result.ok).toBe(true);
		expect(store.get('axonote-google-verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(assign).toHaveBeenCalledWith(expect.stringContaining('/auth/google#code='));
	});

	it('con Google apagado el inicio falla con google-disabled', async () => {
		const app = await testApp({ startAuthenticated: false });
		browserApis();
		const result = await app.auth.startGoogle();
		expect(result.ok).toBe(false);
		expect(app.auth.googleError).toEqual({ kind: 'forbidden', code: 'google-disabled' });
	});

	it('cuenta nueva: pide crear la contraseña', async () => {
		const { app, result } = await withScenario('new');
		expect(result.ok).toBe(true);
		expect(app.auth.googleSignup).toMatchObject({ email: 'nueva.persona@gmail.com' });
		expect(app.auth.status).toBe('anonymous');
	});

	it('cuenta existente sin vincular: pide la contraseña para vincular', async () => {
		const { app } = await withScenario('unlinked');
		expect(app.auth.googleLink?.email).toBe(DEMO_USER_EMAIL);
		expect(app.auth.googleLink?.linkToken).toBeTruthy();
	});

	it('cuenta vinculada: abre sesión pero deja la app bloqueada', async () => {
		const { app } = await withScenario('linked');
		expect(app.auth.status).toBe('authenticated');
		expect(app.auth.user?.hasGoogle).toBe(true);
		expect(app.auth.isLocked).toBe(true);
		expect(app.auth.signedInWithGoogle).toBe(true);
	});

	it('cuenta vinculada con dos pasos: Google + código, sin contraseña', async () => {
		const { app } = await withScenario('with-mfa');
		expect(app.auth.mfaPending).toBe(true);
		expect(app.auth.status).toBe('anonymous');
		expect((await app.auth.verifyMfa('123456')).ok).toBe(true);
		expect(app.auth.status).toBe('authenticated');
		expect(app.auth.isLocked).toBe(true);
		expect(app.auth.signedInWithGoogle).toBe(true);
	});

	it('borra el verifier y limpia el fragmento al volver', async () => {
		const { app, apis } = await withScenario('linked');
		expect(app.auth.googleProcessing).toBe(false);
		expect(apis.store.has('axonote-google-verifier')).toBe(false);
		expect(apis.replaceState).toHaveBeenCalled();
	});

	it('vincular con la contraseña errónea no vincula', async () => {
		const { app } = await withScenario('unlinked');
		const bad = await app.auth.linkGoogle('mala');
		expect(bad.ok).toBe(false);
		// Es, a efectos de seguridad, un login: el error es el mismo (no revela por campo).
		expect(app.auth.error).toEqual({ kind: 'unauthorized', code: 'invalid-credentials' });
		expect(app.auth.status).toBe('anonymous');

		expect((await app.auth.linkGoogle(DEMO_USER_PASSWORD)).ok).toBe(true);
		expect(app.auth.status).toBe('authenticated');
		expect(app.auth.isLocked).toBe(false);
		expect(app.auth.user?.hasGoogle).toBe(true);
	});

	it('registro con Google: crea las claves y deja la clave de recuperación para mostrar', async () => {
		const { app } = await withScenario('new');
		const result = await app.auth.registerWithGoogle({
			fullName: 'Nueva Persona',
			password: 'Secret123!',
			acceptedTerms: true
		});
		expect(result.ok).toBe(true);
		expect(app.auth.status).toBe('authenticated');
		expect(app.auth.isLocked).toBe(false);
		expect(app.auth.user?.hasGoogle).toBe(true);
		expect(app.auth.pendingRecoveryKey).toMatch(/^([0-9A-Z*~$=]{4}-){13}[0-9A-Z*~$=]$/);
	});

	it('desvincular exige la contraseña y actualiza la cuenta', async () => {
		const { auth } = await testApp();
		expect((await auth.unlinkGoogle('mala')).ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ password: 'wrong-password' });
		expect((await auth.unlinkGoogle(DEMO_USER_PASSWORD)).ok).toBe(true);
		expect(auth.user?.hasGoogle).toBe(false);
	});
});
