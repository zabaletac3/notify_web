import { expect, test } from '@playwright/test';

test('importar notas desde archivos Markdown (título del «# …» o del nombre del archivo)', async ({
	page
}) => {
	await page.goto('/settings/storage');
	await expect(page.getByText('Importar notas').first()).toBeVisible();
	await page.locator('input[type="file"]').setInputFiles([
		{
			name: 'Receta de pan.md',
			mimeType: 'text/markdown',
			buffer: Buffer.from('# Pan casero\n\nHarina, agua y sal.\n')
		},
		{
			name: 'Ideas sueltas.md',
			mimeType: 'text/markdown',
			buffer: Buffer.from('Primera idea\n\n- segunda\n')
		}
	]);
	await expect(page.getByText('2 notas importadas')).toBeVisible();

	// Las notas importadas aparecen en la lista con su título y se pueden abrir.
	await page.goto('/notes');
	await expect(page.getByText('Pan casero').first()).toBeVisible();
	await expect(page.getByText('Ideas sueltas').first()).toBeVisible();
	await page.getByText('Pan casero').first().click();
	await expect(page.getByLabel('Título')).toHaveValue('Pan casero');
	await expect(page.getByLabel('Contenido de la nota')).toContainText('Harina, agua y sal.');
});
