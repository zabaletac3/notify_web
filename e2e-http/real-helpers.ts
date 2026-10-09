import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/** Ayudantes compartidos por las pruebas e2e contra la API real. */
export const PASSWORD = 'Secret123!';

/** Última línea del registro de la API con un correo "enviado" a esa persona (en dev el correo va al log). */
export async function mailFor(to: string, subject: string, timeoutMs = 15_000): Promise<string> {
	const until = Date.now() + timeoutMs;
	for (;;) {
		const lines = readFileSync('e2e-http/.api.log', 'utf8').split('\n').filter(Boolean).reverse();
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

/** Navega dentro de la app sin recargar (SvelteKit intercepta el clic; el cofre no se bloquea). */
export async function navigate(page: Page, href: string): Promise<void> {
	await page.evaluate((to) => {
		const link = document.createElement('a');
		link.href = to;
		document.body.appendChild(link);
		link.click();
		link.remove();
	}, href);
}

/** Registra una cuenta nueva por correo (código leído del correo) y deja la app desbloqueada en `/notes`. */
export async function register(page: Page, email: string, name: string): Promise<void> {
	await page.goto('/register');
	await page.locator('#fullName').fill(name);
	await page.locator('#email').fill(email);
	await page.locator('#password').fill(PASSWORD);
	await page.locator('#terms').click();
	await page.getByRole('button', { name: 'Crear cuenta' }).click();
	await expect(page).toHaveURL(/\/verify$/);
	const code = /\b(\d{6})\b/.exec(await mailFor(email, 'código de verificación'))?.[1];
	expect(code, 'el correo trae un código de 6 dígitos').toBeTruthy();
	await page.locator('input[autocomplete="one-time-code"]').first().focus();
	await page.keyboard.type(code!);
	await expect(page).toHaveURL(/\/recovery-key$/);
	await page.getByRole('checkbox', { name: 'La guardé en un lugar seguro.' }).click();
	await page.getByRole('button', { name: 'Continuar' }).click();
	await expect(page).toHaveURL(/\/onboarding$/);
	await navigate(page, '/notes');
	await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });
}

/** Cierra sesión desde Ajustes → Mi cuenta y espera a la bienvenida. */
export async function logoutToWelcome(page: Page, forgetTrust = false): Promise<void> {
	await navigate(page, '/settings/account');
	await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
	// La salida puede encadenar diálogos: cambios sin sincronizar y, con Google, confianza (T4). Se pulsan
	// en el DOM directamente para no depender de la acción de Playwright sobre un diálogo que se cierra solo.
	const deadline = Date.now() + 45_000;
	while (Date.now() < deadline && !/\/welcome$/.test(page.url())) {
		const acted = await page.evaluate((forget) => {
			const buttons = Array.from(document.querySelectorAll('button'));
			const text = (b: Element) => (b.textContent ?? '').trim();
			const sync = buttons.find((b) => text(b) === 'Sincronizar y salir');
			if (sync) {
				(sync as HTMLButtonElement).click();
				return 'sync';
			}
			const forgetButton = buttons.find((b) => text(b).includes('olvidar este dispositivo'));
			if (forgetButton) {
				if (forget) {
					(forgetButton as HTMLButtonElement).click();
					return 'forget';
				}
				const keep = buttons.find(
					(b) => text(b) === 'Cerrar sesión' && !!b.closest('[role="dialog"]')
				);
				if (keep) {
					(keep as HTMLButtonElement).click();
					return 'keep';
				}
			}
			return '';
		}, forgetTrust);
		if (!acted) await page.waitForTimeout(200);
	}
	await expect(page).toHaveURL(/\/welcome$/, { timeout: 30_000 });
}
