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

	// Estado global de la app. En desarrollo se simula una pequeña latencia para ver los estados de carga.
	const app = setApp(
		createApp({
			persistence: 'indexeddb',
			autoLock: true,
			latencyMs: import.meta.env.DEV ? 250 : 0
		})
	);

	// Los ajustes guardados mandan sobre el tema y el orden de las notas.
	$effect(() => {
		if (app.settings.status !== 'ready') return;
		const { theme, noteOrder } = app.settings.values;
		untrack(() => {
			setMode(theme);
			app.notes.sort = noteOrder;
		});
	});

	// Con la app bloqueada, las pantallas de notas y ajustes piden la contraseña antes.
	$effect(() => {
		const path = page.url.pathname;
		if (app.auth.isLocked && (path.startsWith('/notes') || path.startsWith('/settings')))
			void goto('/unlock');
	});

	onMount(() => {
		void app.bootstrap();
		return () => app.destroy();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Apunte</title>
</svelte:head>

<ModeWatcher />

{@render children()}

<Toaster />
