import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { createMarkdownExtensions } from '#lib/core/editor/extensions.js';

interface MarkdownCase {
	name: string;
	input: string;
	canonical: string;
	supported: boolean;
}

interface SerializeCase {
	name: string;
	doc: JSONContent;
	markdown: string;
	reparses: boolean;
}

const file = JSON.parse(
	readFileSync(join(process.cwd(), 'docs/api/vectors/markdown.json'), 'utf8')
) as { cases: MarkdownCase[]; serialize: SerializeCase[] };

const manager = new MarkdownManager({ extensions: createMarkdownExtensions() });
const canonical = (input: string): string => manager.serialize(manager.parse(input) as JSONContent);

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

describe('markdown.json', () => {
	it('cada caso coincide con serializar(analizar(input))', () => {
		for (const c of file.cases) {
			expect(canonical(c.input), c.name).toBe(c.canonical);
		}
	});

	it('canonical es idempotente en los casos supported', () => {
		for (const c of file.cases.filter((c) => c.supported)) {
			expect(canonical(c.canonical), c.name).toBe(c.canonical);
		}
	});

	it('cada caso de `serialize` coincide con serializar(doc)', () => {
		for (const c of file.serialize) {
			expect(manager.serialize(c.doc), c.name).toBe(c.markdown);
		}
	});

	it('`reparses` refleja si analizar(markdown) vuelve a dar doc', () => {
		for (const c of file.serialize) {
			expect(sameJsonContent(manager.parse(c.markdown), c.doc), c.name).toBe(c.reparses);
		}
	});
});
