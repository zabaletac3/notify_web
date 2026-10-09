<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getApp } from '#lib/app/index.js';
	import { AppIcon, SidebarItem, ThemeToggle } from '#lib/components/app/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import type { NotesFilter } from '#lib/domain/index.js';
	import { cn } from '#lib/utils.js';
	import { dialogs } from './dialogs.svelte.js';
	import { shell } from './shell.svelte.js';

	type Props = {
		/** Barra lateral de escritorio recogida (solo iconos). El cajón móvil siempre va expandido. */
		collapsed?: boolean;
		/** Muestra el botón de recoger/expandir (solo en el aside de escritorio). */
		onToggle?: () => void;
		/** id del aside que controla el botón. */
		sidebarId?: string;
	};

	let { collapsed = false, onToggle, sidebarId }: Props = $props();

	const { notes, folders } = getApp();

	const onNotes = $derived(page.url.pathname.startsWith('/notes'));
	const is = (kind: NotesFilter['kind']) => onNotes && notes.filter.kind === kind;

	async function show(filter: NotesFilter) {
		notes.setFilter(filter);
		// En pantallas estrechas se vuelve a la lista de la carpeta elegida.
		shell.editing = false;
		shell.drawerOpen = false;
		if (!onNotes) await goto('/notes');
	}

	function openFolder() {
		shell.drawerOpen = false;
		dialogs.open('folder');
	}

	const section =
		'px-2.5 pt-3.5 pb-1.5 text-micro font-semibold tracking-wider text-tertiary uppercase';
	const iconButton =
		'grid size-8 place-content-center rounded-lg text-muted-foreground outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50';
	const folderButtonProps = $derived({
		type: 'button' as const,
		onclick: openFolder,
		'aria-label': collapsed ? 'Nueva carpeta' : undefined,
		class: collapsed
			? 'flex h-8.5 w-full items-center justify-center rounded-sm text-primary outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50'
			: 'flex items-center gap-2 px-2.5 pt-2.5 pb-1 text-label font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
	});
</script>

{#snippet sectionLabel(text: string)}
	<h2 class={collapsed ? 'sr-only' : section}>{text}</h2>
	{#if collapsed}
		<div class="mx-auto my-2 h-px w-6 bg-border" aria-hidden="true"></div>
	{/if}
{/snippet}

{#snippet toggleButton()}
	<button
		type="button"
		onclick={onToggle}
		aria-expanded={!collapsed}
		aria-controls={sidebarId}
		aria-label={collapsed ? 'Expandir la barra lateral' : 'Recoger la barra lateral'}
		class={iconButton}
	>
		<AppIcon name="sidebar" size={18} />
	</button>
{/snippet}

{#snippet folderButton(triggerProps: Record<string, unknown>)}
	{@const props = mergeProps(folderButtonProps, triggerProps)}
	<button {...props}>
		{#if collapsed}
			<AppIcon name="plus" size={18} />
		{:else}
			<AppIcon name="folder-plus" size={16} /> Nueva carpeta
		{/if}
	</button>
{/snippet}

<nav class="flex min-h-0 flex-1 flex-col gap-0.5 *:shrink-0" aria-label="Navegación">
	{#if collapsed}
		<div class="flex flex-col items-center gap-2.5 pt-0.5 pb-3.5">
			<span
				class="grid size-7 place-content-center rounded-lg bg-primary text-heading font-bold text-primary-foreground"
				>a</span
			>
			{#if onToggle}{@render toggleButton()}{/if}
		</div>
	{:else}
		<div class="flex items-center gap-2.5 pt-0.5 pr-1 pb-3.5 pl-1.5">
			<span
				class="grid size-7 place-content-center rounded-lg bg-primary text-heading font-bold text-primary-foreground"
				>a</span
			>
			<span class="flex-1 text-xl font-bold">AxoNote</span>
			{#if onToggle}
				{@render toggleButton()}
			{:else}
				<!-- Cajón móvil: sin botón de recoger; Ajustes y el tema siguen en la cabecera. -->
				<a href="/settings" aria-label="Ajustes" class={iconButton}>
					<AppIcon name="settings" size={18} />
				</a>
				<ThemeToggle />
			{/if}
		</div>
	{/if}

	<!-- Solo esta zona se desplaza: la cabecera y el pie (Papelera, Nueva carpeta, Ajustes y tema) quedan
	     siempre a la vista y ningún botón del pie puede quedar tapado por la barra de desplazamiento. -->
	<div
		class={cn(
			'flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto *:shrink-0',
			collapsed && '[scrollbar-width:none]'
		)}
	>
		{@render sectionLabel('Biblioteca')}
		<SidebarItem
			icon="notes"
			label="Todas las notas"
			count={notes.counts.all}
			selected={is('all')}
			{collapsed}
			onclick={() => show({ kind: 'all' })}
		/>
		<SidebarItem
			icon="pin"
			label="Fijadas"
			count={notes.counts.pinned}
			selected={is('pinned')}
			{collapsed}
			onclick={() => show({ kind: 'pinned' })}
		/>

		{@render sectionLabel('Carpetas')}
		{#each folders.list as folder (folder.id)}
			<SidebarItem
				icon="folder"
				label={folder.name}
				count={notes.counts.byFolder[folder.id] ?? 0}
				selected={onNotes && notes.filter.kind === 'folder' && notes.filter.folderId === folder.id}
				{collapsed}
				onclick={() => show({ kind: 'folder', folderId: folder.id })}
			/>
		{/each}

		{#if notes.tags.length}
			{@render sectionLabel('Etiquetas')}
			{#each notes.tags as tag (tag.name)}
				<SidebarItem
					icon="hash"
					label={tag.name}
					count={tag.count}
					selected={onNotes && notes.filter.kind === 'tag' && notes.filter.tag === tag.name}
					{collapsed}
					onclick={() => show({ kind: 'tag', tag: tag.name })}
				/>
			{/each}
		{/if}
	</div>

	<div class="flex flex-col gap-0.5 pt-1">
		<SidebarItem
			icon="trash"
			label="Papelera"
			count={notes.counts.trash}
			selected={is('trash')}
			{collapsed}
			onclick={() => show({ kind: 'trash' })}
		/>
		{#if collapsed}
			<Tooltip.Provider delayDuration={150}>
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}{@render folderButton(props)}{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content role="tooltip" side="right" sideOffset={8}>Nueva carpeta</Tooltip.Content
					>
				</Tooltip.Root>
			</Tooltip.Provider>
		{:else}
			{@render folderButton({})}
		{/if}

		{#if onToggle}
			<!-- Barra de escritorio: Ajustes y el tema van al pie (la cabecera queda como en el diseño). -->
			<div
				class={cn(
					'mt-1 flex border-t pt-2',
					collapsed ? 'flex-col items-center gap-1' : 'items-center gap-1'
				)}
			>
				{#if collapsed}
					<a href="/settings" aria-label="Ajustes" title="Ajustes" class={iconButton}>
						<AppIcon name="settings" size={18} />
					</a>
				{:else}
					<a
						href="/settings"
						class="flex h-8.5 min-w-0 flex-1 items-center gap-2.5 rounded-sm px-2.5 text-sm font-medium text-foreground outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
					>
						<AppIcon name="settings" size={18} class="text-muted-foreground" />
						<span class="truncate">Ajustes</span>
					</a>
				{/if}
				<ThemeToggle />
			</div>
		{/if}
	</div>
</nav>
