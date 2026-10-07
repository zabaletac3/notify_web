<script lang="ts">
	import AppIcon from './app-icon.svelte';
	import { cn } from '#lib/utils.js';

	type Props = {
		title: string;
		/** Vista previa en la misma fila que la fecha. Vacía = no se muestra. */
		preview?: string;
		date: string;
		/** Carpeta, o en la papelera "Se elimina en N días". */
		folder?: string;
		pinned?: boolean;
		selected?: boolean;
		onclick?: () => void;
	};

	let {
		title,
		preview = '',
		date,
		folder,
		pinned = false,
		selected = false,
		onclick
	}: Props = $props();
</script>

<button
	type="button"
	{onclick}
	aria-current={selected ? 'true' : undefined}
	class={cn(
		'flex h-20 w-full flex-col gap-1 rounded-[10px] px-3.5 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
		selected ? 'bg-accent' : 'hover:bg-hover'
	)}
>
	<span class="flex w-full items-center gap-1.5">
		<span class="min-w-0 flex-1 truncate text-sm leading-[17px] font-semibold">{title}</span>
		{#if pinned}<AppIcon name="pin" size={13} class="shrink-0 text-tertiary" />{/if}
	</span>
	<span class="flex w-full items-center gap-2 text-caption leading-[15px]">
		<span class="shrink-0 font-medium text-muted-foreground">{date}</span>
		{#if preview}<span class="min-w-0 flex-1 truncate text-tertiary">{preview}</span>{/if}
	</span>
	{#if folder}
		<span class="flex items-center gap-1 text-micro font-medium text-tertiary">
			<AppIcon name="folder" size={11} />{folder}
		</span>
	{/if}
</button>
