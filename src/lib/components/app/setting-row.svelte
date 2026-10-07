<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.js';

	type Props = {
		label: string;
		/** Segunda línea, más pequeña. */
		description?: string;
		/** Valor actual, a la derecha. */
		value?: string;
		/** Muestra el chevron "›". */
		chevron?: boolean;
		/** Texto de acción a la derecha, en azul (ej. "Cambiar"). */
		action?: string;
		/** Fila destructiva (texto en rojo). */
		danger?: boolean;
		/** Si se pasa, la fila entera es un botón. */
		onclick?: () => void;
		/** Control a la derecha (ej. un Switch). */
		control?: Snippet;
	};

	let {
		label,
		description,
		value,
		chevron = false,
		action,
		danger = false,
		onclick,
		control
	}: Props = $props();

	const rowClass = 'flex w-full items-center gap-3 px-4 py-3.5 text-left';
</script>

{#snippet content()}
	<span class="flex min-w-0 flex-1 flex-col gap-0.5">
		<span class={cn('text-body font-medium', danger && 'text-destructive')}>{label}</span>
		{#if description}<span class="text-label text-muted-foreground">{description}</span>{/if}
	</span>
	{#if value}<span class="text-sm text-muted-foreground">{value}</span>{/if}
	{#if action}<span class="text-sm font-semibold text-primary">{action}</span>{/if}
	{#if chevron}<span class="text-xl leading-none text-tertiary" aria-hidden="true">›</span>{/if}
	{@render control?.()}
{/snippet}

{#if onclick}
	<button
		type="button"
		{onclick}
		class={cn(
			rowClass,
			'outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50'
		)}
	>
		{@render content()}
	</button>
{:else}
	<div class={rowClass}>{@render content()}</div>
{/if}
