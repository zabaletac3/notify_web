// Carga `scripts/generate-vectors.ts` con el resolvedor de Vite (alias `#lib`, extensiones
// `.js` → `.ts`, `hash-wasm`) y ejecuta el generador. Así `pnpm vectors:generate` no necesita
// `tsx` ni ningún cargador de TypeScript adicional.
import { createServer } from 'vite';

const server = await createServer({
	configFile: false,
	server: { middlewareMode: true },
	appType: 'custom',
	logLevel: 'error'
});
try {
	const mod = await server.ssrLoadModule('/scripts/generate-vectors.ts');
	await mod.main();
} finally {
	await server.close();
}
