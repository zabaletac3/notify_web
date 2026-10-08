import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface LicenseEntry {
	name: string;
	version: string;
	license: string;
	homepage?: string;
}

const licenses = JSON.parse(
	readFileSync(new URL('./licenses.json', import.meta.url), 'utf-8')
) as LicenseEntry[];
const pkg = JSON.parse(
	readFileSync(new URL('../../../package.json', import.meta.url), 'utf-8')
) as {
	dependencies: Record<string, string>;
};

describe('licenses.json', () => {
	it('no está vacío y cada entrada tiene nombre, versión y licencia', () => {
		expect(licenses.length).toBeGreaterThan(0);
		for (const entry of licenses) {
			expect(entry.name.trim()).not.toBe('');
			expect(entry.version.trim()).not.toBe('');
			expect(entry.license.trim()).not.toBe('');
		}
	});

	it('incluye todas las dependencias directas de package.json', () => {
		const names = new Set(licenses.map((entry) => entry.name));
		for (const dependency of Object.keys(pkg.dependencies)) {
			expect(names.has(dependency), dependency).toBe(true);
		}
	});

	it('está ordenado por nombre', () => {
		const names = licenses.map((entry) => entry.name);
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
	});
});
