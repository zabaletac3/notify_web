import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Harness from './dialog-actions.harness.svelte';

/** Ningún botón de la fila puede salirse del recuadro (regresión: «Cerrar sesión» se salía por la izquierda). */
async function expectInside() {
	const box = page.getByTestId('box').element().getBoundingClientRect();
	const buttons = Array.from(page.getByTestId('box').element().querySelectorAll('button'));
	expect(buttons.length).toBeGreaterThan(1);
	for (const b of buttons) {
		const r = b.getBoundingClientRect();
		expect(r.left, `${b.textContent} se sale por la izquierda`).toBeGreaterThanOrEqual(
			box.left - 0.5
		);
		expect(r.right, `${b.textContent} se sale por la derecha`).toBeLessThanOrEqual(box.right + 0.5);
	}
}

describe('Fila de botones de un diálogo', () => {
	for (const [name, width] of [
		['escritorio', 1280],
		['móvil', 390]
	] as const) {
		it(`cabe en el recuadro con textos largos (${name}, lado a lado con salto de línea)`, async () => {
			await page.viewport(width, 800);
			render(Harness, { stacked: false });
			await expectInside();
		});

		it(`apilada cabe en el recuadro con textos largos (${name})`, async () => {
			await page.viewport(width, 800);
			render(Harness, { stacked: true });
			await expectInside();
		});
	}
});
