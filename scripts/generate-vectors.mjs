// Carga `scripts/generate-vectors.ts` con el resolvedor de Vite (alias `#lib`, extensiones
// `.js` → `.ts`, `hash-wasm`) y ejecuta el generador. Así `pnpm vectors:generate` no necesita
// `tsx` ni ningún cargador de TypeScript adicional.
//
// Se añade el plugin de Svelte porque los vectores de comportamiento de sincronización importan
// `MockDatabase`, que a su vez importa un módulo con runas (`scenario.svelte.ts`).
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const server = await createServer({
	configFile: false,
	plugins: [svelte()],
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
