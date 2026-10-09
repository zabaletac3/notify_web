<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { formatCount } from '#lib/core/index.js';
	import { getApp } from '#lib/app/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { cn } from '#lib/utils.js';
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

	// `data-sidebar` en <html>: lo aplica `static/theme-init.js` antes de pintar (sin parpadeo);
	// aquí se mantiene al día al alternar o al cambiar el tamaño de la ventana.
	$effect(() => {
		const root = document.documentElement;
		if (shell.sidebar) root.dataset.sidebar = 'collapsed';
		else delete root.dataset.sidebar;
	});

	/** Atajo `Ctrl+B` / `Cmd+B`: recoge o expande la barra lateral (no mientras se escribe). */
	function onKeydown(e: KeyboardEvent) {
		if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
		if (e.key.toLowerCase() !== 'b' || !shell.wide.current) return;
		const target = e.target as HTMLElement | null;
		if (target?.closest('input, textarea, [contenteditable]')) return;
		e.preventDefault();
		shell.toggleSidebar();
	}

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
	<!-- Barra lateral fija (≥ 1024 px): 248 px abierta, 64 px recogida -->
	<aside
		id="app-sidebar"
		class={cn(
			'hidden shrink-0 flex-col border-r bg-sidebar px-3 pt-3.5 pb-3.5 transition-[width] duration-200 motion-reduce:transition-none lg:flex',
			shell.sidebar ? 'w-16' : 'w-62'
		)}
	>
		<AppNav
			collapsed={shell.sidebar}
			onToggle={() => shell.toggleSidebar()}
			sidebarId="app-sidebar"
		/>
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

<svelte:window onkeydown={onKeydown} />

<NoteDialogs />
<SystemDialogs />
