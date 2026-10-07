<script lang="ts">
	import type { Snippet } from 'svelte';
	import AppIcon from './app-icon.svelte';
	import type { IconName } from './icons.js';

	type Props = {
		/** Icono dentro del círculo. Se ignora si se pasa `mark`. */
		icon?: IconName;
		/** Marca propia en lugar del círculo con icono (ej. el logo en "primera vez"). */
		mark?: Snippet;
		title: string;
		description?: string;
		/** Botón o botones bajo el texto. */
		children?: Snippet;
		/** Línea pequeña al final (ej. el atajo de teclado). */
		hint?: string;
	};

	let { icon, mark, title, description, children, hint }: Props = $props();
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-3.5 px-8 text-center">
	{#if mark}
		{@render mark()}
	{:else if icon}
		<span class="grid size-20 place-content-center rounded-full bg-accent text-accent-foreground">
			<AppIcon name={icon} size={32} />
		</span>
	{/if}
	<div class="flex flex-col gap-1.5">
		<h2 class="text-xl font-bold">{title}</h2>
		{#if description}<p class="text-sm leading-[21px] text-muted-foreground">{description}</p>{/if}
	</div>
	{@render children?.()}
	{#if hint}<p class="text-caption text-tertiary">{hint}</p>{/if}
</div>
