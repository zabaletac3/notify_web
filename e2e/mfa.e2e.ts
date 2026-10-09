import { expect, test } from '@playwright/test';
import { activateMfa, loginWithPassword, logout } from './mfa-helpers.js';

/**
 * Flujo completo de la verificación en dos pasos sobre el backend simulado: activar, cerrar sesión
 * y volver a entrar con el código TOTP y con un código de respaldo.
 */
test.describe('Verificación en dos pasos', () => {
	test('activar, cerrar sesión y volver a entrar con el código TOTP', async ({ page }) => {
		await activateMfa(page);
		await logout(page);

		await loginWithPassword(page);
		// Al completar los 6 dígitos el componente verifica solo.
		await page.getByLabel('Código de verificación en dos pasos').first().fill('123456');
		await page.waitForURL('**/notes');
	});

	test('entrar con un código de respaldo', async ({ page }) => {
		const codes = await activateMfa(page);
		await logout(page);

		await loginWithPassword(page);
		await page.getByRole('button', { name: 'Usar un código de respaldo' }).click();
		await page.getByLabel('Código de respaldo').fill(codes[0]);
		await page.getByRole('button', { name: 'Verificar' }).click();
		await page.waitForURL('**/notes');
	});

	test('un código incorrecto no deja entrar', async ({ page }) => {
		await activateMfa(page);
		await logout(page);

		await loginWithPassword(page);
		await page.getByLabel('Código de verificación en dos pasos').first().fill('000000');
		await page.getByRole('button', { name: 'Verificar' }).click();
		await expect(page.getByText('El código debe tener 6 dígitos.')).toBeVisible();
		await expect(page).toHaveURL(/\/two-factor/);
	});
});
