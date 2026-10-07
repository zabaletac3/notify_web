<script lang="ts">
	import { getApp } from '#lib/app/index.js';
	import { AppIcon, MarkdownView, NoteCard, ToolbarButton } from '#lib/components/app/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { formatCount, formatNoteDate, formatNoteDateLong } from '#lib/core/index.js';
	import { countWords, derivePreview, type NotesFilter } from '#lib/domain/index.js';

	const app = getApp();
	const { notes, folders } = app;

	const now = new Date();

	function titleOf(f: NotesFilter): string {
		switch (f.kind) {
			case 'all':
				return 'Todas las notas';
			case 'pinned':
				return 'Fijadas';
			case 'trash':
				return 'Papelera';
			case 'tag':
				return `#${f.tag}`;
			case 'folder':
				return folders.name(f.folderId);
		}
	}

	// Al terminar de cargar (o cambiar de lista) se abre la primera nota, como en el diseño.
	$effect(() => {
		if (notes.status === 'ready' && notes.selectedId === null) notes.selectFirst();
	});

	const note = $derived(notes.selected);
	const folderName = $derived(note?.folderId ? folders.name(note.folderId) : '');
</script>

<!-- Lista de notas: 336 px -->
<section
	class="flex w-84 shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-card px-3 py-4"
	aria-label="Lista de notas"
>
	<header class="flex items-center pr-0.5 pb-3 pl-1.5">
		<div class="flex-1">
			<h1 class="text-2xl leading-tight font-bold">{titleOf(notes.filter)}</h1>
			<p class="text-caption font-medium text-muted-foreground">
				{formatCount(notes.visible.length, 'nota', 'notas')}
			</p>
		</div>
		<button
			type="button"
			aria-label="Nueva nota"
			onclick={() => notes.create()}
			class="grid size-9 place-content-center rounded-[9px] bg-primary text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
		>
			<AppIcon name="compose" size={18} />
		</button>
	</header>

	<label class="flex h-8 items-center gap-2 rounded-lg bg-input-fill px-2.5 text-label">
		<AppIcon name="search" size={16} class="text-tertiary" />
		<input
			type="search"
			bind:value={app.search.query}
			placeholder="Buscar en {titleOf(notes.filter)}"
			class="min-w-0 flex-1 bg-transparent outline-none placeholder:text-tertiary"
		/>
		<kbd class="text-micro font-medium text-tertiary">Ctrl K</kbd>
	</label>

	{#if notes.status === 'loading' || notes.status === 'idle'}
		<div class="flex flex-col gap-3 pt-4">
			{#each [0, 1, 2, 3, 4] as i (i)}<Skeleton class="h-[80px] w-full rounded-[10px]" />{/each}
		</div>
	{:else if app.search.status !== 'idle'}
		{#each app.search.results as { note: n } (n.id)}
			<NoteCard
				title={n.title}
				preview={derivePreview(n.content)}
				date={formatNoteDate(n.updatedAt, now)}
				folder={n.folderId ? folders.name(n.folderId) : undefined}
				pinned={n.pinned}
				selected={n.id === notes.selectedId}
				onclick={() => notes.select(n.id)}
			/>
		{:else}
			<p class="px-2 pt-6 text-label text-muted-foreground">
				Sin resultados para “{app.search.trimmed}”.
			</p>
		{/each}
	{:else}
		{#each notes.groups as group (group.key)}
			<h2 class="px-3.5 pt-4 pb-1.5 text-caption font-semibold text-muted-foreground">
				{group.label}
			</h2>
			{#each group.notes as n (n.id)}
				<NoteCard
					title={n.title}
					preview={derivePreview(n.content)}
					date={formatNoteDate(n.updatedAt, now)}
					folder={n.folderId ? folders.name(n.folderId) : undefined}
					pinned={n.pinned}
					selected={n.id === notes.selectedId}
					onclick={() => notes.select(n.id)}
				/>
			{/each}
		{:else}
			<p class="px-2 pt-6 text-label text-muted-foreground">No hay notas en esta lista.</p>
		{/each}
	{/if}
</section>

<!-- Editor (solo lectura por ahora; TipTap llega después) -->
<main class="flex min-w-0 flex-1 flex-col bg-background">
	<div
		class="flex h-[53px] items-center gap-0.5 border-b py-2.5 pr-3 pl-4"
		role="toolbar"
		aria-label="Formato"
	>
		<span
			class="mr-1.5 flex h-7 items-center gap-1 rounded-lg bg-input-fill px-2.5 text-label font-medium"
		>
			Párrafo <AppIcon name="chevron-down" size={14} />
		</span>
		<ToolbarButton icon="bold" label="Negrita" active />
		<ToolbarButton icon="italic" label="Cursiva" />
		<ToolbarButton icon="list" label="Lista" />
		<ToolbarButton icon="checklist" label="Lista de tareas" />
		<span class="mx-1 h-[18px] w-px bg-border"></span>
		<ToolbarButton icon="image" label="Imagen" />
		<div class="flex-1"></div>
		<ToolbarButton icon="share" label="Compartir" />
		<ToolbarButton icon="more" label="Más acciones" />
	</div>

	{#if note}
		<article class="flex flex-1 flex-col gap-3.5 overflow-y-auto px-20 pt-10 pb-8">
			<p class="flex items-center gap-2 text-caption font-medium text-tertiary">
				{formatNoteDateLong(note.updatedAt)}
				{#if folderName}
					<span>·</span>
					<span class="flex items-center gap-1 font-semibold text-primary">
						<AppIcon name="folder" size={12} />{folderName}
					</span>
				{/if}
			</p>
			<h1 class="text-4xl leading-[42px] font-bold">{note.title}</h1>
			<MarkdownView source={note.content} />
			{#if note.tags.length}
				<ul class="flex gap-2 pt-1.5">
					{#each note.tags as tag, i (tag)}
						<li
							class="rounded-full bg-input-fill px-2.5 py-1 text-caption font-semibold {i % 2
								? 'text-tag-plum'
								: 'text-tag-amber'}"
						>
							#{tag}
						</li>
					{/each}
				</ul>
			{/if}
		</article>
		<footer
			class="flex items-center justify-end gap-2 px-6 pt-2 pb-2.5 text-caption font-medium text-tertiary"
		>
			<span class="size-1.5 rounded-full bg-primary"></span>
			{note.syncStatus === 'pending' ? 'Guardando' : 'Guardado'} · {formatCount(
				countWords(note.content),
				'palabra',
				'palabras'
			)}
		</footer>
	{:else if notes.status === 'ready'}
		<div class="grid flex-1 place-content-center text-body text-muted-foreground">
			Selecciona una nota para verla aquí.
		</div>
	{/if}
</main>
