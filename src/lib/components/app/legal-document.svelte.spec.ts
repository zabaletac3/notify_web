import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import LegalDocumentView from './legal-document.svelte';
import type { LegalDocument } from '#lib/legal/types.js';

const base: LegalDocument = {
	title: 'Documento de prueba',
	version: 'v1',
	effectiveDate: null,
	status: 'borrador',
	intro: 'Introducción.',
	sections: [
		{ id: 'uno', title: '1. Uno', blocks: [{ p: 'Texto normal.' }] },
		{ id: 'dos', title: '2. Dos', blocks: [{ p: 'Pendiente [[REVISAR: algo]] y más.' }] }
	]
};

describe('LegalDocumentView', () => {
	it('muestra el título, la versión y la fecha de vigencia', async () => {
		render(LegalDocumentView, { doc: base });
		await expect
			.element(page.getByRole('heading', { level: 1 }))
			.toHaveTextContent('Documento de prueba');
		await expect
			.element(page.getByText('Versión v1 · Fecha de vigencia por definir'))
			.toBeVisible();
	});

	it('avisa de que es borrador y resalta los pendientes [[REVISAR]]', async () => {
		const { container } = render(LegalDocumentView, { doc: base });
		await expect.element(page.getByText('Borrador pendiente de revisión legal')).toBeVisible();
		expect(container.querySelector('mark')?.textContent).toBe('[[REVISAR: algo]]');
	});

	it('el índice enlaza con el ancla de cada sección', async () => {
		render(LegalDocumentView, { doc: base });
		await expect
			.element(page.getByRole('link', { name: '1. Uno' }))
			.toHaveAttribute('href', '#uno');
		await expect
			.element(page.getByRole('link', { name: '2. Dos' }))
			.toHaveAttribute('href', '#dos');
	});

	it('sin borrador no avisa ni resalta, y muestra la fecha', async () => {
		const { container } = render(LegalDocumentView, {
			doc: { ...base, status: 'vigente', effectiveDate: '2026-01-01' }
		});
		await expect
			.element(page.getByText('Borrador pendiente de revisión legal'))
			.not.toBeInTheDocument();
		expect(container.querySelector('mark')).toBeNull();
		await expect.element(page.getByText('Vigente desde 2026-01-01')).toBeVisible();
	});
});
