import { expect, test, type Page } from '@playwright/test';

/** Tamaño de letra (en px) del primer elemento que coincida. */
const fontSize = (page: Page, selector: string) =>
	page
		.locator(selector)
		.first()
		.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

/** Elige una opción de un ajuste de lista desplegable y espera a que el menú se cierre. */
async function choose(page: Page, setting: string, option: string) {
	await page.getByRole('button', { name: new RegExp(setting) }).click();
	await page.getByRole('menuitemradio', { name: option }).click();
	await expect(page.getByRole('menu')).toBeHidden();
}

test.describe('Ajustes → Tamaño del texto', () => {
	test('cambia el tamaño de la letra, no los anchos, y se recuerda al recargar', async ({
		page
	}) => {
		await page.goto('/settings/general');
		const title = 'h1';
		await expect(page.locator(title).first()).toBeVisible();
		const normal = await fontSize(page, title);
		const sidebarWidth = await page
			.locator('nav, aside')
			.first()
			.evaluate((el) => el.getBoundingClientRect().width);

		await choose(page, 'Tamaño del texto', 'Grande');
		await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
		const large = await fontSize(page, title);
		expect(large / normal).toBeCloseTo(1.15, 1);
		// Solo crece la letra: la barra lateral no se ensancha.
		expect(
			await page
				.locator('nav, aside')
				.first()
				.evaluate((el) => el.getBoundingClientRect().width)
		).toBe(sidebarWidth);

		await choose(page, 'Tamaño del texto', 'Pequeño');
		await expect(page.locator('html')).toHaveAttribute('data-text-size', 'small');
		expect((await fontSize(page, title)) / normal).toBeCloseTo(0.9, 1);

		// El tamaño se pinta bien desde el primer momento, antes de que cargue la app.
		await page.route('**/_app/**', (route) => route.abort());
		await page.goto('/login', { waitUntil: 'domcontentloaded' });
		await expect(page.locator('html')).toHaveAttribute('data-text-size', 'small');
	});
});
