import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'src', 'lib', 'legal', 'licenses.json');

// `pnpm licenses list --prod --json` agrupa por licencia; aquí se aplana a [{ name, version, license }].
const raw = execSync('pnpm licenses list --prod --json', { cwd: root, encoding: 'utf-8' });
const grouped = JSON.parse(raw);

/** @type {Map<string, { name: string; version: string; license: string; homepage?: string }>} */
const byPackage = new Map();
for (const entries of Object.values(grouped)) {
	for (const entry of entries) {
		for (const version of entry.versions ?? []) {
			const key = `${entry.name}@${version}`;
			if (byPackage.has(key)) continue;
			byPackage.set(key, {
				name: entry.name,
				version,
				license: entry.license ?? 'Desconocida',
				...(entry.homepage ? { homepage: entry.homepage } : {})
			});
		}
	}
}

const licenses = [...byPackage.values()].sort(
	(a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)
);

writeFileSync(target, `${JSON.stringify(licenses, null, '\t')}\n`);
console.log(`Escritas ${licenses.length} licencias en ${path.relative(root, target)}`);
