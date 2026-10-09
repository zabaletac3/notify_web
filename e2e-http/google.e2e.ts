import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, logoutToWelcome, navigate } from './real-helpers.js';
import { currentCode, totpForNewStep } from './totp.js';

/**
 * Acceso con Google contra la API REAL (`GOOGLE_PROVIDER=fake`, ver `e2e-http/api.sh`). El proveedor
 * simulado tiene una identidad fija (`google@example.com`), así que la cuenta se crea una vez y luego se
 * recorre la tabla 3.4: dispositivo nuevo pide contraseña; con dos pasos, Google + código (+ contraseña al
 * olvidar el dispositivo); con dispositivo de confianza, Google (+ código) entra sin contraseña.
 */
async function startGoogle(page: Page, label: string): Promise<void> {
	await page.getByRole('button', { name: label }).click();
	await page.waitForURL('**/auth/google**', { timeout: 30_000 });
}

/** Crea la cuenta por Google si aún no existe y deja la app desbloqueada en `/notes`. */
async function ensureGoogleAccount(page: Page): Promise<void> {
	await page.goto('/login');
	await startGoogle(page, 'Continuar con Google');

	const signup = page.getByRole('heading', { name: 'Crea tu contraseña de AxoNote' });
	const unlock = page.getByRole('heading', { name: 'Desbloquea AxoNote' });
	await expect(signup.or(unlock)).toBeVisible({ timeout: 30_000 });

	if (await signup.isVisible()) {
		await page.locator('#google-new-password').fill(PASSWORD);
		await page.locator('#google-confirm-password').fill(PASSWORD);
		await page.getByLabel(/Acepto los/).check();
		await page.getByRole('button', { name: 'Crear cuenta' }).click();
		await expect(page).toHaveURL(/\/recovery-key$/, { timeout: 30_000 });
		await page.getByRole('checkbox', { name: 'La guardé en un lugar seguro.' }).click();
		await page.getByRole('button', { name: 'Continuar' }).click();
		await expect(page).toHaveURL(/\/onboarding$/);
		await navigate(page, '/notes');
	} else {
		// Ya vinculada: dispositivo nuevo, pide la contraseña una vez.
		await page.locator('#password').fill(PASSWORD);
		await page.getByRole('button', { name: 'Desbloquear' }).click();
	}
	await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });
}

/** Activa el TOTP y devuelve el secreto, el paso usado y los códigos de respaldo. */
async function activateMfa(page: Page): Promise<{ secret: string; step: number; codes: string[] }> {
	await navigate(page, '/settings/two-factor');
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
	await page.getByLabel('Guardé los códigos en un lugar seguro.').check();
	await page.getByRole('button', { name: 'Los guardé' }).click();
	await expect(page.getByText(/La verificación en dos pasos está/)).toBeVisible();
	return { secret, step, codes };
}

/** Entra desde Google y, si toca el segundo paso, lo completa (sin contraseña: la app decide después). */
async function googleLoginThroughMfa(
	page: Page,
	secret: string,
	state: { step: number }
): Promise<void> {
	await page.goto('/login');
	await startGoogle(page, 'Continuar con Google');
	await expect(page).toHaveURL(/\/two-factor$/, { timeout: 30_000 });
	const fresh = await totpForNewStep(secret, state.step);
	state.step = fresh.step;
	await page.getByLabel('Código de verificación en dos pasos').first().fill(fresh.code);
}

test('registro con Google, dispositivo nuevo pide la contraseña y el de confianza entra sin ella', async ({
	browser
}) => {
	test.setTimeout(240_000);
	const ctx = await browser.newContext();
	const page = await ctx.newPage();

	// Registro con Google (correo ya verificado): crear contraseña y mostrar la clave de recuperación.
	await page.goto('/register');
	await startGoogle(page, 'Registrarse con Google');
	await expect(page.getByRole('heading', { name: 'Crea tu contraseña de AxoNote' })).toBeVisible({
		timeout: 30_000
	});
	await page.locator('#google-new-password').fill(PASSWORD);
	await page.locator('#google-confirm-password').fill(PASSWORD);
	await page.getByLabel(/Acepto los/).check();
	await page.getByRole('button', { name: 'Crear cuenta' }).click();
	await expect(page).toHaveURL(/\/recovery-key$/, { timeout: 30_000 });
	await page.getByRole('checkbox', { name: 'La guardé en un lugar seguro.' }).click();
	await page.getByRole('button', { name: 'Continuar' }).click();
	await expect(page).toHaveURL(/\/onboarding$/);
	await navigate(page, '/notes');
	await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });

	// La cuenta refleja que Google está vinculada.
	await navigate(page, '/settings/account');
	await expect(page.getByText('Vinculada')).toBeVisible();

	// «Cerrar sesión» conserva la confianza: el botón de Google vuelve a entrar sin contraseña (T2).
	await logoutToWelcome(page);
	await page.goto('/login');
	await startGoogle(page, 'Continuar con Google');
	await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });

	await ctx.close();
});

test('con dos pasos: Google + código; al olvidar el dispositivo, Google + código + contraseña', async ({
	browser
}) => {
	test.setTimeout(300_000);
	const ctx = await browser.newContext();
	const page = await ctx.newPage();

	// Cuenta creada en el test anterior (o se crea aquí): Google y, en un dispositivo nuevo, contraseña.
	await ensureGoogleAccount(page);

	// Activar la verificación en dos pasos (S3 cierra las demás sesiones, no la actual ni la confianza).
	const { secret, step } = await activateMfa(page);
	const totpState = { step };

	// Cerrar sesión conservando la confianza → Google + código, sin contraseña.
	await logoutToWelcome(page);
	await googleLoginThroughMfa(page, secret, totpState);
	await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });

	// Cerrar sesión olvidando el dispositivo → Google + código + contraseña.
	await logoutToWelcome(page, true);
	await googleLoginThroughMfa(page, secret, totpState);
	await expect(page).toHaveURL(/\/unlock$/, { timeout: 30_000 });
	await page.locator('#password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Desbloquear' }).click();
	await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });

	await ctx.close();
});
