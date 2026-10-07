<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { formatCount } from '#lib/core/index.js';
	import { getApp } from '#lib/app/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import NoteDialogs from './note-dialogs.svelte';
	import SystemDialogs from './system-dialogs.svelte';
	import AppNav from './app-nav.svelte';
	import { shell } from './shell.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const app = getApp();

	// Al pasar a una pantalla ancha el cajón ya no hace falta.
	$effect(() => {
		if (shell.wide.current) shell.drawerOpen = false;
	});

	// Sesión cerrada sin que la persona lo pidiera (dispositivo revocado, otra pestaña): a iniciar sesión.
	$effect(() => {
		if (app.auth.notice) void goto('/login');
	});

	// Aviso "Sincronizando N cambios…" mientras se sube lo pendiente.
	$effect(() => {
		if (app.sync.syncing && app.sync.snapshot.pendingCount > 0) {
			toast.info(
				`Sincronizando ${formatCount(app.sync.snapshot.pendingCount, 'cambio', 'cambios')}…`,
				{ id: 'syncing', duration: Infinity }
			);
		} else {
			toast.dismiss('syncing');
		}
	});
</script>

<div class="flex h-dvh bg-card text-foreground">
	<!-- Barra lateral fija (≥ 1024 px): 248 px -->
	<aside class="hidden w-62 shrink-0 flex-col border-r bg-sidebar px-3 pt-3.5 pb-3.5 lg:flex">
		<AppNav />
	</aside>

	{@render children()}
</div>

<!-- Cajón de navegación (< 1024 px): 304 px -->
<Sheet.Root bind:open={shell.drawerOpen}>
	<Sheet.Content
		side="left"
		showCloseButton={false}
		class="w-76 max-w-[85vw] gap-0 bg-sidebar px-3 pt-4 pb-3.5 sm:max-w-76"
	>
		<Sheet.Title class="sr-only">Navegación</Sheet.Title>
		<AppNav />
	</Sheet.Content>
</Sheet.Root>

<NoteDialogs />
<SystemDialogs />
