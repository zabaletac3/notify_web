import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { PASSWORD, logoutToWelcome, navigate, register } from './real-helpers.js';
import { currentCode, totpForNewStep } from './totp.js';

/**
 * Verificación en dos pasos contra la API REAL: activar el TOTP (generado en la prueba), comprobar que el
 * primer paso del login NO entrega sesión, entrar con TOTP y con un código de respaldo, y que un código
 * incorrecto (o un código de respaldo ya usado) no deja entrar.
 */
const COOKIE = 'axonote_rt';

/** Activa el TOTP desde Ajustes. Devuelve el secreto, el paso usado y los 10 códigos de respaldo. */
async function activateMfa(page: Page): Promise<{ secret: string; step: number; codes: string[] }> {
	await navigate(page, '/settings/two-factor');
	await expect(
		page.getByRole('heading', { name: 'Verificación en dos pasos', level: 1 })
	).toBeVisible();
	await page.getByRole('button', { name: 'Activar' }).click();
	await page.locator('#mfa-password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Continuar' }).click();

	const secret = (await page.getByLabel('Clave secreta').innerText()).trim();
	const { code, step } = currentCode(secret);
	await page.locator('#totp-code').fill(code);
	await page.getByRole('button', { name: 'Activar' }).click();

	const list = page.getByLabel('Códigos de respaldo');
	await expect(list).toBeVisible();
	const codes = (await list.locator('li').allInnerTexts()).map((t) => t.trim());
	expect(codes).toHaveLength(10);
	expect(new Set(codes).size).toBe(10);
	await page.getByLabel('Guardé los códigos en un lugar seguro.').check();
	await page.getByRole('button', { name: 'Los guardé' }).click();
	await expect(page.getByText(/La verificación en dos pasos está/)).toBeVisible();
	return { secret, step, codes };
}

/** Inicia sesión con correo y contraseña y espera el reto del segundo paso. */
async function loginToChallenge(page: Page, email: string): Promise<void> {
	await navigate(page, '/login');
	await page.locator('#email').fill(email);
	await page.locator('#password').fill(PASSWORD);
	await page.getByRole('button', { name: /Iniciar sesión/ }).click();
	await expect(page).toHaveURL(/\/two-factor$/, { timeout: 30_000 });
}

test('activar, iniciar sesión con TOTP y con código de respaldo, y un código incorrecto no entra', async ({
	browser
}) => {
	test.setTimeout(300_000);
	const email = 'mfa@correo.com';
	const ctx: BrowserContext = await browser.newContext();
	const page = await ctx.newPage();
	await register(page, email, 'Marta MFA');

	const { secret, step, codes } = await activateMfa(page);

	// Primer paso del login con MFA: reto sin sesión (ni cookie ni tokens), y un código TOTP de una ventana
	// nueva entra (el paso de la activación ya está usado).
	await logoutToWelcome(page);
	expect((await ctx.cookies()).some((c) => c.name === COOKIE)).toBe(false);
	await loginToChallenge(page, email);
	expect(
		(await ctx.cookies()).some((c) => c.name === COOKIE),
		'el reto del segundo paso no debe emitir la cookie de sesión'
	).toBe(false);
	const fresh = await totpForNewStep(secret, step);
	await page.getByLabel('Código de verificación en dos pasos').first().fill(fresh.code);
	await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });
	expect((await ctx.cookies()).some((c) => c.name === COOKIE)).toBe(true);

	// Un código de respaldo también entra... pero solo una vez.
	await logoutToWelcome(page);
	await loginToChallenge(page, email);
	await page.getByRole('button', { name: 'Usar un código de respaldo' }).click();
	await page.getByLabel('Código de respaldo').fill(codes[0]);
	await page.getByRole('button', { name: 'Verificar' }).click();
	await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });

	await logoutToWelcome(page);
	await loginToChallenge(page, email);
	await page.getByRole('button', { name: 'Usar un código de respaldo' }).click();
	await page.getByLabel('Código de respaldo').fill(codes[0]);
	await page.getByRole('button', { name: 'Verificar' }).click();
	await expect(page.getByText('El código debe tener 6 dígitos.').first()).toBeVisible();
	await expect(page).toHaveURL(/\/two-factor$/);

	// Un código TOTP incorrecto tampoco deja entrar.
	await logoutToWelcome(page);
	await loginToChallenge(page, email);
	await page.getByLabel('Código de verificación en dos pasos').first().fill('000000');
	await page.getByRole('button', { name: 'Verificar' }).click();
	await expect(page.getByText('El código debe tener 6 dígitos.')).toBeVisible();
	await expect(page).toHaveURL(/\/two-factor$/);

	await ctx.close();
});
