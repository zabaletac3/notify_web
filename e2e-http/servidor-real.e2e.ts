import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Recorrido contra la API REAL con dos dispositivos de la misma cuenta y un visitante:
 * registro con código por correo → clave de recuperación → nota cifrada → segundo dispositivo la lee →
 * el servidor solo guarda texto cifrado → enlace público → quitar un dispositivo lo desconecta.
 */
const LOG = 'e2e-http/.api.log';
const EMAIL = 'ana@correo.com';
const PASSWORD = 'Secret123!';
const PG = [
	`host=${process.env.E2E_PG_HOST ?? '/tmp/pg'}`,
	`port=${process.env.E2E_PG_PORT ?? '5433'}`,
	`user=${process.env.E2E_PG_USER ?? 'postgres'}`,
	'dbname=apunte_e2e'
].join(' ');

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

function sql(query: string): string {
	return execFileSync('psql', [PG, '-tAc', query], { encoding: 'utf8' }).trim();
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

async function syncNow(page: Page) {
	await navigate(page, '/settings/sync');
	await page.getByRole('button', { name: /Sincronizar ahora/ }).click();
	await page.waitForTimeout(1500);
}

test('dos dispositivos, texto cifrado en el servidor, enlace público y dispositivo quitado', async ({
	browser
}) => {
	test.setTimeout(240_000);

	// ── Dispositivo A: registro con el servidor real ──
	const ctxA: BrowserContext = await browser.newContext();
	const a = await ctxA.newPage();
	await a.goto('/register');
	await a.locator('#fullName').fill('Ana Pérez');
	await a.locator('#email').fill(EMAIL);
	await a.locator('#password').fill(PASSWORD);
	await a.locator('#terms').click();
	await a.getByRole('button', { name: 'Crear cuenta' }).click();
	await expect(a).toHaveURL(/\/verify$/);

	const mail = await mailFor(EMAIL, 'código de verificación');
	const code = /\b(\d{6})\b/.exec(mail)?.[1];
	expect(code, 'el correo trae un código de 6 dígitos').toBeTruthy();
	await a.locator('input[autocomplete="one-time-code"]').first().focus();
	await a.keyboard.type(code!);
	await expect(a).toHaveURL(/\/recovery-key$/);
	await a.getByRole('checkbox', { name: 'La guardé en un lugar seguro.' }).click();
	await a.getByRole('button', { name: 'Continuar' }).click();
	await expect(a).toHaveURL(/\/onboarding$/);

	// ── Una nota cifrada ──
	await navigate(a, '/notes');
	await a.getByRole('button', { name: 'Nueva nota' }).first().click();
	await a.getByLabel('Título').fill('Nota del servidor real');
	await a.locator('.ProseMirror').first().click();
	await a.keyboard.type('Texto secreto: nadie salvo yo lo lee');
	await expect(a.getByText(/Guardado/)).toBeVisible();
	await syncNow(a);

	// El servidor solo tiene texto cifrado: nada del título ni del contenido, ni de la clave de la nota.
	const stored = sql(`select payload || wrapped_key from notes`);
	expect(stored).toMatch(/^a1\./);
	expect(stored).not.toContain('servidor real');
	expect(stored).not.toContain('secreto');
	expect(sql(`select count(*) from users where email = '${EMAIL}'`)).toBe('1');
	expect(sql(`select count(*) from users where auth_key_hash::text like '%${PASSWORD}%'`)).toBe(
		'0'
	);

	// ── Dispositivo B: inicia sesión y descarga + descifra ──
	const ctxB = await browser.newContext();
	const b = await ctxB.newPage();
	await b.goto('/login');
	await b.locator('#email').fill(EMAIL);
	await b.locator('#password').fill(PASSWORD);
	await b.getByRole('button', { name: /Iniciar sesión/ }).click();
	await expect(b).toHaveURL(/\/notes$/, { timeout: 60_000 });
	await expect(b.getByText('Nota del servidor real').first()).toBeVisible({ timeout: 30_000 });

	// Una contraseña errónea es el mismo error de siempre y no revela nada.
	const wrong = await (await browser.newContext()).newPage();
	await wrong.goto('/login');
	await wrong.locator('#email').fill('nadie@correo.com');
	await wrong.locator('#password').fill('Cualquiera123!');
	await wrong.getByRole('button', { name: /Iniciar sesión/ }).click();
	await expect(wrong.getByText('Correo o contraseña incorrectos.')).toBeVisible();

	// ── Cambio en B que A recibe ──
	await b.getByText('Nota del servidor real').first().click();
	await b.locator('.ProseMirror').first().click();
	await b.keyboard.press('End');
	await b.keyboard.type(' (editado en B)');
	await expect(b.getByText(/Guardado/)).toBeVisible();
	await syncNow(b);
	await syncNow(a);
	await navigate(a, '/notes');
	await a.getByText('Nota del servidor real').first().click();
	await expect(a.locator('.ProseMirror').first()).toContainText('(editado en B)', {
		timeout: 20_000
	});

	// ── Enlace público: la clave va en el fragmento y el visitante lo lee sin sesión ──
	await a.getByRole('button', { name: 'Compartir' }).first().click();
	await a.getByRole('switch', { name: 'Cualquiera con el enlace puede ver' }).click();
	const linkBox = a.locator('output[title*="/n/"]').first();
	await expect(linkBox).toBeVisible({ timeout: 20_000 });
	const url = (await linkBox.getAttribute('title'))!;
	expect(url).toMatch(/\/n\/[A-Za-z0-9_-]{22}#k=/);
	const visitor = await (await browser.newContext()).newPage();
	await visitor.goto(url.replace(/^https?:\/\/[^/]+/, ''));
	await expect(visitor.getByText('Nota del servidor real')).toBeVisible({ timeout: 20_000 });
	await expect(visitor.getByText('(editado en B)')).toBeVisible();
	// El servidor tampoco ve el contenido de la copia pública.
	expect(sql(`select payload from share_links`)).not.toContain('secreto');

	// ── Quitar el dispositivo B desde A: B queda desconectado ──
	await navigate(a, '/settings/sync');
	await a
		.getByRole('button', { name: /Quitar/ })
		.first()
		.click();
	await expect(a.getByText('Dispositivo eliminado')).toBeVisible();
	await syncNow(b).catch(() => undefined);
	await expect(b).toHaveURL(/\/(welcome|login)$/, { timeout: 30_000 });
});
