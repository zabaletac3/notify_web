import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SettingRow from './setting-row.svelte';

describe('SettingRow', () => {
	it('renderiza un enlace cuando recibe href', async () => {
		render(SettingRow, { label: 'Términos de uso', chevron: true, href: '/terms' });
		await expect
			.element(page.getByRole('link', { name: 'Términos de uso' }))
			.toHaveAttribute('href', '/terms');
	});

	it('renderiza un botón cuando recibe onclick', async () => {
		const onclick = vi.fn();
		render(SettingRow, { label: 'Vaciar papelera', danger: true, onclick });
		await page.getByRole('button', { name: 'Vaciar papelera' }).click();
		expect(onclick).toHaveBeenCalledOnce();
	});
});
