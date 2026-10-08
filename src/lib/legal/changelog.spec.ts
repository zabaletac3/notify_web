import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { changelog } from './changelog.js';
import { APP_VERSION } from './version.js';

const pkg = JSON.parse(
	readFileSync(new URL('../../../package.json', import.meta.url), 'utf-8')
) as {
	version: string;
};

describe('changelog', () => {
	it('su primera entrada usa la versión de package.json', () => {
		expect(APP_VERSION).toBe(pkg.version);
		expect(changelog[0]?.version).toBe(APP_VERSION);
	});

	it('está ordenado de más nuevo a más viejo', () => {
		expect(changelog.length).toBeGreaterThan(0);
		for (let i = 1; i < changelog.length; i++) {
			expect(new Date(changelog[i - 1].date).getTime()).toBeGreaterThanOrEqual(
				new Date(changelog[i].date).getTime()
			);
		}
	});

	it('cada entrada tiene fecha ISO válida y cambios', () => {
		expect(changelog.length).toBeGreaterThan(0);
		for (const entry of changelog) {
			expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(Number.isNaN(new Date(entry.date).getTime())).toBe(false);
			expect(entry.changes.length).toBeGreaterThan(0);
			for (const change of entry.changes) expect(change.trim()).not.toBe('');
		}
	});
});
