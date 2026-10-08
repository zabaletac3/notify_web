import { describe, expect, it } from 'vitest';
import { LEGAL_DRAFT } from './meta.js';
import { privacy } from './privacy.js';
import { terms } from './terms.js';
import type { LegalDocument } from './types.js';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const documents: [string, LegalDocument][] = [
	['terms', terms],
	['privacy', privacy]
];

for (const [name, doc] of documents) {
	describe(`${name}`, () => {
		it('tiene versión y su estado es coherente con LEGAL_DRAFT', () => {
			expect(doc.version.trim()).not.toBe('');
			expect(doc.status).toBe(LEGAL_DRAFT ? 'borrador' : 'vigente');
		});

		it('tiene secciones con ids únicos en kebab-case y sin vacías', () => {
			expect(doc.sections.length).toBeGreaterThan(0);
			const ids = doc.sections.map((section) => section.id);
			expect(new Set(ids).size).toBe(ids.length);
			for (const section of doc.sections) {
				expect(section.id, section.title).toMatch(KEBAB);
				expect(section.title.trim()).not.toBe('');
				expect(section.blocks.length).toBeGreaterThan(0);
			}
		});

		it('no tiene bloques vacíos', () => {
			for (const section of doc.sections) {
				for (const block of section.blocks) {
					if ('p' in block) {
						expect(block.p.trim()).not.toBe('');
					} else if ('ul' in block) {
						expect(block.ul.length).toBeGreaterThan(0);
						for (const item of block.ul) expect(item.trim()).not.toBe('');
					} else {
						expect(block.callout.trim()).not.toBe('');
					}
				}
			}
		});
	});
}
