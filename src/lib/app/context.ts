import { getContext, setContext } from 'svelte';
import type { App } from './create-app.svelte.js';

const KEY = Symbol('apunte.app');

/** Publica la app para todos los componentes descendientes (se llama en el layout raíz). */
export const setApp = (app: App): App => setContext(KEY, app);

/** Obtiene la app desde cualquier componente. */
export function getApp(): App {
	const app = getContext<App | undefined>(KEY);
	if (!app) throw new Error('getApp() se usó fuera de un componente dentro del layout raíz.');
	return app;
}
