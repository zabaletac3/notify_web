import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'axonote-sidebar-collapsed';
const aside = (page: Page) => page.locator('#app-sidebar');
const width = (page: Page) => aside(page).evaluate((el) => el.getBoundingClientRect().width);
const collapse = (page: Page) => page.getByRole('button', { name: 'Recoger la barra lateral' });
const expand = (page: Page) => page.getByRole('button', { name: 'Expandir la barra lateral' });

test.describe('Barra lateral recogible (escritorio)', () => {
	test.beforeEach(async ({ page }) => {
		// Se limpia una sola vez (no en cada recarga) para poder comprobar la persistencia.
		await page.goto('/welcome');
		await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
	});

	test('el botón la recoge y la expande, y el estado se recuerda al recargar', async ({ page }) => {
		await page.goto('/notes');
		await expect(aside(page)).toBeVisible();
		await expect(aside(page)).toHaveCSS('width', '248px');
		await expect(collapse(page)).toHaveAttribute('aria-expanded', 'true');

		await collapse(page).click();
		await expect(aside(page)).toHaveCSS('width', '64px');
		await expect(expand(page)).toHaveAttribute('aria-expanded', 'false');
		expect(Math.round(await width(page))).toBe(64);

		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed');
		await expect(aside(page)).toHaveCSS('width', '64px');

		await expand(page).click();
		await expect(aside(page)).toHaveCSS('width', '248px');
		expect(Math.round(await width(page))).toBe(248);
	});

	test('aplica el estado guardado antes de hidratar (sin parpadeo)', async ({ page }) => {
		await page.evaluate((key) => localStorage.setItem(key, '1'), STORAGE_KEY);
		// Sin el JS de la app: lo que pinta el estado es el script previo de `theme-init.js`.
		await page.route('**/_app/**', (route) => route.abort());
		await page.goto('/notes', { waitUntil: 'domcontentloaded' });
		await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed');
	});

	test('atajo Ctrl+B alterna; con el foco en el editor no recoge', async ({ page }) => {
		await page.goto('/notes');
		await expect(aside(page)).toHaveCSS('width', '248px');

		await page.keyboard.press('Control+b');
		await expect(aside(page)).toHaveCSS('width', '64px');
		await page.keyboard.press('Control+b');
		await expect(aside(page)).toHaveCSS('width', '248px');

		// En el editor, Ctrl+B es negrita: no debe recoger la barra.
		const editor = page.getByLabel('Contenido de la nota');
		await editor.click();
		await expect(editor).toBeFocused();
		await page.keyboard.press('Control+b');
		await page.waitForTimeout(350);
		await expect(aside(page)).toHaveCSS('width', '248px');
		await expect(collapse(page)).toHaveAttribute('aria-expanded', 'true');
	});

	test('muestra el tooltip al pasar el cursor y al enfocar con el teclado', async ({ page }) => {
		await page.goto('/notes');
		await collapse(page).click();
		await expect(aside(page)).toHaveCSS('width', '64px');

		const item = page.getByRole('button', { name: /^Todas las notas, \d+$/ });
		await item.hover();
		await expect(page.getByRole('tooltip')).toBeVisible();

		await page.mouse.move(0, 0);
		await expect(page.getByRole('tooltip')).toBeHidden();
		await item.focus();
		await expect(page.getByRole('tooltip')).toBeVisible();
	});

	test('navegar a una carpeta desde la barra recogida funciona', async ({ page }) => {
		await page.goto('/notes');
		await collapse(page).click();
		await expect(aside(page)).toHaveCSS('width', '64px');

		const folder = page.getByRole('button', { name: /^Universidad, \d+$/ });
		await folder.click();
		await expect(folder).toHaveAttribute('aria-current', 'page');
		await expect(page.getByRole('heading', { name: 'Universidad' }).first()).toBeVisible();
	});

	test('con el almacenamiento bloqueado no se rompe y alterna en memoria', async ({ page }) => {
		// Escritura bloqueada (como cuando el navegador niega el almacenamiento o se supera la cuota):
		// la app debe seguir funcionando y la barra alternarse solo en memoria.
		await page.addInitScript(() => {
			Object.defineProperty(Storage.prototype, 'setItem', {
				configurable: true,
				value: () => {
					throw new Error('almacenamiento bloqueado');
				}
			});
		});
		await page.goto('/notes');
		await expect(aside(page)).toBeVisible();
		await collapse(page).click();
		await expect(aside(page)).toHaveCSS('width', '64px');
	});
});

test.describe('Pie de la barra lateral con la ventana baja', () => {
	// Regresión: con pocas pulgadas de alto la lista se desplaza y el pie (Ajustes y el tema) no puede
	// quedar fuera de la vista ni tapado por la barra de desplazamiento.
	for (const recogido of [false, true]) {
		test(`el botón del tema y Ajustes son clicables (${recogido ? 'recogida' : 'abierta'})`, async ({
			page
		}) => {
			await page.setViewportSize({ width: 1280, height: 520 });
			await page.goto('/welcome');
			await page.evaluate(
				([key, value]) => localStorage.setItem(key, value),
				[STORAGE_KEY, recogido ? '1' : '0']
			);
			await page.goto('/notes');
			await expect(aside(page)).toBeVisible();
			// Con los datos cargados (carpetas y etiquetas) la lista central no cabe y se desplaza.
			await expect(
				aside(page)
					.getByText(/Universidad/)
					.first()
			).toBeAttached();

			const theme = aside(page).getByRole('button', { name: /Cambiar a tema/ });
			await expect(theme).toBeInViewport({ ratio: 1 });
			// El centro del botón debe recibir el clic (nada encima).
			const hit = await theme.evaluate((el) => {
				const r = el.getBoundingClientRect();
				const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
				return top === el || el.contains(top);
			});
			expect(hit).toBe(true);

			const dark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
			const before = await dark();
			await theme.click();
			await expect.poll(dark).toBe(!before);

			const settings = aside(page).getByRole('link', { name: 'Ajustes' });
			await expect(settings).toBeInViewport({ ratio: 1 });
			await settings.click();
			await expect(page).toHaveURL(/\/settings/);
		});
	}
});

test.describe('Barra lateral en pantallas pequeñas', () => {
	test('no hay botón de recoger y el panel lateral sigue igual', async ({ page }) => {
		await page.setViewportSize({ width: 480, height: 900 });
		await page.goto('/notes');
		await expect(collapse(page)).toHaveCount(0);
		await expect(expand(page)).toHaveCount(0);
		await expect(aside(page)).toBeHidden();

		await page.getByRole('button', { name: 'Abrir menú' }).click();
		const drawer = page.getByRole('dialog', { name: 'Navegación' });
		await expect(drawer).toBeVisible();
		await expect(drawer.getByText('AxoNote')).toBeVisible();
		await expect(collapse(page)).toHaveCount(0);
	});
});
