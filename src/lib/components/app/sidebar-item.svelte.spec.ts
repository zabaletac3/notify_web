import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SidebarItem from './sidebar-item.svelte';

describe('SidebarItem', () => {
	it('abierto muestra la etiqueta y el contador', async () => {
		render(SidebarItem, { icon: 'folder', label: 'Universidad', count: 12 });
		await expect.element(page.getByText('Universidad')).toBeVisible();
		await expect.element(page.getByText('12')).toBeVisible();
	});

	it('recogido muestra solo el icono y mantiene el nombre accesible', async () => {
		render(SidebarItem, { icon: 'folder', label: 'Universidad', count: 12, collapsed: true });

		// El nombre accesible incluye etiqueta y contador aunque no se vean.
		await expect.element(page.getByRole('button', { name: 'Universidad, 12' })).toBeVisible();
		// La etiqueta y el contador siguen en el árbol, pero ocultos visualmente (sr-only), no display:none.
		await expect.element(page.getByText('Universidad')).toHaveClass(/sr-only/);
		await expect.element(page.getByText('12')).toHaveClass(/sr-only/);
	});

	it('recogido conserva aria-current en el elemento activo', async () => {
		render(SidebarItem, {
			icon: 'notes',
			label: 'Todas las notas',
			count: 3,
			selected: true,
			collapsed: true
		});
		await expect
			.element(page.getByRole('button', { name: 'Todas las notas, 3' }))
			.toHaveAttribute('aria-current', 'page');
	});

	it('recogido sigue disparando la acción', async () => {
		const onclick = vi.fn();
		render(SidebarItem, { icon: 'trash', label: 'Papelera', count: 0, collapsed: true, onclick });
		await page.getByRole('button', { name: 'Papelera, 0' }).click();
		expect(onclick).toHaveBeenCalledOnce();
	});
});
