import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { VECTORS_DIR, buildVectorFiles } from '#lib/data/crypto/vectors.js';

/**
 * Escribe los vectores de prueba compartidos en `docs/api/vectors` (ver el README de esa carpeta).
 * Es determinista: ejecutarlo dos veces seguidas no cambia ningún archivo. Se invoca con
 * `pnpm vectors:generate` (ver `scripts/generate-vectors.mjs`, que carga este módulo con Vite).
 */
export async function generateVectors(root = process.cwd()): Promise<string[]> {
	const dir = join(root, VECTORS_DIR);
	mkdirSync(dir, { recursive: true });
	const files = await buildVectorFiles();
	const written: string[] = [];
	for (const [name, content] of Object.entries(files)) {
		const path = join(dir, name);
		writeFileSync(path, content, 'utf8');
		written.push(path);
	}
	return written;
}

export async function main(): Promise<void> {
	const written = await generateVectors();
	console.log(`Vectores escritos en ${VECTORS_DIR}:`);
	for (const path of written) console.log(`  ${path}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
