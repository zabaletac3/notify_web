<script lang="ts">
	import AppIcon from './app-icon.svelte';
	import type { IconName } from './icons.js';
	import { cn } from '#lib/utils.js';

	type Props = {
		icon: IconName;
		label: string;
		active?: boolean;
		/** `lg`: 40 px (barra flotante móvil). */
		size?: 'sm' | 'lg';
		onclick?: () => void;
	};
	let { icon, label, active = false, size = 'sm', onclick }: Props = $props();
</script>

<button
	type="button"
	{onclick}
	aria-label={label}
	aria-pressed={active}
	title={label}
	class={cn(
		size === 'lg' ? 'size-10' : 'size-8',
		'grid place-content-center rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
		active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-hover'
	)}
>
	<AppIcon name={icon} size={18} />
</button>
