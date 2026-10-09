import tailwindcss from '@tailwindcss/vite';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon

// Versión de la app (package.json) y build (nº de CI, SHA corto de git o «dev»). Vite las inyecta
// como constantes globales (`__APP_VERSION__`, `__APP_BUILD__`); ver src/app.d.ts y src/lib/legal/version.ts.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
	version: string;
};
const appBuild = (() => {
	if (process.env.GITHUB_RUN_NUMBER) return process.env.GITHUB_RUN_NUMBER;
	try {
		return (
			execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
				.toString()
				.trim() || 'dev'
		);
	} catch {
		return 'dev';
	}
})();

/**
 * Política de seguridad de contenido (CSP). Las notas y sus claves viven en el navegador, así que
 * lo que pueda ejecutar código ajeno es el riesgo principal: nada de scripts de terceros ni inline
 * (SvelteKit añade solo los hashes de los suyos). Ver docs/architecture.md → «Seguridad».
 */
// Origen de la API: PUBLIC_API_URL en el momento de construir (si no, el de producción).
const apiOrigin = (mode: string): string => {
	const url = loadEnv(mode, process.cwd(), 'PUBLIC_').PUBLIC_API_URL;
	try {
		return url ? new URL(url).origin : 'https://api.apunte.app';
	} catch {
		return 'https://api.apunte.app';
	}
};
type CspDirectives = NonNullable<
	NonNullable<NonNullable<Parameters<typeof sveltekit>[0]>['csp']>['directives']
>;
type CspSource = NonNullable<CspDirectives['connect-src']>[number];
const cspDirectives = (dev: boolean, apiOrigin: string): CspDirectives => ({
	'default-src': ['self'],
	// `wasm-unsafe-eval`: Argon2id (hash-wasm) es WebAssembly. No permite `eval` de texto.
	'script-src': ['self', 'wasm-unsafe-eval'],
	// Hace falta `unsafe-inline`: Vite (en desarrollo) y las librerías de componentes (bits-ui, sonner)
	// crean elementos <style> al ejecutarse y no admiten nonce, y hay atributos `style=""` para
	// posicionar menús y diálogos. Es un riesgo bajo: una hoja de estilos no ejecuta código, y no hay
	// por dónde sacar datos (`img-src`, `font-src` y `connect-src` solo admiten el propio origen y la API).
	'style-src': ['self', 'unsafe-inline'],
	'img-src': ['self', 'data:', 'blob:'],
	'font-src': ['self', 'data:'],
	'connect-src': dev
		? ['self', apiOrigin as CspSource, 'ws:', 'http:']
		: ['self', apiOrigin as CspSource],
	'worker-src': ['self', 'blob:'],
	'base-uri': ['none'],
	'form-action': ['self'],
	'object-src': ['none'],
	// Solo vale como cabecera (los navegadores la ignoran en <meta>): ver src/hooks.server.ts.
	'frame-ancestors': ['none']
});

/**
 * Al arrancar `pnpm dev`, dice en la terminal a qué backend habla la web (simulado o la API real) y,
 * si es la API, si responde. Así se ve enseguida un `.env` sin `PUBLIC_BACKEND=http` o la API apagada.
 */
const backendBanner = (mode: string): Plugin => ({
	name: 'apunte-backend-banner',
	apply: 'serve',
	configureServer(server) {
		server.httpServer?.once('listening', async () => {
			const env = { ...loadEnv(mode, process.cwd(), 'PUBLIC_'), ...process.env };
			const log = server.config.logger;
			if (env.PUBLIC_BACKEND !== 'http' || !env.PUBLIC_API_URL) {
				log.info(
					'\n  Apunte → backend SIMULADO (sin API; el código de verificación es 123456).\n' +
						'  Para la API real: PUBLIC_BACKEND=http y PUBLIC_API_URL en .env, y reinicia.\n'
				);
				return;
			}
			const url = env.PUBLIC_API_URL.replace(/\/$/, '');
			try {
				const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
				log.info(`\n  Apunte → API real ${url} (health: ${res.status}).\n`);
			} catch {
				log.warn(`\n  Apunte → API real ${url}, pero NO responde. ¿Está corriendo \`make run\`?\n`);
			}
		});
	}
});

export default defineConfig(({ command, mode }) => ({
	// PUBLIC_* llegan al navegador (import.meta.env.PUBLIC_API_URL, PUBLIC_BACKEND); el resto no.
	envPrefix: ['VITE_', 'PUBLIC_'],
	// Constantes de versión disponibles en el código (y en Vitest, que hereda esta configuración).
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
		__APP_BUILD__: JSON.stringify(appBuild)
	},
	plugins: [
		backendBanner(mode),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Cloudflare Workers (con activos estáticos): ver wrangler.jsonc. Si se empaqueta como archivos
			// estáticos (Tauri), la parte `(app)` ya es SPA (`ssr = false`) y admite adapter-static.
			adapter: adapter(),
			csp: { mode: 'auto', directives: cspDirectives(command === 'serve', apiOrigin(mode)) }
		})
	],
	test: {
		expect: {
			requireAssertions: true
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright({
							// Opcional: usar un Chromium ya instalado (CHROMIUM_PATH=/ruta/al/chrome).
							launchOptions: {
								executablePath: process.env.CHROMIUM_PATH || undefined
							}
						}),
						instances: [
							{
								browser: 'chromium',
								headless: true
							}
						]
					},
					setupFiles: ['./src/lib/test/setup-client.ts'],
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				extends: true,
				plugins: [
					// The plugin will run tests for the stories defined in your Storybook config
					// See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
					storybookTest({
						configDir: path.join(import.meta.dirname, '.storybook')
					})
				],
				test: {
					name: 'storybook',
					browser: {
						enabled: true,
						headless: true,
						provider: playwright({
							launchOptions: {
								executablePath: process.env.CHROMIUM_PATH || undefined
							}
						}),
						instances: [
							{
								browser: 'chromium'
							}
						]
					}
				}
			}
		]
	}
}));
