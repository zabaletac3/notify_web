<script lang="ts">
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getApp } from '#lib/app/index.js';
	import {
		AppIcon,
		Banner,
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

	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { dialogs } from '../dialogs.svelte.js';
	import { shell } from '../shell.svelte.js';

	const app = getApp();
	const { notes, folders, settings, sync } = app;

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
		if (shell.split.current && notes.status === 'ready' && notes.selectedId === null && !searching)
			notes.selectFirst();
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
				document.querySelector<HTMLTextAreaElement>('[data-title-input]')?.select();
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
			void newNote();
		} else if (e.key.toLowerCase() === 'k') {
			e.preventDefault();
			document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
		}
	}

	const note = $derived(notes.selected);

	// Sin nota abierta no hay editor al que volver en pantallas estrechas.
	$effect(() => {
		if (!note) shell.editing = false;
	});

	function sheetSubtitle(n: Note) {
		const when = formatNoteDate(n.updatedAt, now);
		const folder = n.folderId ? `${folders.name(n.folderId)} · ` : '';
		return `${folder}${when.includes(':') ? `hoy ${when}` : when.toLowerCase()}`;
	}

	function open(id: string) {
		notes.select(id);
		shell.editing = true;
	}

	async function newNote() {
		const result = await notes.create();
		if (result.ok) shell.editing = true;
	}

	const sortOptions = [
		{ value: 'updated', label: 'Fecha de edición' },
		{ value: 'created', label: 'Fecha de creación' },
		{ value: 'title', label: 'Título' }
	] as const;
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
	let confirmEmpty = $state(false);

	async function emptyTrash() {
		const result = await notes.emptyTrash();
		confirmEmpty = false;
		toast[result.ok ? 'success' : 'error'](
			result.ok ? 'Papelera vaciada' : 'No se pudo vaciar la papelera'
		);
	}

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
			selected={shell.split.current && n.id === notes.selectedId}
			onclick={() => open(n.id)}
		/>
	{/snippet}

	{#if inTrash}
		{@render item()}
	{:else}
		<NoteMenu
			variant="context"
			pinned={n.pinned}
			title={n.title}
			subtitle={sheetSubtitle(n)}
			onaction={(id) => runAction(id, n)}
		>
			{@render item()}
		</NoteMenu>
	{/if}
{/snippet}

<!-- Lista de notas: 336 px -->
<section
	class="flex w-full shrink-0 flex-col gap-0.5 overflow-y-auto bg-card px-3 py-1 *:shrink-0 md:w-84 md:border-r md:py-4 {shell.editing
		? 'max-md:hidden'
		: ''}"
	aria-label="Lista de notas"
>
	<!-- Barra superior (pantallas estrechas) -->
	{#if inTrash}
		<div class="-mx-1 flex items-center gap-1 pt-1 md:hidden">
			<button
				type="button"
				aria-label="Volver a todas las notas"
				onclick={() => notes.setFilter({ kind: 'all' })}
				class="grid size-10 place-content-center rounded-full outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<AppIcon name="arrow-left" size={24} />
			</button>
			<h1 class="flex-1 text-heading font-semibold">Papelera</h1>
			{#if notes.counts.trash}
				<button
					type="button"
					onclick={() => (confirmEmpty = true)}
					class="px-3 text-sm font-semibold text-primary outline-none focus-visible:underline"
				>
					Vaciar
				</button>
			{/if}
		</div>
	{:else}
		<div class="-mx-1 flex items-center gap-1 pt-1 md:hidden">
			<button
				type="button"
				aria-label="Abrir menú"
				onclick={() => (shell.drawerOpen = true)}
				class="grid size-10 place-content-center rounded-full outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<AppIcon name="menu" size={22} />
			</button>
			<button
				type="button"
				onclick={() => (shell.drawerOpen = true)}
				class="flex min-w-0 items-center gap-1.5 pl-1 outline-none"
			>
				<span class="truncate text-xl font-bold"
					>{searching ? 'Resultados' : titleOf(notes.filter)}</span
				>
				<AppIcon name="chevron-down" size={18} class="shrink-0" />
			</button>
			<div class="flex-1"></div>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					aria-label="Ordenar notas"
					class="grid size-10 place-content-center rounded-full outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
				>
					<AppIcon name="more" size={22} />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Label>Ordenar por</DropdownMenu.Label>
					<DropdownMenu.RadioGroup
						value={settings.values.noteOrder}
						onValueChange={(v) =>
							settings.update({ noteOrder: v as (typeof sortOptions)[number]['value'] })}
					>
						{#each sortOptions as option (option.value)}
							<DropdownMenu.RadioItem value={option.value}>{option.label}</DropdownMenu.RadioItem>
						{/each}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	{/if}
	{#if sync.isOffline}
		<div class="-mx-3 mb-2 md:hidden">
			<Banner
				message="Sin conexión. Tus cambios se guardan aquí y se sincronizarán al volver."
				action="Reintentar"
				onaction={() => sync.syncNow()}
			/>
		</div>
	{/if}
	{#if !inTrash && !notes.isFirstTime}
		<p class="pb-3 pl-3 text-label font-medium text-muted-foreground md:hidden">
			{searching
				? formatCount(app.search.results.length, 'resultado', 'resultados')
				: formatCount(notes.visible.length, 'nota', 'notas')}
		</p>
	{/if}

	<!-- Cabecera (≥ 768 px) -->
	<header class="hidden items-center pr-0.5 pb-3 pl-1.5 md:flex">
		<button
			type="button"
			aria-label="Abrir menú"
			onclick={() => (shell.drawerOpen = true)}
			class="mr-2 grid size-9 place-content-center rounded-lg outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
		>
			<AppIcon name="menu" size={20} />
		</button>
		<div class="min-w-0 flex-1">
			<h1 class="truncate text-2xl leading-tight font-bold">
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
				onclick={newNote}
				class="grid size-9 place-content-center rounded-[9px] bg-primary text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<AppIcon name="compose" size={18} />
			</button>
		{/if}
	</header>

	<label
		class="flex h-12 w-full items-center gap-3 rounded-[28px] bg-input-fill px-4.5 text-base {inTrash
			? 'max-md:hidden'
			: ''} md:h-8 md:gap-2 md:rounded-lg md:px-2.5 md:text-label"
	>
		<AppIcon name="search" size={shell.split.current ? 16 : 20} class="shrink-0 text-tertiary" />
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
			<kbd class="hidden shrink-0 text-micro font-medium text-tertiary md:inline">Ctrl K</kbd>
		{/if}
	</label>

	{#if !inTrash && !searching && folders.list.length}
		<div
			class="flex gap-2 overflow-x-auto pt-3.5 pb-1.5 pl-0.5 *:shrink-0 md:hidden"
			role="tablist"
			aria-label="Carpetas"
		>
			{#each [{ id: null as string | null, name: 'Todas' }, ...folders.list] as chip (chip.id)}
				{@const current =
					chip.id === null
						? notes.filter.kind === 'all'
						: notes.filter.kind === 'folder' && notes.filter.folderId === chip.id}
				<button
					type="button"
					role="tab"
					aria-selected={current}
					onclick={() =>
						notes.setFilter(
							chip.id === null ? { kind: 'all' } : { kind: 'folder', folderId: chip.id }
						)}
					class="flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 {current
						? 'bg-accent font-semibold text-accent-foreground'
						: 'border font-medium text-muted-foreground'}"
				>
					{#if current && chip.id !== null}<AppIcon name="folder" size={15} />{/if}
					{chip.name}
				</button>
			{/each}
		</div>
	{/if}

	{#if inTrash}
		<p class="mt-2 rounded-xl bg-accent px-3.5 py-3 text-label leading-[19px]" role="note">
			Las notas {shell.split.current ? '' : 'de la papelera '}se eliminan definitivamente después de {TRASH_RETENTION_DAYS}
			días.
		</p>
	{/if}

	{#if notes.status === 'loading' || notes.status === 'idle'}
		<Skeleton class="mt-4 mb-2.5 ml-3.5 h-3 w-[70px]" />
		{#each [0, 1, 2, 3, 4] as i (i)}
			<div class="flex h-23 flex-col gap-2 px-3.5 py-3" aria-hidden="true">
				<Skeleton class="h-3.5 w-[55%]" />
				<Skeleton class="h-2.5 w-[97%]" />
				<Skeleton class="h-2.5 w-[70%]" />
				<Skeleton class="h-2.5 w-[70px]" />
			</div>
		{/each}
	{:else if notes.status === 'error'}
		<EmptyState
			title="No pudimos conectar con el servidor"
			description="Algo falló de nuestro lado. Tus notas están a salvo en este dispositivo. Inténtalo de nuevo en unos minutos."
			hint={notes.error?.kind === 'server' && notes.error.status
				? `Código de error ${notes.error.status}`
				: undefined}
		>
			{#snippet mark()}
				<span
					class="grid size-20 place-content-center rounded-full bg-destructive-soft text-[40px] font-bold text-destructive"
					aria-hidden="true">!</span
				>
			{/snippet}
			<Button onclick={() => notes.load()}>Reintentar</Button>
		</EmptyState>
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
				description="No encontramos notas con “{app.search.trimmed}”.{shell.split.current
					? ''
					: ' Revisa la ortografía o prueba con otra palabra.'}"
			>
				<Button variant="outline" onclick={() => app.search.clear()}>Borrar búsqueda</Button>
			</EmptyState>
		{/each}
	{:else if notes.groups.length === 0}
		{#if notes.isFirstTime}
			<div class="hidden min-h-0 flex-1 md:flex">
				<EmptyState
					icon="notes"
					title="Aún no tienes notas"
					description="Tus notas aparecerán aquí."
				/>
			</div>
			<div class="flex min-h-0 flex-1 md:hidden">
				<EmptyState
					title="Bienvenido a Apunte"
					description="Aquí vivirán tus apuntes, listas y ideas. Escribe tu primera nota para empezar."
				>
					{#snippet mark()}
						<span
							class="grid size-22 place-content-center rounded-[22px] bg-primary text-[40px] font-bold text-primary-foreground"
							aria-hidden="true">A</span
						>
					{/snippet}
					<Button onclick={newNote}>Crear mi primera nota</Button>
				</EmptyState>
			</div>
		{:else if notes.filter.kind === 'folder'}
			<EmptyState
				icon="folder"
				title="Esta carpeta está vacía"
				description="Crea una nota nueva o mueve aquí notas de otras carpetas."
			>
				<Button onclick={newNote}>Nueva nota</Button>
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

{#if !inTrash && !shell.editing && !searching && notes.visible.length > 0}
	<button
		type="button"
		onclick={newNote}
		class="fixed right-4 bottom-4 z-10 flex h-13.5 items-center gap-2.5 rounded-[18px] bg-primary pr-5.5 pl-4.5 text-body font-semibold text-primary-foreground shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
	>
		<AppIcon name="compose" size={22} /> Nueva nota
	</button>
{/if}

<svelte:window onkeydown={onKeydown} />

<!-- Editor -->
<main class="flex min-w-0 flex-1 flex-col bg-background {shell.editing ? '' : 'max-md:hidden'}">
	{#if sync.isOffline}
		<Banner
			message="Sin conexión. Tus cambios se guardan en este equipo y se sincronizarán al volver."
			action="Reintentar"
			onaction={() => sync.syncNow()}
		/>
	{/if}
	{#if notes.status === 'loading' || notes.status === 'idle'}
		<div
			class="flex flex-1 flex-col gap-3.5 overflow-hidden px-6 pt-10 md:px-20"
			aria-hidden="true"
		>
			<Skeleton class="h-3 w-45" />
			<Skeleton class="h-7.5 w-95 rounded-lg" />
			<Skeleton class="h-3 w-133.5" />
			<Skeleton class="h-3 w-130" />
			<Skeleton class="h-3 w-125" />
			<Skeleton class="h-3 w-133.5" />
			<Skeleton class="h-3 w-75" />
			<Skeleton class="mt-2 h-5.5 w-50" />
			<Skeleton class="h-3 w-120" />
			<Skeleton class="h-3 w-105" />
			<Skeleton class="h-3 w-115" />
		</div>
	{:else if note && note.deletedAt}
		<!-- Nota en la papelera: solo lectura, con avisos y acciones -->
		<div class="px-2 py-1 md:hidden">
			<button
				type="button"
				aria-label="Volver a la lista"
				onclick={() => (shell.editing = false)}
				class="grid size-10 place-content-center rounded-full outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<AppIcon name="arrow-left" size={22} />
			</button>
		</div>
		<div class="flex flex-1 flex-col gap-5 overflow-y-auto px-6 pt-3 pb-8 md:px-12 md:pt-8">
			<div class="flex flex-wrap items-center gap-3 rounded-xl bg-accent px-4 py-3.5" role="note">
				<p class="min-w-48 flex-1 text-sm font-medium">
					Esta nota está en la papelera. Se eliminará definitivamente en {formatCount(
						daysUntilPurge(note.deletedAt, now, TRASH_RETENTION_DAYS),
						'día',
						'días'
					)}.
				</p>
				<Button onclick={() => restore(note)}>Restaurar</Button>
				<Button variant="outline" onclick={() => (confirmDelete = true)}>Eliminar ahora</Button>
			</div>
			<h1 class="text-title font-bold text-muted-foreground md:text-3xl md:leading-[38px]">
				{note.title}
			</h1>
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
			<textarea
				aria-label="Título"
				data-title-input
				rows="1"
				value={note.title}
				placeholder="Sin título"
				oninput={(e) => saveTitle(note.id, e.currentTarget.value.replace(/\n/g, ' '))}
				onkeydown={(e) => e.key === 'Enter' && e.preventDefault()}
				class="mb-3.5 field-sizing-content w-full resize-none bg-transparent text-title font-bold outline-none placeholder:text-tertiary md:text-4xl md:leading-[42px]"
			></textarea>
		{/snippet}

		{#snippet mobileBar({ undo }: { undo: () => void })}
			<div class="flex items-center gap-0.5 px-2 py-1">
				<button
					type="button"
					aria-label="Volver a la lista"
					onclick={() => (shell.editing = false)}
					class="grid size-10 place-content-center rounded-full outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
				>
					<AppIcon name="arrow-left" size={22} />
				</button>
				{#if folderName}
					<span class="flex min-w-0 items-center gap-1.5 pl-1 text-sm font-semibold text-primary">
						<AppIcon name="folder" size={16} class="shrink-0" />
						<span class="truncate">{folderName}</span>
					</span>
				{/if}
				<div class="flex-1"></div>
				<ToolbarButton size="lg" icon="undo" label="Deshacer" onclick={undo} />
				<ToolbarButton
					size="lg"
					icon="share"
					label="Compartir"
					onclick={() => runAction('share')}
				/>
				<NoteMenu
					variant="dropdown"
					size="lg"
					pinned={note.pinned}
					title={note.title}
					subtitle={sheetSubtitle(note)}
					onaction={(id) => runAction(id)}
				/>
			</div>
		{/snippet}

		{#snippet actions()}
			<ToolbarButton icon="share" label="Compartir" onclick={() => runAction('share')} />
			<NoteMenu variant="dropdown" pinned={note.pinned} onaction={(id) => runAction(id)} />
		{/snippet}

		{#key note.id}
			<NoteEditor
				content={note.content}
				class="px-6 pt-3 pb-24 md:px-20 md:pt-10 md:pb-8"
				{header}
				{actions}
				{mobileBar}
				onchange={(md) => notes.update(note.id, { content: md })}
			/>
		{/key}

		{#if note.tags.length}
			<ul class="flex gap-2 px-6 pb-2 md:px-20">
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
			class="hidden items-center justify-end gap-2 px-6 pt-2 pb-2.5 text-caption font-medium text-tertiary md:flex"
		>
			<span class="size-1.5 rounded-full bg-primary"></span>
			{#if sync.isOffline}
				Guardado en este equipo · sin sincronizar
			{:else}
				{note.syncStatus === 'pending' ? 'Guardando' : 'Guardado'} · {formatCount(
					countWords(note.content),
					'palabra',
					'palabras'
				)}
			{/if}
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
				<Button size="default" onclick={newNote}>Crear mi primera nota</Button>
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

<AlertDialog.Root bind:open={confirmEmpty}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>¿Vaciar la papelera?</AlertDialog.Title>
			<AlertDialog.Description>
				Se eliminarán definitivamente {notes.counts.trash} notas. No podrás recuperarlas.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={emptyTrash}>Vaciar</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
