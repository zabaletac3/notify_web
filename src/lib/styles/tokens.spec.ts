import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Contraste WCAG de los tokens (claro y oscuro).
 * Lee tokens.css directamente: si se cambia un color, esta prueba avisa si deja de ser legible.
 */
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8').replace(
	/\/\*[\s\S]*?\*\//g,
	''
);

function readBlock(selector: string): Record<string, string> {
	const match = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
	if (!match) throw new Error(`No se encontró el bloque ${selector} en tokens.css`);
	const vars: Record<string, string> = {};
	for (const m of match[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) vars[m[1]] = m[2];
	return vars;
}

const channel = (v: number) => {
	const c = v / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
	const n = parseInt(hex.slice(1), 16);
	return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
export const contrast = (a: string, b: string) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
};

/** [texto, fondo, mínimo, motivo]. 4.5 = texto normal AA · 3 = texto grande/decorativo. */
const pairs: [string, string, number][] = [
	['foreground', 'background', 4.5],
	['foreground', 'card', 4.5],
	['foreground', 'sidebar', 4.5],
	['muted-foreground', 'background', 4.5],
	['muted-foreground', 'card', 4.5],
	['primary-foreground', 'primary', 4.5],
	['primary', 'background', 4.5],
	['accent-foreground', 'accent', 4.5],
	['destructive', 'background', 4.5],
	['destructive', 'destructive-soft', 4.5],
	['primary-foreground', 'destructive', 4.5],
	['success', 'background', 4.5],
	// Colores de apoyo: etiquetas, placeholders. Mínimo 3 (no son el único portador del texto).
	['tertiary', 'background', 2.5],
	['tag-amber', 'background', 3],
	['tag-plum', 'background', 3]
];

describe.each([
	['claro', ':root'],
	['oscuro', '\\.dark']
])('contraste en modo %s', (_name, selector) => {
	const vars = readBlock(selector);

	it.each(pairs)('%s sobre %s ≥ %s', (fg, bg, min) => {
		expect(vars[fg], `falta --${fg}`).toBeDefined();
		expect(vars[bg], `falta --${bg}`).toBeDefined();
		expect(contrast(vars[fg], vars[bg])).toBeGreaterThanOrEqual(min);
	});
});
