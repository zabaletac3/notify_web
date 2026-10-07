<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		subtitle?: string;
		/** Sustituye al logo (ej. el sobre en "Verifica tu correo"). */
		mark?: Snippet;
		children: Snippet;
		/** Texto bajo la tarjeta (ej. "¿Eres nuevo? Crea una cuenta"). */
		footer?: Snippet;
	};

	let { title, subtitle, mark, children, footer }: Props = $props();
</script>

<div class="flex w-full max-w-115 flex-col items-center gap-6">
	<section
		class="flex w-full flex-col gap-5 rounded-4xl bg-background p-10 shadow-auth [@media(max-height:860px)]:gap-3.5 [@media(max-height:860px)]:p-8"
	>
		<header class="flex flex-col items-center gap-2.5 text-center">
			{#if mark}
				{@render mark()}
			{:else}
				<span
					class="grid size-12 place-content-center rounded-[14px] bg-primary text-3xl font-bold text-primary-foreground"
					aria-hidden="true">a</span
				>
			{/if}
			<h1 class="text-page leading-tight font-bold">{title}</h1>
			{#if subtitle}<p class="text-sm text-muted-foreground">{subtitle}</p>{/if}
		</header>
		{@render children()}
	</section>
	{#if footer}
		<p class="flex items-center gap-1.5 text-sm text-muted-foreground">{@render footer()}</p>
	{/if}
</div>
