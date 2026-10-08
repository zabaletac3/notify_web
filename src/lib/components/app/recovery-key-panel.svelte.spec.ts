import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RecoveryKeyPanel from './recovery-key-panel.svelte';

const KEY = 'XA92-KW7Q-9S0P-2619-ZRRE-NX96-BMDD-MWQJ-R2S7-FCV8-BJM3-DKRV-75W0-7';

describe('RecoveryKeyPanel', () => {
	it('muestra la clave y no deja continuar hasta confirmar que se guardó', async () => {
		const oncontinue = vi.fn();
		render(RecoveryKeyPanel, { recoveryKey: KEY, oncontinue });
		await expect.element(page.getByLabelText('Clave de recuperación')).toHaveTextContent(KEY);

		const next = page.getByRole('button', { name: 'Continuar' });
		await expect.element(next).toBeDisabled();
		await page.getByRole('checkbox', { name: 'La guardé en un lugar seguro.' }).click();
		await expect.element(next).toBeEnabled();
		await next.click();
		expect(oncontinue).toHaveBeenCalledOnce();
	});

	it('copia la clave y lo avisa también a lectores de pantalla', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
		render(RecoveryKeyPanel, { recoveryKey: KEY, oncontinue: () => {} });

		await page.getByRole('button', { name: 'Copiar' }).click();
		expect(writeText).toHaveBeenCalledWith(KEY);
		await expect.element(page.getByRole('button', { name: 'Copiada' })).toBeVisible();
		await expect.element(page.getByText('Clave copiada')).toBeInTheDocument();
	});

	it('permite usar otro texto en el botón final', async () => {
		render(RecoveryKeyPanel, {
			recoveryKey: KEY,
			continueLabel: 'Listo',
			oncontinue: () => {}
		});
		await expect.element(page.getByRole('button', { name: 'Listo' })).toBeVisible();
	});

	it('descarga un archivo con la clave y el correo de la cuenta', async () => {
		let blob: Blob | undefined;
		const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
			blob = b as Blob;
			return 'blob:prueba';
		});
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		render(RecoveryKeyPanel, { recoveryKey: KEY, email: 'ana@correo.com', oncontinue: () => {} });

		await page.getByRole('button', { name: 'Descargar' }).click();
		expect(create).toHaveBeenCalledOnce();
		const text = await blob!.text();
		expect(text).toContain(KEY);
		expect(text).toContain('ana@correo.com');
		expect(text).toContain('Nadie más la tiene');
		vi.restoreAllMocks();
	});
});
