<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as ContextMenu from '#lib/components/ui/context-menu/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import AppIcon from './app-icon.svelte';
	import { noteActions, type NoteActionId } from './note-actions.js';
	import { viewport } from './viewport.svelte.js';
	import { cn } from '#lib/utils.js';

	type Props = {
		/** `context`: clic derecho sobre `children`. `dropdown`: botón "más" de la barra. */
		variant: 'context' | 'dropdown';
		pinned?: boolean;
		/** Tamaño del botón del menú desplegable. */
		size?: 'sm' | 'lg';
		/** Encabezado de la hoja inferior (pantallas estrechas). */
		title?: string;
		subtitle?: string;
		onaction: (id: NoteActionId) => void;
		children?: Snippet;
	};

	let {
		variant,
		pinned = false,
		size = 'sm',
		title,
		subtitle,
		onaction,
		children
	}: Props = $props();

	const actions = $derived(noteActions(pinned));
	const contentClass = 'w-62 rounded-xl px-0 py-1.5';
	let sheetOpen = $state(false);
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

{#snippet sheet()}
	<Sheet.Root bind:open={sheetOpen}>
		<Sheet.Content side="bottom" showCloseButton={false} class="gap-4 px-5 pt-3 pb-9">
			<span class="mx-auto h-1 w-9 rounded-full bg-border" aria-hidden="true"></span>
			<div class="flex flex-col gap-4">
				<div class="flex flex-col gap-0.5">
					<Sheet.Title class="text-[17px] font-semibold">{title ?? 'Nota'}</Sheet.Title>
					{#if subtitle}<p class="text-label text-muted-foreground">{subtitle}</p>{/if}
				</div>
				<div class="divide-y divide-border overflow-hidden rounded-[14px] border bg-card">
					{#each actions as action (action.id)}
						<button
							type="button"
							onclick={() => {
								sheetOpen = false;
								onaction(action.id);
							}}
							class={cn(
								'flex w-full items-center gap-3 px-4 py-3.5 text-left text-body font-medium outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50',
								action.danger && 'text-destructive'
							)}
						>
							<AppIcon name={action.icon} size={20} />
							{action.label}
						</button>
					{/each}
				</div>
			</div>
		</Sheet.Content>
	</Sheet.Root>
{/snippet}

{#if !viewport.split.current}
	<!-- Pantallas estrechas: hoja inferior (pulsación larga en la tarjeta o botón "…") -->
	{#if variant === 'context'}
		<div
			class="contents"
			role="presentation"
			oncontextmenu={(e) => {
				e.preventDefault();
				sheetOpen = true;
			}}
		>
			{@render children?.()}
		</div>
	{:else}
		<button
			type="button"
			aria-label="Más acciones"
			title="Más acciones"
			onclick={() => (sheetOpen = true)}
			class="grid {size === 'lg'
				? 'size-10'
				: 'size-8'} place-content-center rounded-lg text-muted-foreground outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
		>
			<AppIcon name="more" size={18} />
		</button>
	{/if}
	{@render sheet()}
{:else if variant === 'context'}
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
			class="grid {size === 'lg'
				? 'size-10'
				: 'size-8'} place-content-center rounded-lg text-muted-foreground outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
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
