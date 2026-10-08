import { expect, test, type Page } from '@playwright/test';

/**
 * Recorrido completo del cifrado de extremo a extremo, como lo haría una persona:
 * registrarse → guardar la clave de recuperación → escribir una nota → cerrar sesión →
 * olvidar la contraseña → restablecerla con la clave de recuperación → iniciar sesión → la nota sigue ahí.
 *
 * El servidor es el simulador (vive en memoria), así que no se recarga la página entre pasos:
 * se navega con enlaces, como hace la propia app.
 */

/** Navega dentro de la app sin recargar (SvelteKit intercepta el clic en un enlace). */
async function navigate(page: Page, href: string) {
	await page.evaluate((to) => {
		const link = document.createElement('a');
		link.href = to;
		document.body.appendChild(link);
		link.click();
		link.remove();
	}, href);
}

/**
 * Cualquier recurso que la política de seguridad de contenido (CSP) bloquee hace fallar la prueba:
 * así se nota enseguida si una librería nueva necesita scripts, estilos o conexiones no permitidos.
 */
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		const violations: string[] = [];
		(window as unknown as { __csp: string[] }).__csp = violations;
		document.addEventListener('securitypolicyviolation', (e) =>
			violations.push(
				`${e.violatedDirective} → ${e.blockedURI || 'inline'} (${e.sourceFile ?? ''})`
			)
		);
	});
});

test.afterEach(async ({ page }) => {
	const violations = await page.evaluate(
		() => (window as unknown as { __csp?: string[] }).__csp ?? []
	);
	expect(violations, 'La CSP bloqueó algo').toEqual([]);
});

const PASSWORD = 'Secret123!';
const NEW_PASSWORD = 'Nueva456!x';
const KEY_FORMAT = /^([0-9A-Z*~$=]{4}-){13}[0-9A-Z*~$=]$/;

test('registro, clave de recuperación y recuperación de la cuenta sin perder las notas', async ({
	page
}) => {
	test.setTimeout(120_000);

	// 1. Registro y verificación del correo.
	await page.goto('/register');
	await page.locator('#fullName').fill('Luis Gómez');
	await page.locator('#email').fill('luis@correo.com');
	await page.locator('#password').fill(PASSWORD);
	await page.locator('#terms').click();
	await page.getByRole('button', { name: 'Crear cuenta' }).click();
	await expect(page).toHaveURL(/\/verify$/);
	await page.locator('input[autocomplete="one-time-code"]').first().focus();
	await page.keyboard.type('123456');

	// 2. La clave de recuperación se enseña una vez y no deja continuar sin confirmar.
	await expect(page).toHaveURL(/\/recovery-key$/);
	const recoveryKey = (await page.getByLabel('Clave de recuperación').innerText()).trim();
	expect(recoveryKey).toMatch(KEY_FORMAT);
	const next = page.getByRole('button', { name: 'Continuar' });
	await expect(next).toBeDisabled();
	await page.getByRole('checkbox', { name: 'La guardé en un lugar seguro.' }).click();
	await next.click();
	await expect(page).toHaveURL(/\/onboarding$/);

	// 3. Una nota nueva, cifrada y guardada.
	await navigate(page, '/notes');
	// La lista abre sola la primera nota. Crear una nota tarda un instante (se cifra y se escribe en
	// IndexedDB); si el título se escribe antes de que la nota nueva quede abierta, el texto iría a la
	// nota anterior. Se espera a que la tarjeta activa cambie y el editor sea el de la nota nueva.
	const selected = page.locator('[aria-current="true"]');
	await expect(selected).toHaveCount(1);
	const previouslyOpen = await selected.innerText();
	await page.getByRole('button', { name: 'Nueva nota' }).first().click();
	await expect.poll(() => selected.innerText()).not.toBe(previouslyOpen);
	await expect(page.getByLabel('Título')).toHaveValue('');
	await page.getByLabel('Título').fill('Mi nota secreta');
	await page.locator('.ProseMirror').first().click();
	await page.keyboard.type('Contenido que solo yo puedo leer');
	await expect(page.getByLabel('Título')).toHaveValue('Mi nota secreta');
	await expect(page.getByText(/Guardado/)).toBeVisible();

	// 4. Cerrar sesión. Se sincroniza antes a propósito: si el aviso "Sincronizar y salir" tardara en
	// salir, la copia local se borraría con la nota sin subir.
	await navigate(page, '/settings/sync');
	await page.getByRole('button', { name: /Sincronizar ahora/ }).click();
	await expect(page.getByText('Todo sincronizado').first()).toBeVisible();
	await navigate(page, '/settings/account');
	await page.getByText('Cerrar sesión').first().click();
	const syncAndExit = page.getByRole('button', { name: 'Sincronizar y salir' });
	if (await syncAndExit.isVisible({ timeout: 1500 }).catch(() => false)) await syncAndExit.click();
	await expect(page).toHaveURL(/\/welcome$/);

	// 5. Olvidé la contraseña: el enlace del correo y la clave de recuperación.
	await navigate(page, '/forgot-password');
	await page.locator('#email').fill('luis@correo.com');
	await page.getByRole('button', { name: 'Enviar enlace' }).click();
	await navigate(page, '/reset-password?token=token-de-prueba');
	await expect(page.getByText('¿Tienes tu clave de recuperación?')).toBeVisible();
	// Una clave equivocada no restablece nada.
	await page.locator('#recovery-key').fill('AAAA-BBBB-CCCC');
	await page.locator('#password').fill(NEW_PASSWORD);
	await page.locator('#confirmation').fill(NEW_PASSWORD);
	await page.getByRole('button', { name: 'Guardar contraseña' }).click();
	await expect(page.getByText('La clave de recuperación no es correcta.')).toBeVisible();
	await page.locator('#recovery-key').fill(recoveryKey);
	await page.getByRole('button', { name: 'Guardar contraseña' }).click();
	await expect(page).toHaveURL(/\/login$/);

	// 6. La contraseña vieja ya no sirve; la nueva abre la cuenta y la nota sigue ahí.
	await page.locator('#email').fill('luis@correo.com');
	await page.locator('#password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Iniciar sesión' }).click();
	await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible();
	await page.locator('#password').fill(NEW_PASSWORD);
	await page.getByRole('button', { name: /Iniciar sesión|Desbloqueando/ }).click();
	await expect(page).toHaveURL(/\/notes$/);
	// Bajar y descifrar todo tras iniciar sesión puede tardar más si la máquina va cargada.
	await expect(page.getByText('Mi nota secreta').first()).toBeVisible({ timeout: 20_000 });
});

test('la app bloqueada pide la contraseña y la nota sigue ahí al desbloquear', async ({ page }) => {
	test.setTimeout(90_000);
	await page.goto('/settings/privacy');
	// "Inmediatamente": al ocultar la pestaña, la app se bloquea.
	await page.getByText('Tiempo de bloqueo').first().click();
	await page.getByText('Inmediatamente').first().click();
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { value: true, configurable: true });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect(page).toHaveURL(/\/unlock$/);
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { value: false, configurable: true });
	});

	await page.locator('#password').fill('contraseña mala');
	await page.getByRole('button', { name: 'Desbloquear' }).click();
	await expect(page.getByText('La contraseña no es correcta.')).toBeVisible();
	await expect(page.getByText('Te quedan 4 intentos.')).toBeVisible();

	await page.locator('#password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Desbloquear' }).click();
	await expect(page).toHaveURL(/\/notes$/);
	await expect(page.getByText('Lista de compras de la semana').first()).toBeVisible();
});
