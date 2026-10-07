import { untrack } from 'svelte';
import { createMockBackend, type Dataset, type MockBackend } from '#lib/data/index.js';
import { AuthState } from '#lib/features/auth/index.js';
import { FoldersState } from '#lib/features/folders/index.js';
import { NotesState } from '#lib/features/notes/index.js';
import { SearchState } from '#lib/features/search/index.js';
import { DevicesState, SettingsState } from '#lib/features/settings/index.js';
import { ShareState } from '#lib/features/share/index.js';
import { SyncState } from '#lib/features/sync/index.js';

export interface AppOptions {
	/** Backend simulado a usar (por defecto uno nuevo). */
	backend?: MockBackend;
	/** Reloj inyectable (pruebas). */
	now?: () => Date;
	/** Latencia simulada en ms. Alta (≈3000) permite ver los skeletons de carga. */
	latencyMs?: number;
	/** Empezar con sesión iniciada (por defecto sí). */
	startAuthenticated?: boolean;
}

/** Todo el estado de la aplicación, ya conectado entre sí. Se crea una vez en el layout raíz. */
export interface App {
	auth: AuthState;
	notes: NotesState;
	folders: FoldersState;
	search: SearchState;
	settings: SettingsState;
	devices: DevicesState;
	share: ShareState;
	sync: SyncState;
	/** Simulador de escenarios (ver `data/mock/scenario.svelte.ts`). */
	scenario: MockBackend['scenario'];
	backend: MockBackend;
	/** Carga sesión, ajustes, carpetas, notas y estado de sincronización. */
	bootstrap(): Promise<void>;
	/** Restablece los datos de ejemplo (opcionalmente con otro dataset) y recarga todo. */
	resetData(dataset?: Dataset): Promise<void>;
	/** Libera los efectos internos. */
	destroy(): void;
}

/**
 * Raíz de composición: instancia repositorios y estados y los conecta.
 * Hoy los repositorios son los simulados; cuando existan los reales (IndexedDB, API)
 * solo cambia esta función.
 */
export function createApp(options: AppOptions = {}): App {
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- fábrica del reloj, no es estado
	const now = options.now ?? (() => new Date());
	const backend =
		options.backend ??
		createMockBackend({ now, startAuthenticated: options.startAuthenticated ?? true });
	if (options.latencyMs !== undefined) backend.scenario.latencyMs = options.latencyMs;
	const { repos, scenario } = backend;

	const auth = new AuthState(repos.auth, now);
	const notes = new NotesState(repos.notes, now);
	const folders = new FoldersState(repos.folders, () => notes.refresh());
	const search = new SearchState(notes);
	const settings = new SettingsState(repos.settings);
	const devices = new DevicesState(repos.devices, () => auth.markExpired());
	const share = new ShareState(repos.share, () => auth.markExpired());
	const sync = new SyncState(repos.sync, {
		onSynced: () => notes.refresh(),
		onSessionExpired: () => auth.markExpired()
	});

	async function bootstrap() {
		await Promise.all([
			auth.bootstrap(),
			settings.load(),
			folders.load(),
			notes.load(),
			sync.refresh()
		]);
	}

	async function resetData(dataset?: Dataset) {
		if (dataset) scenario.dataset = dataset;
		backend.db.reset();
		notes.setFilter({ kind: 'all' });
		notes.select(null);
		await bootstrap();
	}

	// Cuando cambian la conectividad o la sesión en el simulador, el estado lo refleja al instante.
	const stop = $effect.root(() => {
		$effect(() => {
			void scenario.offline;
			void scenario.serverError;
			void scenario.sessionExpired;
			untrack(() => {
				void sync.refresh();
				void auth.bootstrap();
			});
		});
	});

	return {
		auth,
		notes,
		folders,
		search,
		settings,
		devices,
		share,
		sync,
		scenario,
		backend,
		bootstrap,
		resetData,
		destroy: stop
	};
}
