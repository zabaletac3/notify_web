<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { getApp } from '#lib/app/index.js';
	import { AppIcon, ThemeToggle } from '#lib/components/app/index.js';
	import { cn } from '#lib/utils.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const app = getApp();

	const sections = [
		{ href: '/settings', label: 'Generales' },
		{ href: '/settings/account', label: 'Mi cuenta' },
		{ href: '/settings/sync', label: 'Sincronización' },
		{ href: '/settings/privacy', label: 'Privacidad y seguridad' },
		{ href: '/settings/storage', label: 'Almacenamiento' },
		{ href: '/settings/delete-account', label: 'Eliminar cuenta' },
		{ href: '/settings/about', label: 'Acerca de' }
	];

	onMount(() => void app.devices.load());
</script>

<div class="flex h-screen bg-background text-foreground">
	<nav
		class="flex w-62 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-sidebar px-4 py-5"
		aria-label="Secciones de ajustes"
	>
		<div class="flex items-center justify-between">
			<h1 class="text-heading font-bold">Ajustes</h1>
			<ThemeToggle />
		</div>
		<div class="h-2"></div>
		{#each sections as section (section.href)}
			{@const current = page.url.pathname === section.href}
			<a
				href={section.href}
				aria-current={current ? 'page' : undefined}
				class={cn(
					'rounded-lg px-3 py-2.25 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
					current ? 'bg-accent font-semibold text-accent-foreground' : 'font-medium hover:bg-hover'
				)}
			>
				{section.label}
			</a>
		{/each}
		<div class="flex-1"></div>
		<a
			href="/notes"
			class="flex items-center gap-2 rounded-lg px-3 py-2.25 text-sm font-medium text-muted-foreground outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
		>
			<AppIcon name="arrow-left" size={16} /> Volver a las notas
		</a>
	</nav>

	<main class="flex-1 overflow-y-auto pt-10 pr-10 pb-10 pl-14">
		<div class="flex max-w-160 flex-col gap-6">
			{@render children()}
		</div>
	</main>
</div>
