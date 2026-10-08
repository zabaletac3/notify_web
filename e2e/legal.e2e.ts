import { expect, test } from '@playwright/test';

/** Título (h1) que debe mostrar cada página legal. */
const legalPages: [string, string][] = [
	['/terms', 'Términos de uso'],
	['/privacy', 'Política de privacidad'],
	['/changelog', 'Notas de la versión'],
	['/licenses', 'Licencias de código abierto'],
	['/support', 'Contacto y soporte']
];

test.describe('Páginas legales sin sesión', () => {
	for (const [path, title] of legalPages) {
		test(`${path} carga sin redirigir`, async ({ page }) => {
			await page.goto(path);
			await expect(page).toHaveURL(new RegExp(`${path}$`));
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
		});
	}

	test('el índice de la política salta a su ancla', async ({ page }) => {
		await page.goto('/privacy');
		const index = page.getByRole('navigation', { name: 'Índice' });
		await index.getByRole('link', { name: '1. Responsable del tratamiento' }).click();
		await expect(page).toHaveURL(/#responsable$/);
	});
});

test.describe('Enlaces legales en el registro', () => {
	test('apuntan a /terms y /privacy y no marcan el checkbox', async ({ page }) => {
		await page.goto('/register');

		const checkbox = page.getByRole('checkbox', { name: /Acepto los/ });
		await expect(checkbox).not.toBeChecked();

		const terms = page.getByRole('link', { name: 'Términos de uso' });
		await expect(terms).toHaveAttribute('href', '/terms');
		const [termsTab] = await Promise.all([page.waitForEvent('popup'), terms.click()]);
		await termsTab.waitForLoadState();
		await expect(termsTab).toHaveURL(/\/terms$/);
		await termsTab.close();
		await expect(checkbox).not.toBeChecked();

		const privacy = page.getByRole('link', { name: 'Política de privacidad' });
		await expect(privacy).toHaveAttribute('href', '/privacy');
		const [privacyTab] = await Promise.all([page.waitForEvent('popup'), privacy.click()]);
		await privacyTab.waitForLoadState();
		await expect(privacyTab).toHaveURL(/\/privacy$/);
		await privacyTab.close();
		await expect(checkbox).not.toBeChecked();
	});
});

test.describe('Acerca de', () => {
	test('las cinco filas llevan a su ruta', async ({ page }) => {
		await page.goto('/settings/about');
		const rows: [string, string][] = [
			['Notas de la versión', '/changelog'],
			['Términos de uso', '/terms'],
			['Política de privacidad', '/privacy'],
			['Licencias de código abierto', '/licenses'],
			['Contacto y soporte', '/support']
		];
		for (const [label, href] of rows) {
			await expect(page.getByRole('link', { name: label })).toHaveAttribute('href', href);
		}
	});
});
