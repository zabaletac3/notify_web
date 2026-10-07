import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Checkbox } from './checkbox/index.js';
import { Switch } from './switch/index.js';

describe('Checkbox (redondo, como las tareas del diseño)', () => {
	it('alterna su estado con clic y con teclado', async () => {
		render(Checkbox, { 'aria-label': 'Repasar apuntes' });
		const box = page.getByRole('checkbox', { name: 'Repasar apuntes' });
		await expect.element(box).toHaveAttribute('aria-checked', 'false');
		await box.click();
		await expect.element(box).toHaveAttribute('aria-checked', 'true');
		await userEvent.keyboard(' ');
		await expect.element(box).toHaveAttribute('aria-checked', 'false');
	});

	it('es circular', async () => {
		render(Checkbox, { 'aria-label': 'Tarea' });
		const el = page.getByRole('checkbox', { name: 'Tarea' }).element();
		expect(getComputedStyle(el).borderRadius).not.toBe('0px');
		expect(el.getBoundingClientRect().width).toBe(el.getBoundingClientRect().height);
	});
});

describe('Switch', () => {
	it('alterna su estado', async () => {
		render(Switch, { 'aria-label': 'Sincronizar automáticamente' });
		const sw = page.getByRole('switch', { name: 'Sincronizar automáticamente' });
		await expect.element(sw).toHaveAttribute('aria-checked', 'false');
		await sw.click();
		await expect.element(sw).toHaveAttribute('aria-checked', 'true');
	});

	it('tiene el tamaño del diseño (44×26) y es visible apagado', async () => {
		render(Switch, { 'aria-label': 'Solo con Wi-Fi' });
		const el = page.getByRole('switch', { name: 'Solo con Wi-Fi' }).element();
		const r = el.getBoundingClientRect();
		expect([r.width, r.height]).toEqual([44, 26]);
		expect(getComputedStyle(el).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
	});
});
