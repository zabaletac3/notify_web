<script lang="ts">
	import { goto } from '$app/navigation';
	import { AppIcon } from '#lib/components/app/index.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	/** Vuelve a la pantalla anterior; si no hay historial (p. ej. se abrió el enlace directo), va a la raíz. */
	function goBack() {
		if (typeof history !== 'undefined' && history.length > 1) history.back();
		else void goto('/');
	}
</script>

<div class="flex min-h-dvh flex-col bg-background text-foreground">
	<header
		class="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-background px-4"
	>
		<a
			href="/"
			class="rounded-lg px-2 py-1 text-heading font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
		>
			Apunte
		</a>
		<button
			type="button"
			onclick={goBack}
			class="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-label font-medium text-muted-foreground outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
		>
			<AppIcon name="arrow-left" size={16} />
			Volver
		</button>
	</header>

	<main class="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{@render children()}</main>

	<footer class="border-t border-border px-4 py-6">
		<nav
			aria-label="Enlaces legales"
			class="mx-auto flex max-w-3xl flex-wrap gap-x-4 gap-y-2 text-caption"
		>
			<a href="/terms" class="text-primary underline-offset-2 hover:underline">Términos de uso</a>
			<a href="/privacy" class="text-primary underline-offset-2 hover:underline"
				>Política de privacidad</a
			>
			<a href="/support" class="text-primary underline-offset-2 hover:underline"
				>Contacto y soporte</a
			>
		</nav>
	</footer>
</div>
