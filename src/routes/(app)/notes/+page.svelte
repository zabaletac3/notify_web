<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { getApp } from '#lib/app/index.js';
	import { AppIcon, MarkdownView, NoteCard, NoteEditor } from '#lib/components/app/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { formatCount, formatNoteDate, formatNoteDateLong } from '#lib/core/index.js';
	import {
		TRASH_RETENTION_DAYS,
		countWords,
		daysUntilPurge,
		derivePreview,
		foldText,
		type Note,
		type NotesFilter
	} from '#lib/domain/index.js';

	const app = getApp();
	const { notes, folders, settings } = app;

	const now = new Date();
	const inTrash = $derived(notes.filter.kind === 'trash');

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

	const placeholder = $derived(
		inTrash ? 'Buscar en la papelera' : `Buscar en ${titleOf(notes.filter)}`
	);

	// Dentro de una carpeta o etiqueta, la búsqueda se limita a esa lista.
	$effect(() => {
		app.search.scope = notes.filter.kind === 'all' ? 'all' : 'current';
	});

	// La papelera se busca aparte: el índice de búsqueda solo cubre las notas activas.
	let trashQuery = $state('');
	const trashHits = $derived.by(() => {
		const q = foldText(trashQuery.trim());
		if (!q) return null;
		return notes.visible.filter((n) => foldText(`${n.title} ${n.content}`).includes(q));
	});

	// Al terminar de cargar (o cambiar de lista) se abre la primera nota, como en el diseño.
	$effect(() => {
		if (notes.status === 'ready' && notes.selectedId === null) notes.selectFirst();
	});

	const note = $derived(notes.selected);
	const folderName = $derived(note?.folderId ? folders.name(note.folderId) : '');

	let titleTimer: ReturnType<typeof setTimeout> | undefined;
	function saveTitle(id: string, title: string) {
		clearTimeout(titleTimer);
		titleTimer = setTimeout(() => notes.update(id, { title }), 400);
	}

	function purgeLabel(n: Note) {
		const days = daysUntilPurge(n.deletedAt ?? n.updatedAt, now, TRASH_RETENTION_DAYS);
		return `Se elimina en ${formatCount(days, 'día', 'días')}`;
	}

	let confirmDelete = $state(false);

	async function restore(n: Note) {
		const result = await notes.restore(n.id);
		toast[result.ok ? 'success' : 'error'](
			result.ok ? 'Nota restaurada' : 'No se pudo restaurar la nota'
		);
	}

	async function deleteForever(n: Note) {
		const result = await notes.deleteForever(n.id);
		confirmDelete = false;
		toast[result.ok ? 'success' : 'error'](
			result.ok ? 'Nota eliminada definitivamente' : 'No se pudo eliminar la nota'
		);
	}
</script>

{#snippet card(n: Note)}
	<NoteCard
		title={n.title}
		preview={inTrash || !settings.values.showPreview ? '' : derivePreview(n.content)}
		date={formatNoteDate(n.deletedAt ?? n.updatedAt, now)}
		folder={inTrash ? purgeLabel(n) : n.folderId ? folders.name(n.folderId) : undefined}
		pinned={n.pinned}
		selected={n.id === notes.selectedId}
		onclick={() => notes.select(n.id)}
	/>
{/snippet}

<!-- Lista de notas: 336 px -->
<section
	class="flex w-84 shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-card px-3 py-4 *:shrink-0"
	aria-label="Lista de notas"
>
	<header class="flex items-center pr-0.5 pb-3 pl-1.5">
		<div class="flex-1">
			<h1 class="text-2xl leading-tight font-bold">{titleOf(notes.filter)}</h1>
			<p class="text-caption font-medium text-muted-foreground">
				{formatCount(notes.visible.length, 'nota', 'notas')}
			</p>
		</div>
		{#if !inTrash}
			<button
				type="button"
				aria-label="Nueva nota"
				onclick={() => notes.create()}
				class="grid size-9 place-content-center rounded-[9px] bg-primary text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<AppIcon name="compose" size={18} />
			</button>
		{/if}
	</header>

	<label class="flex h-8 w-full items-center gap-2 rounded-lg bg-input-fill px-2.5 text-label">
		<AppIcon name="search" size={16} class="shrink-0 text-tertiary" />
		{#if inTrash}
			<input
				type="text"
				bind:value={trashQuery}
				{placeholder}
				class="min-w-0 flex-1 bg-transparent outline-none placeholder:text-tertiary"
			/>
		{:else}
			<input
				type="text"
				bind:value={app.search.query}
				{placeholder}
				class="min-w-0 flex-1 bg-transparent outline-none placeholder:text-tertiary"
			/>
		{/if}
		<kbd class="shrink-0 text-micro font-medium text-tertiary">Ctrl K</kbd>
	</label>

	{#if inTrash}
		<p class="mt-2 rounded-xl bg-accent px-3.5 py-3 text-label leading-[19px]" role="note">
			Las notas se eliminan definitivamente después de {TRASH_RETENTION_DAYS} días.
		</p>
	{/if}

	{#if notes.status === 'loading' || notes.status === 'idle'}
		<div class="flex flex-col gap-3 pt-4">
			{#each [0, 1, 2, 3, 4] as i (i)}<Skeleton class="h-20 w-full rounded-[10px]" />{/each}
		</div>
	{:else if inTrash}
		{#each trashHits ?? notes.visible as n (n.id)}
			{@render card(n)}
		{:else}
			<p class="px-2 pt-6 text-label text-muted-foreground">
				{trashHits ? `Sin resultados para “${trashQuery.trim()}”.` : 'La papelera está vacía.'}
			</p>
		{/each}
	{:else if app.search.status !== 'idle'}
		{#each app.search.results as { note: n } (n.id)}
			{@render card(n)}
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
				{@render card(n)}
			{/each}
		{:else}
			<p class="px-2 pt-6 text-label text-muted-foreground">No hay notas en esta lista.</p>
		{/each}
	{/if}
</section>

<!-- Editor -->
<main class="flex min-w-0 flex-1 flex-col bg-background">
	{#if note && note.deletedAt}
		<!-- Nota en la papelera: solo lectura, con avisos y acciones -->
		<div class="flex flex-1 flex-col gap-5 overflow-y-auto px-12 pt-8">
			<div class="flex items-center gap-3 rounded-xl bg-accent px-4 py-3.5" role="note">
				<p class="flex-1 text-sm font-medium">
					Esta nota está en la papelera. Se eliminará definitivamente en {formatCount(
						daysUntilPurge(note.deletedAt, now, TRASH_RETENTION_DAYS),
						'día',
						'días'
					)}.
				</p>
				<Button onclick={() => restore(note)}>Restaurar</Button>
				<Button variant="outline" onclick={() => (confirmDelete = true)}>Eliminar ahora</Button>
			</div>
			<h1 class="text-3xl leading-[38px] font-bold text-muted-foreground">{note.title}</h1>
			<MarkdownView source={note.content} class="text-muted-foreground" />
		</div>
	{:else if note}
		{#snippet header()}
			<p class="mb-3.5 flex items-center gap-2 text-caption font-medium text-tertiary">
				{formatNoteDateLong(note.updatedAt)}
				{#if folderName}
					<span>·</span>
					<span class="flex items-center gap-1 font-semibold text-primary">
						<AppIcon name="folder" size={12} />{folderName}
					</span>
				{/if}
			</p>
			<input
				aria-label="Título"
				value={note.title}
				placeholder="Sin título"
				oninput={(e) => saveTitle(note.id, e.currentTarget.value)}
				class="mb-3.5 w-full bg-transparent text-4xl leading-[42px] font-bold outline-none placeholder:text-tertiary"
			/>
		{/snippet}

		{#key note.id}
			<NoteEditor
				content={note.content}
				class="px-20 pt-10 pb-8"
				{header}
				onchange={(md) => notes.update(note.id, { content: md })}
			/>
		{/key}

		{#if note.tags.length}
			<ul class="flex gap-2 px-20 pb-2">
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
			{inTrash ? 'Selecciona una nota de la papelera.' : 'Selecciona una nota para verla aquí.'}
		</div>
	{/if}
</main>

<AlertDialog.Root bind:open={confirmDelete}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>¿Eliminar definitivamente?</AlertDialog.Title>
			<AlertDialog.Description>
				La nota “{note?.title}” se borrará para siempre y no podrás recuperarla.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={() => note && deleteForever(note)}>
				Eliminar
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
