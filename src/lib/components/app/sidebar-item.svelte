<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import AppIcon from './app-icon.svelte';
	import type { IconName } from './icons.js';
	import { cn } from '#lib/utils.js';

	type Props = {
		icon: IconName;
		label: string;
		/** Se oculta si es `undefined`. */
		count?: number;
		selected?: boolean;
		/** Solo el icono, centrado (barra lateral recogida). */
		collapsed?: boolean;
		onclick?: () => void;
	};

	let { icon, label, count, selected = false, collapsed = false, onclick }: Props = $props();

	/** Nombre accesible: incluye la etiqueta y el contador, aunque no se vean. */
	const accessibleName = $derived(count === undefined ? label : `${label}, ${count}`);
	/** Texto del tooltip: «Etiqueta · contador». */
	const tooltipText = $derived(count === undefined ? label : `${label} · ${count}`);

	const buttonProps = $derived({
		type: 'button' as const,
		class: cn(
			'flex h-8.5 w-full items-center rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
			collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5 text-left text-sm',
			selected
				? 'bg-accent font-semibold text-accent-foreground'
				: 'font-medium text-foreground hover:bg-hover'
		),
		onclick,
		'aria-current': selected ? ('page' as const) : undefined,
		'aria-label': collapsed ? accessibleName : undefined
	});
</script>

{#snippet item(triggerProps: Record<string, unknown>)}
	{@const props = mergeProps(buttonProps, triggerProps)}
	<button {...props}>
		<AppIcon name={icon} size={18} class={selected ? '' : 'text-muted-foreground'} />
		{#if collapsed}
			<span class="sr-only">{accessibleName}</span>
		{:else}
			<span class="min-w-0 flex-1 truncate">{label}</span>
			{#if count !== undefined}
				<span class={cn('text-caption font-medium', selected ? '' : 'text-tertiary')}>{count}</span>
			{/if}
		{/if}
	</button>
{/snippet}

{#if collapsed}
	<Tooltip.Provider delayDuration={150}>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}{@render item(props)}{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content role="tooltip" side="right" sideOffset={8}>{tooltipText}</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
{:else}
	{@render item({})}
{/if}
