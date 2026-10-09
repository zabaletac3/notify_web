import { expect, test } from '@playwright/test';

/**
 * Política de seguridad de contenido (CSP) y cabeceras: ninguna pantalla pública debe tener
 * recursos bloqueados, y las respuestas deben llevar las cabeceras de seguridad.
 */
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		const violations: string[] = [];
		(window as unknown as { __csp: string[] }).__csp = violations;
		document.addEventListener('securitypolicyviolation', (e) =>
			violations.push(`${e.violatedDirective} → ${e.blockedURI || 'inline'}`)
		);
	});
});

const violations = (page: import('@playwright/test').Page) =>
	page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);

test('las respuestas del servidor llevan CSP y las cabeceras de seguridad', async ({ page }) => {
	const response = await page.goto('/login');
	const headers = response!.headers();
	const csp = headers['content-security-policy'];
	expect(csp).toContain("default-src 'self'");
	expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
	expect(csp).toContain("object-src 'none'");
	expect(csp).toContain("frame-ancestors 'none'");
	// Los scripts de SvelteKit llevan nonce; nada de `unsafe-inline` ni `unsafe-eval` en los scripts.
	expect(csp).toMatch(/script-src [^;]*'nonce-/);
	expect(csp).not.toMatch(/script-src[^;]*(?<!wasm-)unsafe-(inline|eval)/);
	expect(headers['referrer-policy']).toBe('no-referrer');
	expect(headers['x-content-type-options']).toBe('nosniff');
	expect(headers['permissions-policy']).toContain('camera=()');
	expect(headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
	expect(headers['strict-transport-security']).toContain('max-age=');
	expect(await violations(page)).toEqual([]);
});

test('la página de inicio (prerenderizada) lleva la CSP en una etiqueta meta, sin bloqueos', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1, name: 'AxoNote' })).toBeVisible();
	const meta = await page
		.locator('meta[http-equiv="content-security-policy"]')
		.getAttribute('content');
	expect(meta).toContain("default-src 'self'");
	expect(meta).toMatch(/script-src [^;]*'sha256-/);
	expect(await violations(page)).toEqual([]);
});

test('las pantallas de acceso y el enlace público cargan sin que la CSP bloquee nada', async ({
	page
}) => {
	for (const path of [
		'/welcome',
		'/register',
		'/forgot-password',
		`/n/${'a'.repeat(22)}#k=${'b'.repeat(43)}`
	]) {
		await page.goto(path);
		await page.waitForTimeout(800);
		expect(await violations(page), path).toEqual([]);
	}
	await expect(page.getByText('Este enlace no es válido o fue revocado')).toBeVisible();
});

test('el tema guardado se aplica antes de que cargue la app (sin script en línea)', async ({
	page
}) => {
	await page.addInitScript(() => localStorage.setItem('mode-watcher-mode', 'dark'));
	// Se corta el JavaScript de la app: lo que queda es solo el script externo del tema.
	await page.route('**/_app/**', (route) => route.abort());
	await page.goto('/login', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('html')).toHaveClass(/dark/);
	await page.addInitScript(() => localStorage.setItem('mode-watcher-mode', 'light'));
	await page.goto('/login', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('html')).not.toHaveClass(/dark/);
});
