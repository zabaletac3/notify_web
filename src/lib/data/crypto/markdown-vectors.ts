import type { JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { createMarkdownExtensions } from '#lib/core/editor/extensions.js';
import { buildFolders, buildNotes } from '#lib/data/mock/fixtures/notes.js';

/**
 * Vectores de **Markdown** (`docs/api/vectors/markdown.json`).
 *
 * `canonical = serializar(analizar(input))` ejecutado con el mismo `MarkdownManager` (TipTap 3)
 * que arma el editor, pero **sin interfaz** (no hace falta DOM salvo para el HTML en línea, que en
 * ese caso se conserva como texto literal). Fija el formato exacto que comparten web y móvil.
 *
 * `supported` indica si el conjunto de bloques/marcas que el móvil edita cubre ese caso
 * (ver §8.1 del plan). Lo que no entra (`false`) se trata como bloque opaco y se conserva intacto.
 */

interface MarkdownCase {
	name: string;
	input: string;
	supported: boolean;
}

// Bloques y marcas que el móvil edita (y por tanto deben reproducir `canonical`).
const SUPPORTED_CASES: MarkdownCase[] = [
	{ name: 'parrafo', input: 'Hola, mundo.', supported: true },
	{ name: 'titulo-1', input: '# Título uno', supported: true },
	{ name: 'titulo-2', input: '## Título dos', supported: true },
	{ name: 'titulo-3', input: '### Título tres', supported: true },
	{ name: 'titulo-4', input: '#### Título cuatro', supported: true },
	{ name: 'titulo-5', input: '##### Título cinco', supported: true },
	{ name: 'titulo-6', input: '###### Título seis', supported: true },
	{ name: 'negrita', input: 'Texto en **negrita** y normal.', supported: true },
	{ name: 'cursiva', input: 'Texto en *cursiva* y normal.', supported: true },
	{ name: 'tachado', input: 'Texto ~~tachado~~ y normal.', supported: true },
	{ name: 'codigo-en-linea', input: 'Usa `const x = 1;` en línea.', supported: true },
	{ name: 'enlace', input: '[AxoNote](https://apunte.app)', supported: true },
	{
		name: 'enlace-con-titulo',
		input: '[AxoNote](https://apunte.app "La web")',
		supported: true
	},
	{ name: 'marcas-combinadas-negrita-cursiva', input: '**negrita *y cursiva***', supported: true },
	{ name: 'marcas-combinadas-tachado-negrita', input: '~~**todo a la vez**~~', supported: true },
	{ name: 'lista-vinetas', input: '- uno\n- dos\n- tres', supported: true },
	{ name: 'lista-numerada', input: '1. uno\n2. dos\n3. tres', supported: true },
	{ name: 'lista-numerada-no-empieza-en-1', input: '3. tres\n4. cuatro', supported: true },
	{ name: 'lista-tareas', input: '- [ ] pendiente\n- [x] hecha', supported: true },
	{ name: 'anidacion-3-niveles', input: '- uno\n  - uno.a\n    - uno.a.i', supported: true },
	{
		name: 'tareas-anidadas',
		input: '- [ ] tarea\n  - [x] subtarea\n    - [ ] sub-subtarea',
		supported: true
	},
	{ name: 'cita', input: '> Una cita célebre.', supported: true },
	{ name: 'bloque-de-codigo', input: '```\nconst a = 1;\n```', supported: true },
	{ name: 'bloque-de-codigo-con-lenguaje', input: '```js\nconst a = 1;\n```', supported: true },
	{
		name: 'bloque-de-codigo-con-comillas-dentro',
		input: '```\nconst saludo = `hola ${nombre}`;\n```',
		supported: true
	},
	{
		// Valla anidada (4 comillas rodeando 3): el serializador de TipTap no la reproduce de forma
		// idempotente, así que se trata como bloque opaco (ver docs/decisions.md).
		name: 'bloque-de-codigo-con-valla-anidada',
		input: '````\n```\nvalor entre comillas invertidas\n```\n````',
		supported: false
	},
	{ name: 'separador', input: 'antes\n\n---\n\ndespués', supported: true },
	{ name: 'salto-duro', input: 'línea uno  \nínea dos', supported: true },
	{
		name: 'escapes',
		input: '\\*no es lista\\* \\_no es cursiva\\_ \\# no es título \\[no es enlace\\] \\\\ \\< \\`',
		supported: true
	},
	{ name: 'nota-vacia', input: '', supported: true },
	{ name: 'solo-espacios', input: '   ', supported: true },
	{ name: 'emoji-y-no-latino', input: 'Café, ñandú 🙂 y 日本語 también.', supported: true },
	// Fuera del conjunto editable del móvil: bloque opaco (§8.5).
	{ name: 'html-en-linea', input: 'texto <em>enfatizado</em> y <br> salto', supported: false },
	{ name: 'tabla', input: '| a | b |\n| - | - |\n| 1 | 2 |', supported: false },
	{ name: 'imagen', input: '![alt](https://example.com/x.png)', supported: false }
];

/** Las notas escritas a mano de los datos de ejemplo, como casos. */
function fixtureCases(): MarkdownCase[] {
	const now = new Date('2026-01-02T03:04:05.000Z');
	const { byName } = buildFolders(now, 'normal');
	const notes = buildNotes(now, 'normal', byName);
	const seen = new Set<string>();
	const cases: MarkdownCase[] = [];
	for (const note of notes) {
		if (seen.has(note.content)) continue;
		seen.add(note.content);
		cases.push({ name: `fixture:${note.title}`, input: note.content, supported: true });
	}
	return cases;
}

export function buildMarkdownVector(): Record<string, unknown> {
	const manager = new MarkdownManager({ extensions: createMarkdownExtensions() });
	const canonical = (input: string): string =>
		manager.serialize(manager.parse(input) as JSONContent);

	const cases = [...SUPPORTED_CASES, ...fixtureCases()].map((c) => ({
		name: c.name,
		input: c.input,
		canonical: canonical(c.input),
		supported: c.supported
	}));

	return {
		version: 1,
		description:
			'Casos de Markdown de AxoNote. `canonical = serializar(analizar(input))` con el mismo ' +
			'`MarkdownManager` (TipTap 3) que usa el editor, sin interfaz. `supported` indica si el ' +
			'móvil edita ese caso o lo trata como bloque opaco (se conserva intacto).',
		cases
	};
}
