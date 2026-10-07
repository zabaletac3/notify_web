import { describe, expect, it } from 'vitest';
import { DEMO_USER_EMAIL, DEMO_USER_PASSWORD, RESET_TOKEN } from '#lib/data/index.js';
import { RESEND_COOLDOWN_SECONDS } from '#lib/features/auth/index.js';
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

	it('elimina la cuenta y deja la sesión cerrada', async () => {
		const { auth } = await testApp();
		expect(auth.isAuthenticated).toBe(true);
		const r = await auth.deleteAccount();
		expect(r.ok).toBe(true);
		expect(auth.status).toBe('anonymous');
		expect(auth.user).toBeNull();
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

	it('cambia la contraseña con el token y valida la confirmación', async () => {
		const { auth } = await testApp({ startAuthenticated: false });
		await auth.forgotPassword(DEMO_USER_EMAIL);
		expect((await auth.resetPassword(RESET_TOKEN, 'Nueva123!', 'distinta')).ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ confirmation: 'passwords-dont-match' });
		expect((await auth.resetPassword('token-malo', 'Nueva123!', 'Nueva123!')).ok).toBe(false);
		expect(auth.fieldErrors).toEqual({ token: 'invalid-token' });
		expect((await auth.resetPassword(RESET_TOKEN, 'Nueva123!', 'Nueva123!')).ok).toBe(true);
		expect((await auth.login({ email: DEMO_USER_EMAIL, password: 'Nueva123!' })).ok).toBe(true);
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
			password: 'x',
			user: {
				id: 'u_9',
				email: 'otra@correo.com',
				fullName: 'Otra',
				emailVerified: true,
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
