<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { cn } from '#lib/utils.js';
	import { viewport } from './viewport.svelte.js';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		/** Ancho máximo del diálogo en pantallas anchas (ej. `sm:max-w-110`). */
		width?: string;
		children: Snippet;
	};

	let { open, onOpenChange, width = 'sm:max-w-110', children }: Props = $props();
</script>

{#if viewport.split.current}
	<Dialog.Root {open} {onOpenChange}>
		<Dialog.Content class={cn('gap-4 p-7', width)} showCloseButton={false}>
			{@render children()}
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Sheet.Root {open} {onOpenChange}>
		<Sheet.Content side="bottom" showCloseButton={false} class="gap-4 px-5 pt-3 pb-9">
			<span class="mx-auto h-1 w-9 rounded-full bg-border" aria-hidden="true"></span>
			{@render children()}
		</Sheet.Content>
	</Sheet.Root>
{/if}
