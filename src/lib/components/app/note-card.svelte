<script lang="ts">
	import AppIcon from './app-icon.svelte';
	import { cn } from '#lib/utils.js';

	type Props = {
		title: string;
		preview: string;
		date: string;
		folder?: string;
		pinned?: boolean;
		selected?: boolean;
		onclick?: () => void;
	};

	let { title, preview, date, folder, pinned = false, selected = false, onclick }: Props = $props();
</script>

<button
	type="button"
	{onclick}
	aria-current={selected ? 'true' : undefined}
	class={cn(
		'flex w-full flex-col gap-1 rounded-[10px] px-3.5 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
		selected ? 'bg-accent' : 'hover:bg-hover'
	)}
>
	<span class="flex items-center gap-2">
		<span class="min-w-0 flex-1 truncate text-body font-semibold">{title}</span>
		{#if pinned}<AppIcon name="pin" size={13} class="text-tertiary" />{/if}
		<span class="text-caption font-medium text-tertiary">{date}</span>
	</span>
	<span class="truncate text-label text-muted-foreground">{preview}</span>
	{#if folder}
		<span class="flex items-center gap-1 text-caption font-medium text-tertiary">
			<AppIcon name="folder" size={12} />{folder}
		</span>
	{/if}
</button>
