import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accesibilidad automática (axe-core, WCAG 2.1 A y AA) en las pantallas principales, en claro y en
 * oscuro. Cubre contraste de color, etiquetas de formularios, nombres de botones y roles.
 * Una regla de axe no sustituye probar con un lector de pantalla, pero atrapa lo más común.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function audit(page: Page, name: string) {
	const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
	const summary = violations.map(
		(v) =>
			`${v.id} (${v.impact}): ${v.help}\n` +
			v.nodes
				.slice(0, 3)
				.map((n) => `   ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1] ?? ''}`)
				.join('\n')
	);
	expect(summary, `Problemas de accesibilidad en ${name}`).toEqual([]);
}

async function theme(page: Page, mode: 'light' | 'dark') {
	await page.addInitScript((m) => localStorage.setItem('mode-watcher-mode', m), mode);
}

for (const mode of ['light', 'dark'] as const) {
	test.describe(`tema ${mode === 'light' ? 'claro' : 'oscuro'}`, () => {
		test.beforeEach(async ({ page }) => theme(page, mode));

		const publicScreens: [string, string][] = [
			['/welcome', 'Bienvenida'],
			['/login', 'Iniciar sesión'],
			['/register', 'Crear cuenta'],
			['/forgot-password', 'Recuperar contraseña'],
			['/verify', 'Verificar correo']
		];
		for (const [path, name] of publicScreens)
			test(`${name} (${path})`, async ({ page }) => {
				await page.goto(path);
				await page.waitForTimeout(500);
				await audit(page, name);
			});

		test('lista de notas y editor', async ({ page }) => {
			await page.goto('/notes');
			await expect(page.getByText('Lista de compras de la semana').first()).toBeVisible();
			await page.getByText('Lista de compras de la semana').first().click();
			await page.waitForTimeout(500);
			await audit(page, 'Notas');
		});

		for (const section of ['general', 'privacy', 'sync', 'storage', 'account'])
			test(`ajustes / ${section}`, async ({ page }) => {
				await page.goto(`/settings/${section}`);
				await page.waitForTimeout(1200);
				await audit(page, `Ajustes ${section}`);
			});

		test('diálogo de compartir', async ({ page }) => {
			await page.goto('/notes');
			await page.getByText('Lista de compras de la semana').first().click();
			await page.getByRole('button', { name: 'Compartir' }).first().click();
			await expect(page.getByText('Compartir nota')).toBeVisible();
			await audit(page, 'Compartir nota');
		});
	});
}
