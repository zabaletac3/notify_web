<script lang="ts">
	import AppIcon from './app-icon.svelte';
	import type { IconName } from './icons.js';
	import { cn } from '#lib/utils.js';

	type Props = {
		icon: IconName;
		label: string;
		/** Se oculta si es `undefined`. */
		count?: number;
		selected?: boolean;
		onclick?: () => void;
	};

	let { icon, label, count, selected = false, onclick }: Props = $props();
</script>

<button
	type="button"
	{onclick}
	aria-current={selected ? 'page' : undefined}
	class={cn(
		'flex h-8.5 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
		selected
			? 'bg-accent font-semibold text-accent-foreground'
			: 'font-medium text-foreground hover:bg-hover'
	)}
>
	<AppIcon name={icon} size={18} class={selected ? '' : 'text-muted-foreground'} />
	<span class="min-w-0 flex-1 truncate">{label}</span>
	{#if count !== undefined}
		<span class={cn('text-caption font-medium', selected ? '' : 'text-tertiary')}>{count}</span>
	{/if}
</button>
