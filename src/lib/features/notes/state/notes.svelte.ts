import { attempt, type LoadStatus } from '#lib/core/index.js';
import type { NoteRepository } from '#lib/data/index.js';
import {
	groupNotes,
	succeed,
	type ActionResult,
	type AppError,
	type Id,
	type Note,
	type NoteCounts,
	type NoteDraft,
	type NoteGroup,
	type NoteSort,
	type NotesFilter
} from '#lib/domain/index.js';

const sorters: Record<NoteSort, (a: Note, b: Note) => number> = {
	updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
	created: (a, b) => b.createdAt.localeCompare(a.createdAt),
	title: (a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' })
};

/**
 * Notas del usuario: copia en memoria de todo (activas y papelera) + filtros, orden,
 * selección y acciones. Los conteos y las listas son derivados, así la UI nunca se desincroniza.
 */
export class NotesState {
	/** Todas las notas, incluida la papelera. */
	all = $state<Note[]>([]);
	status = $state<LoadStatus>('idle');
	/** Error de la última carga (pantalla "error de servidor"). */
	error = $state<AppError | null>(null);
	/** Error de la última acción (para un aviso). */
	lastError = $state<AppError | null>(null);

	filter = $state<NotesFilter>({ kind: 'all' });
	sort = $state<NoteSort>('updated');
	selectedId = $state<Id | null>(null);

	private readonly repo: NoteRepository;
	private readonly clock: () => Date;

	private readonly onWrite: () => void;
	private readonly onUpdated: (note: Note) => void;

	/**
	 * @param onWrite se llama tras cada escritura correcta (para actualizar el contador de cambios pendientes)
	 * @param onUpdated se llama con la nota tras editarla (para actualizar la copia de un enlace compartido)
	 */
	constructor(
		repo: NoteRepository,
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- fábrica del reloj, no es estado
		clock: () => Date = () => new Date(),
		onWrite: () => void = () => {},
		onUpdated: (note: Note) => void = () => {}
	) {
		this.repo = repo;
		this.clock = clock;
		this.onWrite = onWrite;
		this.onUpdated = onUpdated;
	}

	active = $derived(this.all.filter((n) => !n.deletedAt));
	trashed = $derived(this.all.filter((n) => n.deletedAt));

	counts: NoteCounts = $derived.by(() => {
		const byFolder: Record<string, number> = {};
		const byTag: Record<string, number> = {};
		let pinned = 0;
		let unfiled = 0;
		for (const n of this.active) {
			if (n.pinned) pinned++;
			if (n.folderId) byFolder[n.folderId] = (byFolder[n.folderId] ?? 0) + 1;
			else unfiled++;
			for (const t of n.tags) byTag[t] = (byTag[t] ?? 0) + 1;
		}
		return {
			all: this.active.length,
			pinned,
			trash: this.trashed.length,
			unfiled,
			byFolder,
			byTag
		};
	});

	/** Etiquetas existentes con su cantidad, ordenadas por nombre. */
	tags = $derived(
		Object.entries(this.counts.byTag)
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => a.name.localeCompare(b.name, 'es'))
	);

	/** Notas de la lista actual, ya filtradas y ordenadas. */
	visible = $derived.by(() => {
		const f = this.filter;
		const source =
			f.kind === 'trash'
				? this.trashed
				: this.active.filter((n) => {
						switch (f.kind) {
							case 'pinned':
								return n.pinned;
							case 'folder':
								return n.folderId === f.folderId;
							case 'tag':
								return n.tags.includes(f.tag);
							default:
								return true;
						}
					});
		return [...source].sort(sorters[this.sort]);
	});

	/** La lista agrupada como en el diseño: Fijadas · Hoy · Esta semana · mes. */
	groups: NoteGroup[] = $derived.by(() =>
		this.filter.kind === 'trash'
			? this.visible.length
				? [{ key: 'trash', label: 'Papelera', notes: this.visible }]
				: []
			: groupNotes(this.visible, this.clock())
	);

	selected = $derived(this.all.find((n) => n.id === this.selectedId) ?? null);

	/** `true` si no hay ninguna nota activa ni en la papelera (cuenta nueva). */
	isFirstTime = $derived(this.status === 'ready' && this.all.length === 0);

	// ─── Carga ────────────────────────────────────────────────────────────────

	async load(): Promise<ActionResult> {
		this.status = 'loading';
		this.error = null;
		const result = await attempt(() =>
			Promise.all([
				this.repo.list({ sort: 'updated' }),
				this.repo.list({ filter: { kind: 'trash' } })
			])
		);
		if (!result.ok) {
			this.status = 'error';
			this.error = result.error;
			return result;
		}
		this.all = [...result.value[0], ...result.value[1]];
		this.status = 'ready';
		if (this.selectedId && !this.all.some((n) => n.id === this.selectedId)) this.selectedId = null;
		return succeed();
	}

	/** Recarga sin mostrar el estado de carga (tras sincronizar, etc.). */
	async refresh(): Promise<void> {
		const result = await attempt(() =>
			Promise.all([
				this.repo.list({ sort: 'updated' }),
				this.repo.list({ filter: { kind: 'trash' } })
			])
		);
		if (result.ok) this.all = [...result.value[0], ...result.value[1]];
	}

	/** Vacía el estado (al cerrar sesión). */
	reset() {
		this.all = [];
		this.status = 'idle';
		this.error = null;
		this.selectedId = null;
		this.filter = { kind: 'all' };
	}

	// ─── Navegación ───────────────────────────────────────────────────────────

	setFilter(filter: NotesFilter) {
		this.filter = filter;
		if (!this.visible.some((n) => n.id === this.selectedId)) this.selectedId = null;
	}

	select(id: Id | null) {
		this.selectedId = id;
	}

	selectFirst() {
		this.selectedId = this.visible[0]?.id ?? null;
	}

	// ─── Acciones ─────────────────────────────────────────────────────────────

	/** Crea una nota en el contexto actual (carpeta o etiqueta que se esté viendo) y la selecciona. */
	async create(draft: NoteDraft = {}): Promise<ActionResult<Note>> {
		const f = this.filter;
		const context: NoteDraft = {
			folderId: f.kind === 'folder' ? f.folderId : undefined,
			tags: f.kind === 'tag' ? [f.tag] : undefined,
			pinned: f.kind === 'pinned' ? true : undefined
		};
		return this.run(async () => {
			const note = await this.repo.create({ ...context, ...draft });
			this.all = [note, ...this.all];
			this.selectedId = note.id;
			return note;
		});
	}

	/**
	 * Crea varias notas de una vez (importación). Cada una es independiente: si una falla, las demás se
	 * crean igual. Devuelve cuántas se crearon y cuántas fallaron. No cambia la nota seleccionada.
	 */
	async importNotes(
		drafts: NoteDraft[]
	): Promise<ActionResult<{ created: number; failed: number }>> {
		return this.run(async () => {
			let failed = 0;
			const created: Note[] = [];
			for (const draft of drafts) {
				try {
					created.push(await this.repo.create(draft));
				} catch {
					failed += 1;
				}
			}
			this.all = [...created, ...this.all];
			return { created: created.length, failed };
		});
	}

	/** Edita una nota. Se refleja al instante (optimista) y se revierte si falla. */
	async update(id: Id, patch: NoteDraft): Promise<ActionResult<Note>> {
		const before = this.all.find((n) => n.id === id);
		if (!before) return { ok: false, error: { kind: 'not-found', entity: 'note' } };
		this.replace({
			...before,
			...patch,
			updatedAt: this.clock().toISOString(),
			syncStatus: 'pending'
		});
		const result = await this.run(() => this.repo.update(id, patch));
		if (result.ok) {
			this.replace(result.value);
			this.onUpdated(result.value);
		} else this.replace(before);
		return result;
	}

	togglePin(id: Id) {
		const note = this.all.find((n) => n.id === id);
		return note ? this.update(id, { pinned: !note.pinned }) : this.missing();
	}

	moveToFolder(id: Id, folderId: Id | null) {
		return this.update(id, { folderId });
	}

	async duplicate(id: Id): Promise<ActionResult<Note>> {
		return this.run(async () => {
			const copy = await this.repo.duplicate(id);
			this.all = [copy, ...this.all];
			this.selectedId = copy.id;
			return copy;
		});
	}

	async moveToTrash(id: Id): Promise<ActionResult<Note>> {
		return this.run(async () => {
			const note = await this.repo.moveToTrash(id);
			this.replace(note);
			if (this.selectedId === id) this.selectedId = null;
			return note;
		});
	}

	async restore(id: Id): Promise<ActionResult<Note>> {
		return this.run(async () => {
			const note = await this.repo.restore(id);
			this.replace(note);
			if (this.selectedId === id && !this.visible.some((n) => n.id === id)) this.selectedId = null;
			return note;
		});
	}

	async deleteForever(id: Id): Promise<ActionResult> {
		return this.run(async () => {
			await this.repo.deleteForever(id);
			this.all = this.all.filter((n) => n.id !== id);
			if (this.selectedId === id) this.selectedId = null;
		});
	}

	async emptyTrash(): Promise<ActionResult<number>> {
		return this.run(async () => {
			const removed = await this.repo.emptyTrash();
			this.all = this.all.filter((n) => !n.deletedAt);
			return removed;
		});
	}

	// ─── Internos ─────────────────────────────────────────────────────────────

	private replace(note: Note) {
		const i = this.all.findIndex((n) => n.id === note.id);
		if (i === -1) this.all = [note, ...this.all];
		else this.all = this.all.map((n) => (n.id === note.id ? note : n));
	}

	private missing(): ActionResult<Note> {
		return { ok: false, error: { kind: 'not-found', entity: 'note' } };
	}

	private async run<T>(action: () => Promise<T>): Promise<ActionResult<T>> {
		this.lastError = null;
		const result = await attempt(action);
		if (!result.ok) this.lastError = result.error;
		else this.onWrite();
		return result;
	}
}
