<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as ContextMenu from '#lib/components/ui/context-menu/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import AppIcon from './app-icon.svelte';
	import { noteActions, type NoteActionId } from './note-actions.js';

	type Props = {
		/** `context`: clic derecho sobre `children`. `dropdown`: botón "más" de la barra. */
		variant: 'context' | 'dropdown';
		pinned?: boolean;
		onaction: (id: NoteActionId) => void;
		children?: Snippet;
	};

	let { variant, pinned = false, onaction, children }: Props = $props();

	const actions = $derived(noteActions(pinned));
	const contentClass = 'w-62 rounded-xl px-0 py-1.5';
	const itemClass = 'gap-3 rounded-none px-3 py-2.25 text-body font-medium';
</script>

{#snippet rows(Item: typeof ContextMenu.Item, Separator: typeof ContextMenu.Separator)}
	{#each actions as action (action.id)}
		{#if action.danger}<Separator class="m-0" />{/if}
		<Item
			class={itemClass}
			variant={action.danger ? 'destructive' : 'default'}
			onSelect={() => onaction(action.id)}
		>
			<AppIcon name={action.icon} size={20} />
			<span class="flex-1">{action.label}</span>
			<span class="text-caption font-normal text-tertiary">{action.shortcut}</span>
		</Item>
	{/each}
{/snippet}

{#if variant === 'context'}
	<ContextMenu.Root>
		<ContextMenu.Trigger class="contents">{@render children?.()}</ContextMenu.Trigger>
		<ContextMenu.Content class={contentClass}>
			{@render rows(ContextMenu.Item, ContextMenu.Separator)}
		</ContextMenu.Content>
	</ContextMenu.Root>
{:else}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			aria-label="Más acciones"
			title="Más acciones"
			class="grid size-8 place-content-center rounded-lg text-muted-foreground outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
		>
			<AppIcon name="more" size={18} />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class={contentClass}>
			{@render rows(
				DropdownMenu.Item as unknown as typeof ContextMenu.Item,
				DropdownMenu.Separator as unknown as typeof ContextMenu.Separator
			)}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
