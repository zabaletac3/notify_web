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

const LONG_DOCUMENT = [
	'# Título principal',
	'',
	'Un párrafo con **negrita**, *cursiva*, ~~tachado~~, ++subrayado++, `código` y un ' +
		'[enlace](https://apunte.app "título").',
	'',
	'## Subtítulo',
	'',
	'- viñeta uno',
	'- viñeta dos',
	'  - anidada',
	'',
	'1. numerada uno',
	'2. numerada dos',
	'',
	'- [ ] tarea pendiente',
	'- [x] tarea hecha',
	'  - [ ] subtarea',
	'',
	'> Una cita con **negrita**.',
	'',
	'```js',
	"const saludo = 'hola';",
	'```',
	'',
	'---',
	'',
	'Línea con salto duro  ',
	'siguiente línea.'
].join('\n');

/**
 * Casos de lectura adicionales (fase 1b, punto 2): normalizaciones de `§8.1`, autolinks, entidades,
 * nota al pie, HTML de bloque, imagen en línea, tabla seguida de texto y un documento largo.
 *
 * `supported: false` en `sangria-de-4-espacios` y `sangria-con-tabulador`: la sangría de más de 2
 * espacios (o un tabulador) en la continuación de un elemento de lista se recorta a 2 al releer, y
 * el resultado no es idempotente (ver `docs/api/decisions.md`).
 */
const READING_CASES: MarkdownCase[] = [
	{ name: 'vineta-con-asterisco', input: '* uno\n* dos', supported: true },
	{ name: 'vineta-con-mas', input: '+ uno\n+ dos', supported: true },
	{ name: 'cursiva-con-guion-bajo', input: '_cursiva_', supported: true },
	{ name: 'negrita-con-guion-bajo', input: '__negrita__', supported: true },
	{ name: 'titulo-con-subrayado-1', input: 'Título\n======', supported: true },
	{ name: 'titulo-con-subrayado-2', input: 'Título\n------', supported: true },
	{ name: 'sangria-de-4-espacios', input: '- uno\n    continua', supported: false },
	{ name: 'sangria-con-tabulador', input: '- uno\n\tcontinua', supported: false },
	{ name: 'numerada-con-parentesis', input: '1) uno\n2) dos', supported: true },
	{ name: 'separador-con-asteriscos', input: '***', supported: true },
	{ name: 'separador-con-guion-bajo', input: '___', supported: true },
	{ name: 'salto-de-linea-crlf', input: 'a\r\nb', supported: true },
	{ name: 'salto-final-eliminado', input: 'a\n', supported: true },
	{ name: 'url-suelta', input: 'https://apunte.app', supported: true },
	{ name: 'salto-duro-con-backslash', input: 'linea uno\\\nlinea dos', supported: true },
	{ name: 'autolink', input: '<https://apunte.app>', supported: true },
	{ name: 'entidad-copy', input: '&copy; 2026', supported: true },
	{ name: 'entidad-nbsp', input: 'a&nbsp;b', supported: true },
	// Deformada: no hay bloque de nota al pie; queda como dos párrafos con los corchetes escapados.
	{ name: 'nota-al-pie', input: 'Texto[^1]\n\n[^1]: Nota al pie.', supported: false },
	{ name: 'html-de-bloque', input: '<div>\n<p>hola</p>\n</div>', supported: false },
	{
		name: 'imagen-en-linea',
		input: 'texto ![alt](https://example.com/x.png) texto',
		supported: false
	},
	{
		name: 'tabla-seguida-de-texto',
		input: '| a | b |\n| - | - |\n| 1 | 2 |\n\nDespués de la tabla.',
		supported: false
	},
	{ name: 'documento-largo', input: LONG_DOCUMENT, supported: true }
];

// ── markdown.json, sentido documento → Markdown (fase 1b, punto 1) ────────────────────────────
/**
 * Construye documentos TipTap a mano (igual que haría el editor) para fijar lo que emite el
 * serializador sobre un documento ya editado, no solo sobre lo mínimo que produce `analizar(input)`.
 * `reparses` compara estructuralmente `analizar(markdown)` con `doc` (orden de claves aparte).
 */
type Mark = { type: string; attrs?: Record<string, unknown> };
const mk = (type: string, attrs?: Record<string, unknown>): Mark =>
	attrs ? { type, attrs } : { type };
const txt = (value: string, marks?: Mark[]): JSONContent =>
	marks && marks.length > 0 ? { type: 'text', text: value, marks } : { type: 'text', text: value };
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });
const para = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const emptyPara = (): JSONContent => ({ type: 'paragraph', content: [] });
const heading = (level: number, ...content: JSONContent[]): JSONContent => ({
	type: 'heading',
	attrs: { level },
	content
});
const bulletList = (...items: JSONContent[]): JSONContent => ({
	type: 'bulletList',
	content: items
});
const orderedList = (start: number, ...items: JSONContent[]): JSONContent => ({
	type: 'orderedList',
	attrs: { start },
	content: items
});
const listItem = (...content: JSONContent[]): JSONContent => ({ type: 'listItem', content });
const taskList = (...items: JSONContent[]): JSONContent => ({ type: 'taskList', content: items });
const taskItem = (checked: boolean, ...content: JSONContent[]): JSONContent => ({
	type: 'taskItem',
	attrs: { checked },
	content
});
const quote = (...content: JSONContent[]): JSONContent => ({ type: 'blockquote', content });
const codeBlock = (language: string | null, code: string): JSONContent => ({
	type: 'codeBlock',
	attrs: { language },
	content: code ? [{ type: 'text', text: code }] : []
});
const hardBreak = (): JSONContent => ({ type: 'hardBreak' });
/** El enlace solo guarda `href` y `title`: es lo único que repone `analizar()` al releer. */
const link = (href: string, title: string | null = null): Mark => mk('link', { href, title });

/**
 * Orden en el que `analizar()` deja las marcas de un mismo texto (de fuera a dentro):
 * `underline`, `strike`, `bold`, `italic` y, por último, `link` (envuelve a las demás). Un documento
 * con otro orden sigue serializando igual (el orden de apertura lo decide el rango de la extensión,
 * no el array), pero no vuelve a dar el mismo `doc` al releer.
 */
const STYLE_MARKS = ['underline', 'strike', 'bold', 'italic'] as const;
const MARK_LABEL: Record<string, string> = {
	bold: 'negrita',
	italic: 'cursiva',
	strike: 'tachado',
	underline: 'subrayado',
	code: 'codigo-en-linea'
};

const LITERAL_CHARS: { name: string; char: string }[] = [
	{ name: 'asterisco', char: '*' },
	{ name: 'guion-bajo', char: '_' },
	{ name: 'backtick', char: '`' },
	{ name: 'corchete-abre', char: '[' },
	{ name: 'corchete-cierra', char: ']' },
	{ name: 'tilde', char: '~' },
	{ name: 'backslash', char: '\\' },
	{ name: 'menor-que', char: '<' },
	{ name: 'mayor-que', char: '>' },
	{ name: 'ampersand', char: '&' }
];

const LINE_START_TEXTS: { name: string; text: string }[] = [
	{ name: 'almohadilla', text: '# no titulo' },
	{ name: 'guion', text: '- no lista' },
	{ name: 'numero-punto', text: '1. no numerada' },
	{ name: 'mayor-que', text: '> no cita' },
	{ name: 'checkbox', text: '[ ] no tarea' },
	{ name: 'guiones-triples', text: '--- no separador' },
	{ name: 'tres-backticks', text: '``` no codigo' }
];

function buildSerializeDocs(): { name: string; doc: JSONContent }[] {
	const cases: { name: string; doc: JSONContent }[] = [
		{
			name: 'parrafo-vacio-entre-dos-parrafos',
			doc: doc(para(txt('a')), emptyPara(), para(txt('b')))
		},
		{
			name: 'dos-parrafos-vacios-seguidos',
			doc: doc(para(txt('a')), emptyPara(), emptyPara(), para(txt('b')))
		},
		{ name: 'parrafo-vacio-al-final', doc: doc(para(txt('a')), emptyPara()) },
		{ name: 'parrafo-vacio-al-inicio', doc: doc(emptyPara(), para(txt('a'))) },
		{ name: 'espacios-al-inicio-y-al-final', doc: doc(para(txt('  hola  '))) },
		{
			name: 'salto-duro-simple',
			doc: doc(para(txt('línea uno'), hardBreak(), txt('línea dos')))
		},
		{ name: 'salto-duro-doble', doc: doc(para(txt('a'), hardBreak(), hardBreak(), txt('b'))) },
		{
			name: 'marca-con-espacio-final',
			doc: doc(para(txt('hola ', [mk('bold')]), txt('mundo')))
		},
		{ name: 'codigo-con-comillas-dentro', doc: doc(para(txt('a `b` c', [mk('code')]))) },
		{ name: 'enlace-simple', doc: doc(para(txt('AxoNote', [link('https://apunte.app')]))) },
		{
			name: 'enlace-con-titulo',
			doc: doc(para(txt('AxoNote', [link('https://apunte.app', 'La web')])))
		},
		{
			name: 'enlace-con-marcas',
			doc: doc(para(txt('AxoNote', [link('https://apunte.app'), mk('bold')])))
		},
		{ name: 'elemento-vinieta-vacio', doc: doc(bulletList(listItem(emptyPara()))) },
		{ name: 'elemento-tarea-vacio', doc: doc(taskList(taskItem(false, emptyPara()))) },
		{ name: 'titulo-vacio', doc: doc(heading(2)) },
		{ name: 'bloque-codigo-vacio', doc: doc(codeBlock(null, '')) },
		{
			name: 'vinietas-contiguas',
			doc: doc(bulletList(listItem(para(txt('a')))), bulletList(listItem(para(txt('b')))))
		},
		{
			name: 'vinietas-y-tareas-contiguas',
			doc: doc(bulletList(listItem(para(txt('a')))), taskList(taskItem(false, para(txt('b')))))
		},
		{
			name: 'numerada-y-vinietas-contiguas',
			doc: doc(orderedList(1, listItem(para(txt('a')))), bulletList(listItem(para(txt('b')))))
		},
		{
			name: 'elemento-con-dos-parrafos',
			doc: doc(bulletList(listItem(para(txt('uno')), para(txt('dos')))))
		},
		{
			name: 'elemento-con-bloque-de-codigo',
			doc: doc(bulletList(listItem(para(txt('uno')), codeBlock(null, 'x = 1'))))
		},
		{
			name: 'elemento-con-cita',
			doc: doc(bulletList(listItem(para(txt('uno')), quote(para(txt('cita'))))))
		},
		{ name: 'cita-con-lista', doc: doc(quote(bulletList(listItem(para(txt('uno')))))) },
		{ name: 'cita-con-varios-parrafos', doc: doc(quote(para(txt('uno')), para(txt('dos')))) },
		{
			name: 'numerada-dentro-de-vinietas',
			doc: doc(bulletList(listItem(para(txt('a')), orderedList(1, listItem(para(txt('a.1')))))))
		},
		{
			name: 'vinietas-dentro-de-numerada',
			doc: doc(orderedList(1, listItem(para(txt('a')), bulletList(listItem(para(txt('a.1')))))))
		},
		{
			name: 'tareas-3-niveles-mezcladas',
			doc: doc(
				taskList(
					taskItem(
						true,
						para(txt('uno')),
						taskList(
							taskItem(false, para(txt('uno.a')), taskList(taskItem(true, para(txt('uno.a.i')))))
						)
					)
				)
			)
		},
		{
			name: 'titulo-con-marcas',
			doc: doc(heading(2, txt('hola '), txt('mundo', [mk('bold')])))
		},
		{ name: 'bloque-codigo-con-lineas-en-blanco', doc: doc(codeBlock('js', 'a\n\nb')) },
		{ name: 'bloque-codigo-con-salto-final', doc: doc(codeBlock('js', 'a\n')) }
	];

	for (const { name, char } of LITERAL_CHARS) {
		cases.push({ name: `literal-${name}`, doc: doc(para(txt(`a${char}b`))) });
	}
	for (const { name, text } of LINE_START_TEXTS) {
		cases.push({ name: `inicio-de-linea-${name}`, doc: doc(para(txt(text))) });
	}
	for (const type of [...STYLE_MARKS, 'code']) {
		cases.push({
			name: `marca-${MARK_LABEL[type]}`,
			doc: doc(para(txt('texto'), txt('marcado', [mk(type)]), txt('final')))
		});
	}
	for (const a of STYLE_MARKS) {
		for (const b of STYLE_MARKS) {
			if (a === b) continue;
			cases.push({
				name: `combinadas-${MARK_LABEL[a]}-${MARK_LABEL[b]}`,
				doc: doc(para(txt('x', [mk(a), mk(b)])))
			});
		}
	}

	return cases;
}

/** Igualdad estructural de JSON (ignora el orden de las claves; el de los arrays sí importa). */
function sameJsonContent(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b)) return false;
		return a.length === b.length && a.every((v, i) => sameJsonContent(v, b[i]));
	}
	if (a && b && typeof a === 'object' && typeof b === 'object') {
		const keysOf = (v: object) =>
			Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined);
		const ak = keysOf(a);
		const bk = keysOf(b);
		if (ak.length !== bk.length) return false;
		return ak.every((k) =>
			sameJsonContent((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
		);
	}
	return false;
}

export function buildMarkdownVector(): Record<string, unknown> {
	const manager = new MarkdownManager({ extensions: createMarkdownExtensions() });
	const canonical = (input: string): string =>
		manager.serialize(manager.parse(input) as JSONContent);

	const cases = [...SUPPORTED_CASES, ...READING_CASES, ...fixtureCases()].map((c) => ({
		name: c.name,
		input: c.input,
		canonical: canonical(c.input),
		supported: c.supported
	}));

	const serialize = buildSerializeDocs().map(({ name, doc: d }) => {
		const markdown = manager.serialize(d);
		const reparses = sameJsonContent(manager.parse(markdown), d);
		return { name, doc: d, markdown, reparses };
	});

	return {
		version: 1,
		description:
			'Casos de Markdown de AxoNote. `canonical = serializar(analizar(input))` con el mismo ' +
			'`MarkdownManager` (TipTap 3) que usa el editor, sin interfaz. `supported` indica si el ' +
			'móvil edita ese caso o lo trata como bloque opaco (se conserva intacto). `serialize` fija, ' +
			'al revés, lo que emite el serializador sobre un documento ya editado (`doc`, JSON de ' +
			'TipTap): `markdown = serializar(doc)` y `reparses` indica si `analizar(markdown)` vuelve a ' +
			'dar `doc`.',
		cases,
		serialize
	};
}
