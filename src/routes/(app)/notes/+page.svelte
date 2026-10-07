<script lang="ts">
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getApp } from '#lib/app/index.js';
	import {
		AppIcon,
		EmptyState,
		MarkdownView,
		NoteCard,
		NoteEditor,
		NoteMenu,
		ToolbarButton,
		type NoteActionId
	} from '#lib/components/app/index.js';
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

	import { dialogs } from '../dialogs.svelte.js';

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
		inTrash
			? 'Buscar en la papelera'
			: notes.filter.kind === 'all'
				? 'Buscar notas'
				: `Buscar en ${titleOf(notes.filter)}`
	);

	const searching = $derived(!inTrash && app.search.status !== 'idle');
	const resultsLabel = $derived(
		formatCount(app.search.results.length, 'resultado', 'resultados') +
			(app.search.results.length
				? app.search.scope === 'all'
					? ' en todas las notas'
					: ` en ${titleOf(notes.filter)}`
				: '')
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
		if (notes.status === 'ready' && notes.selectedId === null && !searching) notes.selectFirst();
	});

	// Con resultados se abre el primero; sin resultados no hay nota abierta.
	$effect(() => {
		if (!searching) return;
		const results = app.search.results;
		if (!results.length) notes.select(null);
		else if (!results.some((r) => r.note.id === notes.selectedId)) notes.select(results[0].note.id);
	});

	async function runAction(id: NoteActionId, target: Note | null = note) {
		if (!target) return;
		switch (id) {
			case 'pin':
				await notes.togglePin(target.id);
				break;
			case 'move':
				dialogs.open('move', target.id);
				break;
			case 'share':
				dialogs.open('share', target.id);
				break;
			case 'trash':
				dialogs.open('trash', target.id);
				break;
			case 'duplicate': {
				const result = await notes.duplicate(target.id);
				toast[result.ok ? 'success' : 'error'](
					result.ok ? 'Nota duplicada' : 'No se pudo duplicar la nota'
				);
				break;
			}
			case 'rename':
				notes.select(target.id);
				await tick();
				document.querySelector<HTMLInputElement>('[data-title-input]')?.select();
				break;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'F2' && !inTrash) {
			e.preventDefault();
			void runAction('rename');
			return;
		}
		const typing = (e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable]');
		if (e.key === 'Delete' && !typing && !inTrash) {
			void runAction('trash');
			return;
		}
		if (!(e.ctrlKey || e.metaKey)) return;
		const key = e.key.toLowerCase();
		const shortcuts: Record<string, NoteActionId> = { p: 'pin', m: 'move', d: 'duplicate' };
		if (inTrash) {
			// En la papelera solo se busca.
		} else if (key === 's' && e.shiftKey) {
			e.preventDefault();
			void runAction('share');
		} else if (shortcuts[key] && !e.shiftKey) {
			e.preventDefault();
			void runAction(shortcuts[key]);
		}
		if (e.key.toLowerCase() === 'n' && !inTrash) {
			e.preventDefault();
			void notes.create();
		} else if (e.key.toLowerCase() === 'k') {
			e.preventDefault();
			document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
		}
	}

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
	{#snippet item()}
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

	{#if inTrash}
		{@render item()}
	{:else}
		<NoteMenu variant="context" pinned={n.pinned} onaction={(id) => runAction(id, n)}>
			{@render item()}
		</NoteMenu>
	{/if}
{/snippet}

<!-- Lista de notas: 336 px -->
<section
	class="flex w-84 shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-card px-3 py-4 *:shrink-0"
	aria-label="Lista de notas"
>
	<header class="flex items-center pr-0.5 pb-3 pl-1.5">
		<div class="flex-1">
			<h1 class="text-2xl leading-tight font-bold">
				{searching ? 'Resultados' : titleOf(notes.filter)}
			</h1>
			<p class="text-caption font-medium text-muted-foreground">
				{searching ? resultsLabel : formatCount(notes.visible.length, 'nota', 'notas')}
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
				data-search-input
				{placeholder}
				class="min-w-0 flex-1 bg-transparent outline-none placeholder:text-tertiary"
			/>
		{/if}
		{#if searching}
			<button
				type="button"
				aria-label="Borrar búsqueda"
				onclick={() => app.search.clear()}
				class="grid shrink-0 place-content-center text-tertiary hover:text-foreground"
			>
				<AppIcon name="close" size={16} />
			</button>
		{:else}
			<kbd class="shrink-0 text-micro font-medium text-tertiary">Ctrl K</kbd>
		{/if}
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
	{:else if searching}
		{#each app.search.results as { note: n } (n.id)}
			{@render card(n)}
		{:else}
			<EmptyState
				icon="search"
				title="Sin resultados"
				description="No encontramos notas con “{app.search.trimmed}”."
			>
				<Button variant="outline" onclick={() => app.search.clear()}>Borrar búsqueda</Button>
			</EmptyState>
		{/each}
	{:else if notes.groups.length === 0}
		{#if notes.isFirstTime}
			<EmptyState
				icon="notes"
				title="Aún no tienes notas"
				description="Tus notas aparecerán aquí."
			/>
		{:else if notes.filter.kind === 'folder'}
			<EmptyState
				icon="folder"
				title="Esta carpeta está vacía"
				description="Crea una nota nueva o mueve aquí notas de otras carpetas."
			>
				<Button onclick={() => notes.create()}>Nueva nota</Button>
			</EmptyState>
		{:else}
			<p class="px-2 pt-6 text-label text-muted-foreground">No hay notas en esta lista.</p>
		{/if}
	{:else}
		{#each notes.groups as group (group.key)}
			<h2 class="px-3.5 pt-4 pb-1.5 text-caption font-semibold text-muted-foreground">
				{group.label}
			</h2>
			{#each group.notes as n (n.id)}
				{@render card(n)}
			{/each}
		{/each}
	{/if}
</section>

<svelte:window onkeydown={onKeydown} />

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
				data-title-input
				value={note.title}
				placeholder="Sin título"
				oninput={(e) => saveTitle(note.id, e.currentTarget.value)}
				class="mb-3.5 w-full bg-transparent text-4xl leading-[42px] font-bold outline-none placeholder:text-tertiary"
			/>
		{/snippet}

		{#snippet actions()}
			<ToolbarButton icon="share" label="Compartir" onclick={() => runAction('share')} />
			<NoteMenu variant="dropdown" pinned={note.pinned} onaction={(id) => runAction(id)} />
		{/snippet}

		{#key note.id}
			<NoteEditor
				content={note.content}
				class="px-20 pt-10 pb-8"
				{header}
				{actions}
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
		{#if notes.isFirstTime}
			<EmptyState
				title="Bienvenido a Apunte"
				description="Escribe tu primera nota. Se guarda sola y se sincroniza con tus otros dispositivos."
				hint="Ctrl N"
			>
				{#snippet mark()}
					<span
						class="grid size-22 place-content-center rounded-[22px] bg-primary text-[40px] font-bold text-primary-foreground"
						aria-hidden="true">A</span
					>
				{/snippet}
				<Button size="default" onclick={() => notes.create()}>Crear mi primera nota</Button>
			</EmptyState>
		{:else}
			<EmptyState
				icon="notes"
				title={inTrash ? 'Ninguna nota seleccionada' : 'Ninguna nota seleccionada'}
				description={inTrash
					? 'Elige una nota de la papelera para verla.'
					: 'Elige una nota de la lista o crea una nueva.'}
				hint={inTrash ? undefined : 'Ctrl N · Nueva nota'}
			/>
		{/if}
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
