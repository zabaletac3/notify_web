// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** Versión de la app (de package.json), inyectada por Vite (`define`). */
	const __APP_VERSION__: string;
	/** Build (nº de CI, SHA corto de git o «dev»), inyectada por Vite (`define`). */
	const __APP_BUILD__: string;

	interface ImportMetaEnv {
		/** Origen de la API real; también fija `connect-src` de la CSP al construir. */
		readonly PUBLIC_API_URL?: string;
		/** `http` = API real; cualquier otro valor = datos simulados. */
		readonly PUBLIC_BACKEND?: string;
		/** `cookie` (por defecto, web: refresh en cookie HttpOnly) o `body` (escritorio/móvil). */
		readonly PUBLIC_SESSION_MODE?: 'cookie' | 'body';
	}

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
