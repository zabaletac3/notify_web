// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	interface ImportMetaEnv {
		/** Origen de la API real; también fija `connect-src` de la CSP al construir. */
		readonly PUBLIC_API_URL?: string;
		/** `http` = API real; cualquier otro valor = datos simulados. */
		readonly PUBLIC_BACKEND?: string;
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
