import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AppIcon from './app-icon.svelte';
import { iconNames } from './icons.js';

describe('AppIcon', () => {
	it('es decorativo (aria-hidden) cuando no tiene etiqueta', async () => {
		const { container } = render(AppIcon, { name: 'search' });
		const svg = container.querySelector('svg');
		expect(svg).not.toBeNull();
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
	});

	it('expone su significado cuando se le da una etiqueta', async () => {
		render(AppIcon, { name: 'warning', label: 'Advertencia' });
		await expect.element(page.getByRole('img', { name: 'Advertencia' })).toBeInTheDocument();
	});

	it('dibuja con trazo 1.75', async () => {
		const { container } = render(AppIcon, { name: 'folder' });
		expect(container.querySelector('svg')?.getAttribute('stroke-width')).toBe('1.75');
	});

	it('todos los nombres del mapa renderizan un icono', () => {
		for (const name of iconNames) {
			const { container } = render(AppIcon, { name });
			expect(container.querySelector('svg'), name).not.toBeNull();
		}
	});
});
