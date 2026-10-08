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

/** Registra una cuenta nueva en `page` (código leído del correo) y devuelve la clave de recuperación. */
async function register(page: Page, email: string, name: string): Promise<string> {
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
	const key = (await page.getByLabel('Clave de recuperación').innerText()).trim();
	await page.getByRole('checkbox', { name: 'La guardé en un lugar seguro.' }).click();
	await page.getByRole('button', { name: 'Continuar' }).click();
	await expect(page).toHaveURL(/\/onboarding$/);
	return key;
}

async function login(page: Page, email: string, password = PASSWORD) {
	await page.goto('/login');
	await page.locator('#email').fill(email);
	await page.locator('#password').fill(password);
	await page.getByRole('button', { name: /Iniciar sesión/ }).click();
	await expect(page).toHaveURL(/\/notes$/, { timeout: 60_000 });
}

async function newNote(page: Page, title: string, text: string) {
	await navigate(page, '/notes');
	await page.getByRole('button', { name: 'Nueva nota' }).first().click();
	await page.getByLabel('Título').fill(title);
	await page.locator('.ProseMirror').first().click();
	await page.keyboard.type(text);
	await expect(page.getByText(/Guardado/)).toBeVisible();
}

test('conflicto: la misma nota editada en dos dispositivos, resuelto con «Conservar ambas»', async ({
	browser
}) => {
	test.setTimeout(240_000);
	const ctxA = await browser.newContext();
	const a = await ctxA.newPage();
	await register(a, 'conflicto@correo.com', 'Eva Conflicto');
	await newNote(a, 'Nota compartida', 'Texto base');
	await syncNow(a);

	const ctxB = await browser.newContext();
	const b = await ctxB.newPage();
	await login(b, 'conflicto@correo.com');
	await expect(b.getByText('Nota compartida').first()).toBeVisible({ timeout: 30_000 });

	// B se queda sin red y edita; A edita y sube su versión primero.
	await ctxB.setOffline(true);
	await b.getByText('Nota compartida').first().click();
	await b.locator('.ProseMirror').first().click();
	await b.keyboard.press('End');
	await b.keyboard.type(' — versión de B');
	await expect(b.getByText(/Guardado/)).toBeVisible();

	await navigate(a, '/notes');
	await a.getByText('Nota compartida').first().click();
	await a.locator('.ProseMirror').first().click();
	await a.keyboard.press('End');
	await a.keyboard.type(' — versión de A');
	await expect(a.getByText(/Guardado/)).toBeVisible();
	await syncNow(a);

	// B vuelve a tener red: su edición parte de una revisión vieja → el servidor la rechaza como conflicto.
	await ctxB.setOffline(false);
	await syncNow(b);
	await navigate(b, '/notes');
	const dialog = b.getByRole('dialog', { name: 'Conflicto de sincronización' });
	await expect(dialog).toBeVisible({ timeout: 20_000 });
	await expect(dialog).toContainText('versión de A');
	await expect(dialog).toContainText('versión de B');
	await dialog.getByRole('button', { name: 'Conservar ambas' }).click();
	await expect(dialog).toBeHidden();

	// Ninguna edición se pierde: la nota original y la copia con la otra versión.
	await syncNow(b);
	await navigate(b, '/notes');
	await expect(b.getByText('Nota compartida')).toHaveCount(2, { timeout: 20_000 });
	await syncNow(a);
	await navigate(a, '/notes');
	await expect(a.getByText('Nota compartida')).toHaveCount(2, { timeout: 20_000 });
});

test('recuperación: restablecer la contraseña con la clave de recuperación conserva las notas', async ({
	browser
}) => {
	test.setTimeout(240_000);
	const email = 'recupera@correo.com';
	const NEW_PASSWORD = 'Nueva456!x';
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	const recoveryKey = await register(page, email, 'Rita Recupera');
	await newNote(page, 'Nota que sobrevive', 'Contenido que sigue cifrado');
	await syncNow(page);

	await navigate(page, '/settings/account');
	await page.getByText('Cerrar sesión').first().click();
	const syncAndExit = page.getByRole('button', { name: 'Sincronizar y salir' });
	if (await syncAndExit.isVisible({ timeout: 1500 }).catch(() => false)) await syncAndExit.click();
	await expect(page).toHaveURL(/\/welcome$/);

	// El enlace llega por correo (en dev, al registro de la API) y trae un token de un solo uso.
	await navigate(page, '/forgot-password');
	await page.locator('#email').fill(email);
	await page.getByRole('button', { name: 'Enviar enlace' }).click();
	const text = await mailFor(email, 'Restablece tu contraseña');
	const token = /reset-password\?token=([\w-]+)/.exec(text)?.[1];
	expect(token, 'el correo trae el enlace con token').toBeTruthy();
	await navigate(page, `/reset-password?token=${token}`);

	// Una clave equivocada no restablece nada; la correcta sí y no pierde las notas.
	await page.locator('#recovery-key').fill('AAAA-BBBB-CCCC');
	await page.locator('#password').fill(NEW_PASSWORD);
	await page.locator('#confirmation').fill(NEW_PASSWORD);
	await page.getByRole('button', { name: 'Guardar contraseña' }).click();
	await expect(page.getByText('La clave de recuperación no es correcta.')).toBeVisible();
	await page.locator('#recovery-key').fill(recoveryKey);
	await page.getByRole('button', { name: 'Guardar contraseña' }).click();
	await expect(page).toHaveURL(/\/login$/);

	// La contraseña vieja ya no sirve (el servidor la rechaza); la nueva abre la cuenta con las notas.
	await page.locator('#email').fill(email);
	await page.locator('#password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Iniciar sesión' }).click();
	await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible();
	await login(page, email, NEW_PASSWORD);
	await expect(page.getByText('Nota que sobrevive').first()).toBeVisible({ timeout: 30_000 });
	// El texto sigue cifrado en el servidor.
	expect(sql(`select count(*) from notes where payload like '%sobrevive%'`)).toBe('0');
});
