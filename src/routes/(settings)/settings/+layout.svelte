<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { getApp } from '#lib/app/index.js';
	import { AppIcon, ThemeToggle } from '#lib/components/app/index.js';
	import { cn } from '#lib/utils.js';
	import { settingsSections } from './sections.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const app = getApp();

	const isHub = $derived(page.url.pathname === '/settings/menu');
	const current = $derived(settingsSections.find((s) => s.href === page.url.pathname));

	onMount(() => {
		void app.devices.load();
		void app.trustedDevices.load();
	});
</script>

<div class="flex h-dvh bg-background text-foreground">
	<!-- Navegación de secciones (≥ 768 px) -->
	<nav
		class="hidden w-62 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-sidebar px-4 py-5 md:flex"
		aria-label="Secciones de ajustes"
	>
		<div class="flex items-center justify-between">
			<span class="text-heading font-bold">Ajustes</span>
			<ThemeToggle />
		</div>
		<div class="h-2"></div>
		{#each settingsSections as section (section.href)}
			{@const active = current?.href === section.href}
			<a
				href={section.href}
				aria-current={active ? 'page' : undefined}
				class={cn(
					'rounded-lg px-3 py-2.25 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
					active ? 'bg-accent font-semibold text-accent-foreground' : 'font-medium hover:bg-hover'
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

	<main class="min-w-0 flex-1 overflow-y-auto">
		<!-- Barra superior (pantallas estrechas): volver + título -->
		<header class="sticky top-0 z-10 flex h-12 items-center gap-1 bg-background px-2 md:hidden">
			<a
				href={isHub ? '/notes' : '/settings/menu'}
				aria-label={isHub ? 'Volver a las notas' : 'Volver a ajustes'}
				class="grid size-10 place-content-center rounded-full outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<AppIcon name="arrow-left" size={24} />
			</a>
			<span class="flex-1 truncate text-heading font-semibold" aria-hidden="true">
				{isHub ? 'Ajustes' : (current?.title ?? 'Ajustes')}
			</span>
			<ThemeToggle />
		</header>

		<div class="px-4 pt-3 pb-4 md:pt-10 md:pr-10 md:pb-10 md:pl-14">
			<div class="flex max-w-160 flex-col gap-5 md:gap-6">
				{@render children()}
			</div>
		</div>
	</main>
</div>
