import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AuthField from './auth-field.svelte';

describe('AuthField', () => {
	it('no muestra el botón de ojo en campos que no son contraseña', async () => {
		render(AuthField, { id: 'email', label: 'Correo', type: 'email', value: '' });
		await expect.element(page.getByRole('button', { name: /contraseña/i })).not.toBeInTheDocument();
	});

	it('alterna entre mostrar y ocultar sin perder el valor', async () => {
		render(AuthField, {
			id: 'password',
			label: 'Contraseña',
			type: 'password',
			value: 'Secret123!',
			autocomplete: 'current-password'
		});

		const input = page.getByLabelText('Contraseña', { exact: true });
		await expect.element(input).toHaveAttribute('type', 'password');

		const show = page.getByRole('button', { name: 'Mostrar contraseña' });
		await expect.element(show).toHaveAttribute('aria-pressed', 'false');
		await show.click();

		await expect.element(input).toHaveAttribute('type', 'text');
		await expect.element(input).toHaveAttribute('autocomplete', 'current-password');
		expect((await input.element()) as HTMLInputElement).toHaveProperty('value', 'Secret123!');

		const hide = page.getByRole('button', { name: 'Ocultar contraseña' });
		await expect.element(hide).toHaveAttribute('aria-pressed', 'true');
		await hide.click();
		await expect.element(input).toHaveAttribute('type', 'password');
	});
});
