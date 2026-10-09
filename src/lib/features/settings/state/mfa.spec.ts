import { describe, expect, it } from 'vitest';
import {
	DEMO_RECOVERY_KEY,
	DEMO_USER_EMAIL,
	DEMO_USER_PASSWORD,
	RESET_TOKEN
} from '#lib/data/index.js';
import { testApp } from '#lib/test/test-app.js';

describe('MfaState · activar y desactivar', () => {
	it('activa con contraseña y código, y muestra los 10 códigos una sola vez', async () => {
		const app = await testApp();
		expect(app.mfa.enabled).toBe(false);
		await app.mfa.load();
		expect(app.mfa.enabled).toBe(false);

		expect((await app.mfa.setup(DEMO_USER_PASSWORD)).ok).toBe(true);
		expect(app.mfa.pendingSetup?.secret).toMatch(/^[A-Z2-7]+$/);
		expect(app.mfa.pendingSetup?.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
		expect(app.mfa.enabled).toBe(false);

		expect((await app.mfa.enable('000000')).ok).toBe(false);
		expect(app.mfa.fieldErrors).toEqual({ code: 'invalid-code' });

		expect((await app.mfa.enable('123456')).ok).toBe(true);
		expect(app.mfa.enabled).toBe(true);
		expect(app.mfa.recoveryCodes).toHaveLength(10);
		expect(app.mfa.recoveryCodesLeft).toBe(10);
		expect(app.mfa.pendingSetup).toBeNull();

		app.mfa.acknowledgeCodes();
		expect(app.mfa.recoveryCodes).toHaveLength(0);
	});

	it('exige la contraseña para empezar y la reporta en el campo', async () => {
		const app = await testApp();
		expect((await app.mfa.setup('mala')).ok).toBe(false);
		expect(app.mfa.fieldErrors).toEqual({ password: 'wrong-password' });
		expect(app.mfa.pendingSetup).toBeNull();
	});

	it('desactiva con contraseña y código', async () => {
		const app = await testApp();
		await app.mfa.setup(DEMO_USER_PASSWORD);
		await app.mfa.enable('123456');

		expect((await app.mfa.disable('mala', '123456')).ok).toBe(false);
		expect(app.mfa.fieldErrors).toEqual({ password: 'wrong-password' });
		expect(app.mfa.enabled).toBe(true);

		expect((await app.mfa.disable(DEMO_USER_PASSWORD, '000000')).ok).toBe(false);
		expect(app.mfa.fieldErrors).toEqual({ code: 'invalid-code' });

		expect((await app.mfa.disable(DEMO_USER_PASSWORD, '123456')).ok).toBe(true);
		expect(app.mfa.enabled).toBe(false);
		expect(app.mfa.recoveryCodesLeft).toBe(0);
	});

	it('regenera los códigos y los anteriores dejan de servir', async () => {
		const app = await testApp();
		await app.mfa.setup(DEMO_USER_PASSWORD);
		await app.mfa.enable('123456');
		const before = [...app.backend.db.users[0].mfa!.recoveryCodes];

		expect((await app.mfa.regenerate(DEMO_USER_PASSWORD, '123456')).ok).toBe(true);
		expect(app.mfa.recoveryCodes).toHaveLength(10);
		expect(app.mfa.recoveryCodes).not.toEqual(before);
	});
});

describe('MfaState · arranque', () => {
	it('la cuenta de ejemplo con el escenario activo aparece como activada', async () => {
		const app = await testApp();
		app.scenario.mfaEnabled = true;
		await app.mfa.load();
		expect(app.mfa.enabled).toBe(true);
		expect(app.mfa.recoveryCodesLeft).toBe(10);
	});
});

describe('AuthState · restablecer contraseña con MFA', () => {
	async function withMfa() {
		const app = await testApp({ startAuthenticated: false });
		// Activa el MFA en la cuenta y vuelve a entrar para tener sesión.
		app.scenario.mfaEnabled = true;
		await app.auth.login({ email: DEMO_USER_EMAIL, password: DEMO_USER_PASSWORD });
		await app.auth.verifyMfa('123456');
		return app;
	}

	it('modo wipe sin código no borra nada; con código procede', async () => {
		const app = await withMfa();
		await app.auth.logout();
		await app.auth.forgotPassword(DEMO_USER_EMAIL);
		const notes = app.backend.db.notes.length;
		expect(notes).toBeGreaterThan(0);

		const missing = await app.auth.resetPassword(RESET_TOKEN, 'Nueva123!', 'Nueva123!', {
			mode: 'wipe',
			confirmed: true
		});
		expect(missing.ok).toBe(false);
		expect(app.auth.fieldErrors).toEqual({ mfaCode: 'required' });
		expect(app.backend.db.notes.length).toBe(notes);

		const wrong = await app.auth.resetPassword(RESET_TOKEN, 'Nueva123!', 'Nueva123!', {
			mode: 'wipe',
			confirmed: true,
			mfaCode: '000000'
		});
		expect(wrong.ok).toBe(false);
		expect(app.auth.fieldErrors).toEqual({ mfaCode: 'invalid-code' });
		expect(app.backend.db.notes.length).toBe(notes);

		const ok = await app.auth.resetPassword(RESET_TOKEN, 'Nueva123!', 'Nueva123!', {
			mode: 'wipe',
			confirmed: true,
			mfaCode: '123456'
		});
		expect(ok.ok).toBe(true);
		expect(app.backend.db.notes).toHaveLength(0);
	});

	it('modo keep no exige código y puede desactivar el MFA', async () => {
		const app = await withMfa();
		await app.auth.logout();
		await app.auth.forgotPassword(DEMO_USER_EMAIL);
		expect(app.backend.db.users[0].mfa?.enabledAt).toBeTruthy();

		const ok = await app.auth.resetPassword(RESET_TOKEN, 'Nueva123!', 'Nueva123!', {
			mode: 'keep',
			recoveryKey: DEMO_RECOVERY_KEY,
			disableMfa: true
		});
		expect(ok.ok).toBe(true);
		expect(app.backend.db.users[0].mfa).toBeNull();
	});
});
