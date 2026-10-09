import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_PASSWORD, setGoogleScenario, startGoogle } from './google-helpers.js';

/**
 * Dispositivos de confianza (T2/T4) sobre el backend simulado.
 *
 * Limitación conocida: el servidor simulado vive en memoria y el retorno de Google recarga la página,
 * así que la mitad del servidor de la confianza no sobrevive entre dos logins con Google. El recorrido
 * completo «cerrar sesión → Google → entra sin contraseña» no se puede validar aquí: se cubre con las
 * pruebas unitarias de estado y, contra la API real, en `e2e-http/` (fase 7). Aquí se valida el alta
 * (vincular con Google y contraseña), que la lista lo muestra y que «olvidar» vuelve a pedir la
 * contraseña.
 */

/** Vincula la cuenta de ejemplo con Google (crea la confianza) y entra. */
async function linkGoogleAndTrust(page: Page): Promise<void> {
	await setGoogleScenario(page, 'unlinked');
	await page.goto('/login');
	await startGoogle(page);
	await expect(page.getByRole('heading', { name: 'Vincula tu cuenta' })).toBeVisible();
	await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
	await page.getByRole('button', { name: 'Vincular con Google' }).click();
	await page.waitForURL('**/notes');
}

/** Navegación del lado del cliente para no perder el servidor simulado en memoria. */
async function goToAccount(page: Page): Promise<void> {
	if (!page.url().includes('/settings')) {
		await page.getByRole('link', { name: 'Ajustes' }).first().click();
	}
	await page.getByRole('link', { name: 'Mi cuenta' }).click();
	await page.waitForURL('**/settings/account');
}

test.describe('Dispositivos de confianza', () => {
	test('entrar con Google y contraseña da de alta el dispositivo, que aparece en la lista', async ({
		page
	}) => {
		await linkGoogleAndTrust(page);
		await page.getByRole('link', { name: 'Ajustes' }).first().click();
		await page.getByRole('link', { name: 'Sincronización' }).click();
		await page.waitForURL('**/settings/sync');
		await expect(page.getByRole('button', { name: 'Quitar Chrome en Linux' })).toBeVisible();
	});

	test('cerrar sesión conserva la confianza y ofrece olvidar el dispositivo', async ({ page }) => {
		await linkGoogleAndTrust(page);
		await goToAccount(page);
		await page.getByRole('button', { name: 'Cerrar sesión' }).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await expect(
			dialog.getByRole('button', { name: 'Cerrar sesión y olvidar este dispositivo' })
		).toBeVisible();
	});

	test('olvidar el dispositivo pide la contraseña la próxima vez', async ({ page }) => {
		await linkGoogleAndTrust(page);
		await goToAccount(page);
		await page.getByRole('button', { name: 'Cerrar sesión' }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('button', { name: 'Cerrar sesión y olvidar este dispositivo' }).click();
		await page.waitForURL('**/welcome');

		await page.getByRole('button', { name: 'Ya tengo una cuenta' }).click();
		await page.waitForURL('**/login');
		await startGoogle(page);
		// Sin confianza, Google vuelve a pedir la contraseña.
		await expect(page.getByRole('heading', { name: 'Vincula tu cuenta' })).toBeVisible();
	});
});

/** Accesibilidad de lo nuevo: la lista de confianza y el diálogo de cierre con dos opciones. */
for (const mode of ['light', 'dark'] as const) {
	test(`axe · dispositivos de confianza (${mode})`, async ({ page }) => {
		await page.addInitScript((m) => localStorage.setItem('mode-watcher-mode', m), mode);
		await linkGoogleAndTrust(page);
		await page.getByRole('link', { name: 'Ajustes' }).first().click();
		await page.getByRole('link', { name: 'Sincronización' }).click();
		await page.waitForURL('**/settings/sync');
		await page.waitForTimeout(400);
		const { violations } = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(violations, 'Problemas de accesibilidad en la lista de confianza').toEqual([]);

		await goToAccount(page);
		await page.getByRole('button', { name: 'Cerrar sesión' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		const dialogAudit = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(dialogAudit.violations, 'Problemas de accesibilidad en el diálogo de cierre').toEqual(
			[]
		);
	});
}
