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

const file = JSON.parse(
	readFileSync(join(process.cwd(), 'docs/api/vectors/markdown.json'), 'utf8')
) as { cases: MarkdownCase[] };

const manager = new MarkdownManager({ extensions: createMarkdownExtensions() });
const canonical = (input: string): string => manager.serialize(manager.parse(input) as JSONContent);

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
});
