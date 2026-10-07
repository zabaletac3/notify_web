<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getApp } from '#lib/app/index.js';
	import { AppIcon, SidebarItem, ThemeToggle } from '#lib/components/app/index.js';
	import type { NotesFilter } from '#lib/domain/index.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const app = getApp();
	const { notes, folders } = app;

	const onNotes = $derived(page.url.pathname.startsWith('/notes'));
	const is = (kind: NotesFilter['kind']) => onNotes && notes.filter.kind === kind;

	async function show(filter: NotesFilter) {
		notes.setFilter(filter);
		if (!onNotes) await goto('/notes');
	}
</script>

<div class="flex h-screen bg-card text-foreground">
	<!-- Barra lateral: 248 px -->
	<aside
		class="flex w-62 shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-sidebar px-3 pt-3.5 pb-3.5 *:shrink-0"
		aria-label="Navegación"
	>
		<div class="flex items-center gap-2.5 pt-0.5 pr-1 pb-3.5 pl-1.5">
			<span
				class="grid size-7 place-content-center rounded-lg bg-primary text-heading font-bold text-primary-foreground"
				>a</span
			>
			<span class="flex-1 text-xl font-bold">Apunte</span>
			<a
				href="/settings"
				aria-label="Ajustes"
				class="grid size-8 place-content-center rounded-lg text-muted-foreground outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<AppIcon name="settings" size={18} />
			</a>
			<ThemeToggle />
		</div>

		<h2
			class="px-2.5 pt-3.5 pb-1.5 text-micro font-semibold tracking-wider text-tertiary uppercase"
		>
			Biblioteca
		</h2>
		<SidebarItem
			icon="notes"
			label="Todas las notas"
			count={notes.counts.all}
			selected={is('all')}
			onclick={() => show({ kind: 'all' })}
		/>
		<SidebarItem
			icon="pin"
			label="Fijadas"
			count={notes.counts.pinned}
			selected={is('pinned')}
			onclick={() => show({ kind: 'pinned' })}
		/>

		<h2
			class="px-2.5 pt-3.5 pb-1.5 text-micro font-semibold tracking-wider text-tertiary uppercase"
		>
			Carpetas
		</h2>
		{#each folders.list as folder (folder.id)}
			<SidebarItem
				icon="folder"
				label={folder.name}
				count={notes.counts.byFolder[folder.id] ?? 0}
				selected={onNotes && notes.filter.kind === 'folder' && notes.filter.folderId === folder.id}
				onclick={() => show({ kind: 'folder', folderId: folder.id })}
			/>
		{/each}

		{#if notes.tags.length}
			<h2
				class="px-2.5 pt-3.5 pb-1.5 text-micro font-semibold tracking-wider text-tertiary uppercase"
			>
				Etiquetas
			</h2>
			{#each notes.tags as tag (tag.name)}
				<SidebarItem
					icon="hash"
					label={tag.name}
					count={tag.count}
					selected={onNotes && notes.filter.kind === 'tag' && notes.filter.tag === tag.name}
					onclick={() => show({ kind: 'tag', tag: tag.name })}
				/>
			{/each}
		{/if}

		<div class="flex-1"></div>
		<SidebarItem
			icon="trash"
			label="Papelera"
			count={notes.counts.trash}
			selected={is('trash')}
			onclick={() => show({ kind: 'trash' })}
		/>
		<button
			type="button"
			class="flex items-center gap-2 px-2.5 pt-2.5 pb-1 text-label font-semibold text-primary"
		>
			<AppIcon name="folder-plus" size={16} /> Nueva carpeta
		</button>
	</aside>

	{@render children()}
</div>
