<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { getApp } from '#lib/app/index.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Cada pantalla de acceso empieza sin los errores de la anterior.
	const { auth } = getApp();
	$effect(() => {
		void page.url.pathname;
		untrack(() => auth.clearErrors());
	});
</script>

<div class="relative grid min-h-screen place-items-center overflow-hidden bg-card px-4 py-4">
	<!-- Resplandores de fondo (decorativos) -->
	<div aria-hidden="true" class="pointer-events-none absolute inset-0">
		<div
			class="absolute -bottom-[10%] -left-[12%] size-[55vw] rounded-full bg-primary/20 blur-[70px]"
		></div>
		<div
			class="absolute -top-[12%] -right-[10%] size-[48vw] rounded-full bg-tag-plum/15 blur-[70px]"
		></div>
		<div
			class="absolute -bottom-[18%] left-[35%] size-[40vw] rounded-full bg-tag-amber/12 blur-[70px]"
		></div>
	</div>
	<main class="relative z-10 flex w-full justify-center">
		{@render children()}
	</main>
</div>
