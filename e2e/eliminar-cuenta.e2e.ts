import { expect, test, type Page } from '@playwright/test';

/** Contraseña de la cuenta de ejemplo del simulador. */
const PASSWORD = 'Secret123!';

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

test('borrar la cuenta exige la contraseña y cierra la sesión', async ({ page }) => {
	test.setTimeout(120_000);

	await page.goto('/settings/delete-account');
	await expect(page.getByText('Esta acción no se puede deshacer')).toBeVisible();

	// Con la contraseña incorrecta se ve el error y no se sale de la pantalla.
	await page.locator('#password').fill('mala');
	await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
	await expect(page.getByText('La contraseña no es correcta.')).toBeVisible({ timeout: 60_000 });
	await expect(page).toHaveURL(/\/settings\/delete-account$/);

	// Deja el campo vacío: el botón queda deshabilitado.
	await page.locator('#password').fill('');
	await expect(page.getByRole('button', { name: 'Eliminar mi cuenta' })).toBeDisabled();

	// Con la contraseña correcta se borra, se vuelve a la raíz y la sesión queda cerrada.
	await page.locator('#password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
	await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });
	await navigate(page, '/notes');
	await expect(page.getByText('Lista de compras de la semana')).toHaveCount(0);
});
