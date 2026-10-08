import { readFileSync } from 'node:fs';
import { expect, request, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Sesión web por cookie `HttpOnly` contra la API REAL (modo cookie, `X-Apunte-Session: cookie`):
 * el token de renovación nunca toca JavaScript ni `localStorage`; recargar mantiene la sesión;
 * varias pestañas renuevan a la vez; logout borra la cookie; reutilizar una cookie vieja la revoca.
 */
const LOG = 'e2e-http/.api.log';
const PASSWORD = 'Secret123!';
const API = 'http://localhost:18080';
const WEB = 'http://localhost:4174';
const COOKIE_HEADER = 'X-Apunte-Session';

/** Última línea del registro de la API con un correo "enviado" a esa persona (en dev el correo va al log). */
async function mailFor(to: string, subject: string, timeoutMs = 15_000): Promise<string> {
	const until = Date.now() + timeoutMs;
	for (;;) {
		const lines = readFileSync(LOG, 'utf8').split('\n').filter(Boolean).reverse();
		for (const line of lines) {
			try {
				const j = JSON.parse(line);
				if (j.to === to && String(j.subject).includes(subject)) return String(j.text);
			} catch {
				// línea que no es JSON (migraciones): se ignora
			}
		}
		if (Date.now() > until) throw new Error(`no llegó el correo "${subject}" a ${to}`);
		await new Promise((r) => setTimeout(r, 250));
	}
}

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

/** Registra una cuenta nueva (código leído del correo) y deja la app autenticada en `/notes`. */
async function register(page: Page, email: string, name: string): Promise<void> {
	await page.goto('/register');
	await page.locator('#fullName').fill(name);
	await page.locator('#email').fill(email);
	await page.locator('#password').fill(PASSWORD);
	await page.locator('#terms').click();
	await page.getByRole('button', { name: 'Crear cuenta' }).click();
	await expect(page).toHaveURL(/\/verify$/);
	const code = /\b(\d{6})\b/.exec(await mailFor(email, 'código de verificación'))?.[1];
	await page.locator('input[autocomplete="one-time-code"]').first().focus();
	await page.keyboard.type(code!);
	await expect(page).toHaveURL(/\/recovery-key$/);
	await page.getByRole('checkbox', { name: 'La guardé en un lugar seguro.' }).click();
	await page.getByRole('button', { name: 'Continuar' }).click();
	await expect(page).toHaveURL(/\/onboarding$/);
	await navigate(page, '/notes');
	await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });
}

async function refreshCookie(ctx: BrowserContext): Promise<string> {
	const cookie = (await ctx.cookies()).find((c) => c.name === 'apunte_rt');
	expect(cookie, 'debe existir la cookie apunte_rt').toBeTruthy();
	return cookie!.value;
}

/** Recarga y espera a que termine la renovación con la cookie (rota el token de refresco). */
async function reloadAndWaitRefresh(page: Page): Promise<void> {
	const refreshed = page.waitForResponse((r) => r.url().endsWith('/v1/auth/refresh'), {
		timeout: 30_000
	});
	await page.reload();
	await refreshed;
}

test('la sesión va por cookie HttpOnly, sin tokens en JS/localStorage, y sobrevive a la recarga', async ({
	browser
}) => {
	test.setTimeout(240_000);
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await register(page, 'cookie-atributos@correo.com', 'Carla Cookie');

	// La cookie de renovación existe con los atributos de D15.
	const cookie = (await ctx.cookies()).find((c) => c.name === 'apunte_rt');
	expect(cookie).toBeTruthy();
	expect(cookie!.httpOnly).toBe(true);
	expect(cookie!.sameSite).toBe('Strict');
	expect(cookie!.path).toBe('/v1/auth');

	// `document.cookie` no la ve (HttpOnly) y en localStorage no hay tokens.
	expect(await page.evaluate(() => document.cookie)).not.toContain('apunte_rt');
	const dump = await page.evaluate(() => {
		const out: { key: string; value: string }[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i)!;
			out.push({ key, value: localStorage.getItem(key) ?? '' });
		}
		return out;
	});
	expect(dump.map((e) => e.key)).not.toContain('apunte.tokens');
	for (const entry of dump) {
		const text = `${entry.key}=${entry.value}`;
		expect(text).not.toContain('accessToken');
		expect(text).not.toContain('refreshToken');
		expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // un JWT a la vista
	}
	expect(dump.some((e) => e.key === 'apunte.session')).toBe(true);

	// Recargar: la petición sale sin token en memoria y se renueva con la cookie; sigue autenticado.
	await page.reload();
	await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });
	await expect(page.getByRole('button', { name: 'Nueva nota' }).first()).toBeVisible({
		timeout: 30_000
	});
	await ctx.close();
});

test('dos pestañas del mismo contexto refrescan a la vez sin cerrar la sesión', async ({
	browser
}) => {
	test.setTimeout(240_000);
	const ctx = await browser.newContext();
	const a = await ctx.newPage();
	await register(a, 'cookie-pestanas@correo.com', 'Pablo Pestañas');

	const b = await ctx.newPage();
	await b.goto('/notes');
	await expect(b).toHaveURL(/\/notes$/, { timeout: 30_000 });

	// Recargan a la vez (cada una renueva con la misma cookie, serializado por Web Locks).
	await Promise.all([a.reload(), b.reload()]);
	await expect(a).toHaveURL(/\/notes$/, { timeout: 30_000 });
	await expect(b).toHaveURL(/\/notes$/, { timeout: 30_000 });
	await ctx.close();
});

test('cerrar sesión borra la cookie y al recargar queda anónimo', async ({ browser }) => {
	test.setTimeout(240_000);
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await register(page, 'cookie-logout@correo.com', 'Luz Logout');

	await navigate(page, '/settings/account');
	await page.getByText('Cerrar sesión').first().click();
	const syncAndExit = page.getByRole('button', { name: 'Sincronizar y salir' });
	if (await syncAndExit.isVisible({ timeout: 1500 }).catch(() => false)) await syncAndExit.click();
	await expect(page).toHaveURL(/\/welcome$/);

	expect((await ctx.cookies()).some((c) => c.name === 'apunte_rt')).toBe(false);

	// Al recargar ya no hay sesión: no vuelve a pedir login, pero es una persona anónima.
	await page.reload();
	await expect(page).toHaveURL(/\/(welcome|login)$/, { timeout: 30_000 });
	await ctx.close();
});

test('reutilizar una cookie rotada devuelve 401 y revoca la familia', async ({ browser }) => {
	test.setTimeout(240_000);
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await register(page, 'cookie-reuso@correo.com', 'Rita Reuso');

	// Tras el registro la sesión ya va por cookie; todavía no se ha renovado.
	const oldCookie = await refreshCookie(ctx);

	// Una recarga normal desde la página rota la cookie (el token de acceso solo vive en memoria).
	await reloadAndWaitRefresh(page);
	await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });
	const newCookie = await refreshCookie(ctx);
	expect(newCookie).not.toBe(oldCookie);

	const api = await request.newContext();
	const headers = { Cookie: `apunte_rt=${oldCookie}`, [COOKIE_HEADER]: 'cookie', Origin: WEB };
	const reuse = await api.post(`${API}/v1/auth/refresh`, { headers });
	expect(reuse.status()).toBe(401);

	// La familia entera queda revocada: la cookie vigente de la página tampoco renueva.
	const after = await api.post(`${API}/v1/auth/refresh`, {
		headers: { Cookie: `apunte_rt=${newCookie}`, [COOKIE_HEADER]: 'cookie', Origin: WEB }
	});
	expect(after.status()).toBe(401);
	await api.dispose();
	await ctx.close();
});

test('un Origin ajeno en modo cookie se rechaza con 403 (anti-CSRF)', async () => {
	test.setTimeout(60_000);
	const api = await request.newContext();
	const res = await api.post(`${API}/v1/auth/refresh`, {
		headers: { [COOKIE_HEADER]: 'cookie', Origin: 'https://evil.example' }
	});
	expect(res.status()).toBe(403);
	await api.dispose();
});

test('tras migrar (borrar apunte.tokens) la base local se recupera al volver a iniciar sesión', async ({
	browser
}) => {
	test.setTimeout(240_000);
	const email = 'cookie-migracion@correo.com';
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await register(page, email, 'Marta Migración');

	// Una nota queda en la copia local (IndexedDB) de esa cuenta.
	await navigate(page, '/notes');
	await page.getByRole('button', { name: 'Nueva nota' }).first().click();
	await page.getByLabel('Título').fill('Nota de la migración');
	await page.locator('.ProseMirror').first().click();
	await page.keyboard.type('Sigue en la base local tras migrar');
	await expect(page.getByText(/Guardado/)).toBeVisible();

	// Simula la instalación anterior: sin cookie ni marcador, pero con `apunte.tokens` y la base local.
	await ctx.clearCookies();
	await page.evaluate(() => {
		localStorage.removeItem('apunte.session');
		localStorage.setItem(
			'apunte.tokens',
			JSON.stringify({ accessToken: 'viejo', refreshToken: 'viejo', expiresAt: 'x' })
		);
	});
	await page.reload();
	await page.goto('/login');
	await page.locator('#email').fill(email);
	await page.locator('#password').fill(PASSWORD);
	await page.getByRole('button', { name: /Iniciar sesión/ }).click();
	await expect(page).toHaveURL(/\/notes$/, { timeout: 60_000 });

	// La migración borró la clave antigua; la base local (IndexedDB) no se toca.
	expect(await page.evaluate(() => localStorage.getItem('apunte.tokens'))).toBeNull();
	await expect(page.getByText('Nota de la migración').first()).toBeVisible({ timeout: 30_000 });
	await ctx.close();
});
