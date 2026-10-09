import { expect, type Page } from '@playwright/test';

/** Credenciales del usuario de ejemplo del simulador (ver `mock-database.ts`). */
export const DEMO_EMAIL = 'ana@correo.com';
export const DEMO_PASSWORD = 'Secret123!';

/** Activa la verificación en dos pasos desde Ajustes y devuelve los 10 códigos de respaldo. */
export async function activateMfa(page: Page): Promise<string[]> {
	await page.goto('/settings/two-factor');
	await page.getByRole('button', { name: 'Activar' }).click();
	await page.locator('#mfa-password').fill(DEMO_PASSWORD);
	await page.getByRole('button', { name: 'Continuar' }).click();

	// Escanea el QR (no interactúa) y confirma el código fijo del simulador.
	await page.getByLabel('Código de 6 dígitos').fill('123456');
	await page.getByRole('button', { name: 'Activar' }).click();

	const list = page.getByLabel('Códigos de respaldo');
	await expect(list).toBeVisible();
	const codes = (await list.locator('li').allInnerTexts()).map((t) => t.trim());
	await page.getByLabel('Guardé los códigos en un lugar seguro.').check();
	await page.getByRole('button', { name: 'Los guardé' }).click();
	await expect(page.getByText(/La verificación en dos pasos está/)).toBeVisible();
	return codes;
}

/** Cierra sesión desde Ajustes → Mi cuenta y espera a la bienvenida. */
export async function logout(page: Page): Promise<void> {
	// Navegación del lado del cliente para no recargar el simulador en memoria (que perdería el MFA).
	if (!page.url().includes('/settings/account')) {
		await page.getByRole('link', { name: 'Mi cuenta' }).click();
		await page.waitForURL('**/settings/account');
	}
	await page.getByRole('button', { name: 'Cerrar sesión' }).click();
	await page.waitForURL('**/welcome');
}

/** Inicia sesión con correo y contraseña y espera el reto de segundo paso. */
export async function loginWithPassword(page: Page): Promise<void> {
	// Navegación del lado del cliente para no recargar el simulador en memoria (que perdería el MFA).
	if (!page.url().includes('/login')) {
		await page.getByRole('button', { name: 'Ya tengo una cuenta' }).click();
		await page.waitForURL('**/login');
	}
	await page.getByLabel('Correo electrónico').fill(DEMO_EMAIL);
	await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
	await page.getByRole('button', { name: 'Iniciar sesión' }).click();
	await page.waitForURL('**/two-factor');
}
