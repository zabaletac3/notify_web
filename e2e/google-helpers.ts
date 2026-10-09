import { type Page } from '@playwright/test';

/** Credenciales del usuario de ejemplo del simulador (ver `mock-database.ts`). */
export const DEMO_EMAIL = 'ana@correo.com';
export const DEMO_PASSWORD = 'Secret123!';

/**
 * Fija el escenario de Google del simulador antes de cargar la app. El panel de `/dev/simulator` no
 * existe en el build de producción que usa Playwright, así que se usa el mismo atajo que las pruebas
 * e2e (ver `data/mock/scenario.svelte.ts`).
 */
export function setGoogleScenario(
	page: Page,
	scenario: 'new' | 'unlinked' | 'linked' | 'with-mfa'
): Promise<void> {
	return page.addInitScript((s) => localStorage.setItem('apunte-google-scenario', s), scenario);
}

/** Pulsa el botón de Google y espera a la pantalla de retorno. */
export async function startGoogle(page: Page, label = 'Continuar con Google'): Promise<void> {
	await page.getByRole('button', { name: label }).click();
	await page.waitForURL('**/auth/google**');
}
