<script lang="ts">
	import './layout.css';
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import { ModeWatcher, setMode } from 'mode-watcher';
	import { createApp, setApp } from '#lib/app/index.js';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	/** Aplica el tamaño del texto y lo recuerda para pintarlo bien desde el primer momento. */
	function applyTextSize(size: string) {
		document.documentElement.dataset.textSize = size;
		try {
			localStorage.setItem('apunte-text-size', size);
		} catch {
			// Sin almacenamiento: se aplica igual, pero no se recuerda para la próxima carga.
		}
	}

	// PUBLIC_BACKEND=http usa la API real (PUBLIC_API_URL); por defecto, el simulador.
	const api =
		import.meta.env.PUBLIC_BACKEND === 'http' && import.meta.env.PUBLIC_API_URL
			? { baseUrl: import.meta.env.PUBLIC_API_URL }
			: undefined;
	if (import.meta.env.DEV && typeof window !== 'undefined')
		console.info(
			api ? `AxoNote: API real ${api.baseUrl}` : 'AxoNote: backend simulado (código 123456)'
		);

	// Estado global de la app. En desarrollo se simula una pequeña latencia para ver los estados de carga.
	const app = setApp(
		createApp({
			persistence: 'indexeddb',
			api,
			autoLock: true,
			latencyMs: import.meta.env.DEV ? 250 : 0
		})
	);

	// Los ajustes guardados mandan sobre el tema y el orden de las notas.
	$effect(() => {
		if (app.settings.status !== 'ready') return;
		const { theme, noteOrder, textSize } = app.settings.values;
		untrack(() => {
			setMode(theme);
			app.notes.sort = noteOrder;
			applyTextSize(textSize);
		});
	});

	// Con la app bloqueada, las pantallas de notas y ajustes piden la contraseña antes.
	$effect(() => {
		const path = page.url.pathname;
		if (app.auth.isLocked && (path.startsWith('/notes') || path.startsWith('/settings')))
			void goto('/unlock');
	});

	// Sesión cerrada sin que la persona lo pidiera (dispositivo revocado, otra pestaña): a iniciar sesión,
	// estén donde estén (notas o ajustes).
	$effect(() => {
		const path = page.url.pathname;
		if (app.auth.notice && (path.startsWith('/notes') || path.startsWith('/settings')))
			void goto('/login');
	});

	onMount(() => {
		void app.bootstrap();
		return () => app.destroy();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>AxoNote</title>
</svelte:head>

<!-- El script del tema va en `static/theme-init.js` (la CSP no admite scripts en línea). -->
<ModeWatcher disableHeadScriptInjection />

{@render children()}

<Toaster />
