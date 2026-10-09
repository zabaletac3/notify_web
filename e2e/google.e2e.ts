import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, setGoogleScenario, startGoogle } from './google-helpers.js';

/**
 * Acceso con Google sobre el backend simulado. La identidad que devuelve Google se elige con
 * `setGoogleScenario` (equivale al panel de `/dev/simulator`).
 *
 * Nota: en el simulador la cuenta de ejemplo arranca con su clave maestra, así que un login con
 * Google sobre ella no se queda bloqueado; el paso «Google + contraseña» de un dispositivo nuevo se
 * cubre con el flujo de vinculación (y, con la API real, en `e2e-http/`).
 */
test.describe('Acceso con Google', () => {
	test('registro con Google de principio a fin', async ({ page }) => {
		await setGoogleScenario(page, 'new');
		await page.goto('/register');
		await startGoogle(page, 'Registrarse con Google');

		await expect(
			page.getByRole('heading', { name: 'Crea tu contraseña de AxoNote' })
		).toBeVisible();
		await page.getByLabel('Nombre').fill('Nueva Persona');
		await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
		await page.getByLabel('Confirmar contraseña').fill(DEMO_PASSWORD);
		await page.getByLabel(/Acepto los/).check();
		await page.getByRole('button', { name: 'Crear cuenta' }).click();

		// La cuenta nueva muestra su clave de recuperación, igual que el registro por correo.
		await page.waitForURL('**/recovery-key**');
		await expect(page.getByRole('heading', { name: /clave de recuperación/i })).toBeVisible();
	});

	test('vincular una cuenta existente con la contraseña', async ({ page }) => {
		await setGoogleScenario(page, 'unlinked');
		await page.goto('/login');
		await startGoogle(page);

		await expect(page.getByRole('heading', { name: 'Vincula tu cuenta' })).toBeVisible();
		await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
		await page.getByRole('button', { name: 'Vincular con Google' }).click();
		await page.waitForURL('**/notes');
	});

	test('entrar con una cuenta ya vinculada', async ({ page }) => {
		await setGoogleScenario(page, 'linked');
		await page.goto('/login');
		await startGoogle(page);
		await page.waitForURL('**/notes');
	});

	test('con verificación en dos pasos: Google y luego el código', async ({ page }) => {
		await setGoogleScenario(page, 'with-mfa');
		await page.goto('/login');
		await startGoogle(page);

		await page.waitForURL('**/two-factor');
		await page.getByLabel('Código de verificación en dos pasos').first().fill('123456');
		await page.waitForURL('**/notes');
	});
});
