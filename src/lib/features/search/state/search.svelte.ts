import MiniSearch from 'minisearch';
import { foldText, type Note } from '#lib/domain/index.js';

/** Lo mínimo que necesita la búsqueda de las notas (evita depender de la feature "notes"). */
export interface SearchableNotes {
	active: Note[];
	/** Notas de la lista actual, para buscar solo "en esta carpeta". */
	visible: Note[];
}

export type SearchScope = 'all' | 'current';
export type SearchStatus = 'idle' | 'results' | 'empty';

export interface SearchResult {
	note: Note;
	score: number;
}

type Indexed = Note & { tagsText: string };

/**
 * Búsqueda local de texto completo (título, contenido y etiquetas), sin distinguir tildes
 * ni mayúsculas, con prefijos y tolerancia a errores de tipeo.
 */
export class SearchState {
	query = $state('');
	scope = $state<SearchScope>('all');

	private readonly source: SearchableNotes;

	constructor(source: SearchableNotes) {
		this.source = source;
	}

	/** El índice se reconstruye solo cuando cambian las notas y alguien lo necesita. */
	private index = $derived.by(() => {
		const index = new MiniSearch<Indexed>({
			fields: ['title', 'content', 'tagsText'],
			processTerm: (term) => foldText(term),
			searchOptions: { prefix: true, fuzzy: 0.15, boost: { title: 2 } }
		});
		index.addAll(this.source.active.map((n) => ({ ...n, tagsText: n.tags.join(' ') })));
		return index;
	});

	trimmed = $derived(this.query.trim());

	results: SearchResult[] = $derived.by(() => {
		if (!this.trimmed) return [];
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- estructura temporal dentro de un derivado, no se muta
		const allowed = this.scope === 'current' ? new Set(this.source.visible.map((n) => n.id)) : null;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- estructura temporal dentro de un derivado, no se muta
		const byId = new Map(this.source.active.map((n) => [n.id, n]));
		return this.index
			.search(this.trimmed)
			.filter((r) => !allowed || allowed.has(r.id))
			.flatMap((r) => {
				const note = byId.get(r.id);
				return note ? [{ note, score: r.score }] : [];
			});
	});

	/** Términos encontrados (ya sin tildes), útiles para resaltar en los resultados. */
	terms = $derived(this.trimmed ? foldText(this.trimmed).split(/\s+/).filter(Boolean) : []);

	status: SearchStatus = $derived(
		!this.trimmed ? 'idle' : this.results.length ? 'results' : 'empty'
	);

	clear() {
		this.query = '';
	}
}
