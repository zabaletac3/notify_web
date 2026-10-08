import { untrack } from 'svelte';
import { DEFAULT_KDF, LIGHT_KDF, importMasterKeyRaw } from '#lib/core/crypto/index.js';
import {
	DEMO_MASTER_KEY_RAW,
	DEMO_USER_ID,
	DeviceKeyStore,
	createLocalBackend,
	createSessionChannel,
	createMockBackend,
	type Dataset,
	type LocalBackend,
	type MockBackend
} from '#lib/data/index.js';
import { AuthState } from '#lib/features/auth/index.js';
import { FoldersState } from '#lib/features/folders/index.js';
import { NotesState } from '#lib/features/notes/index.js';
import { SearchState } from '#lib/features/search/index.js';
import { DevicesState, SettingsState } from '#lib/features/settings/index.js';
import { ShareState } from '#lib/features/share/index.js';
import { StorageState } from '#lib/features/storage/index.js';
import { SyncState } from '#lib/features/sync/index.js';
import { VaultState } from '#lib/features/vault/index.js';

/** Cada cuántos ms se sincroniza sola tras un cambio (agrupa ediciones seguidas). */
export const AUTO_SYNC_DELAY_MS = 2500;
/** Cada cuántos ms se consultan cambios de otros dispositivos con la app abierta. */
export const AUTO_SYNC_POLL_MS = 60_000;

export interface AppOptions {
	/**
	 * Dónde viven las notas: `memory` (todo en el simulador, sin guardar) o `indexeddb`
	 * (copia local en el navegador que se sincroniza con el servidor).
	 */
	persistence?: 'memory' | 'indexeddb';
	/** Nombre de la base IndexedDB (solo con `persistence: 'indexeddb'`). */
	dbName?: string;
	/**
	 * Parámetros de Argon2id para contraseñas nuevas. Por defecto, los de producción en el build final
	 * y unos ligeros en desarrollo y pruebas.
	 */
	kdf?: { alg: 'argon2id'; memoryKiB: number; iterations: number; parallelism: number };
	/** Bloquear sola por inactividad o al ocultar la pestaña (según los ajustes de privacidad). */
	autoLock?: boolean;
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
	storage: StorageState;
	sync: SyncState;
	vault: VaultState;
	/** Simulador de escenarios (ver `data/mock/scenario.svelte.ts`). */
	scenario: MockBackend['scenario'];
	backend: MockBackend | LocalBackend;
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
	const persistence = options.persistence ?? 'memory';
	const startAuthenticated = options.startAuthenticated ?? true;
	const backend: MockBackend | LocalBackend =
		options.backend ??
		(persistence === 'indexeddb'
			? createLocalBackend({ now, startAuthenticated, dbName: options.dbName })
			: createMockBackend({ now, startAuthenticated }));
	const local = (backend as Partial<LocalBackend>).local ?? null;
	if (options.latencyMs !== undefined) backend.scenario.latencyMs = options.latencyMs;
	const { repos, scenario } = backend;

	// Estados que se actualizan al cerrar sesión: se declaran antes para poder referirlos en los ganchos.
	// eslint-disable-next-line prefer-const -- se asigna más abajo, tras crear los estados
	let sync: SyncState;
	const refreshPending = () => void sync.refresh();

	// Al cerrar sesión en una pestaña se avisa a las demás (sin rebote: lo recibido no se vuelve a emitir).
	let applyingRemote = false;
	const channel = local
		? createSessionChannel((message) => {
				if (message.type !== 'signed-out' || message.userId !== (local.userId ?? message.userId))
					return;
				applyingRemote = true;
				void auth.endSession('signed-out-elsewhere').finally(() => (applyingRemote = false));
			})
		: null;

	const vault = new VaultState(
		new DeviceKeyStore(options.dbName ? `${options.dbName}-keys` : 'apunte-keys')
	);

	const auth = new AuthState(repos.auth, now, {
		vault,
		kdf: options.kdf ?? (import.meta.env.PROD ? DEFAULT_KDF : LIGHT_KDF),
		// Con "bloquear al salir" activado la clave no se guarda en el dispositivo.
		rememberDevice: () => !settings.values.lockOnExit,
		// Al salir, la copia local se borra (los datos siguen en el servidor).
		onSignedOut: async () => {
			const userId = local?.userId ?? null;
			// Primero se vacía lo que la pantalla tiene en memoria; después se borra la base.
			notes.reset();
			folders.reset();
			await local?.destroy();
			void sync.refresh();
			if (!applyingRemote) channel?.post({ type: 'signed-out', userId });
		}
	});
	const notes = new NotesState(repos.notes, now, refreshPending);
	const folders = new FoldersState(repos.folders, () => notes.refresh(), refreshPending);
	const search = new SearchState(notes);
	const settings = new SettingsState(repos.settings);
	const devices = new DevicesState(repos.devices, () => auth.markExpired());
	const share = new ShareState(repos.share, () => auth.markExpired());
	const storage = new StorageState(repos.storage);
	sync = new SyncState(repos.sync, {
		onSynced: async () => {
			await Promise.all([notes.refresh(), folders.refresh()]);
		},
		onSessionExpired: () => auth.markExpired(),
		// Este dispositivo se eliminó desde otro: se borra la copia local y se cierra la sesión.
		onDeviceRevoked: () => void auth.endSession('device-revoked')
	});

	/** Carga los datos. En el primer arranque de un dispositivo, antes descarga todo del servidor. */
	let loading: Promise<void> | null = null;
	const loadData = () => (loading ??= doLoadData().finally(() => (loading = null)));
	async function doLoadData() {
		// Cada cuenta tiene su propia base local; sin sesión no se abre ninguna.
		if (local && auth.user) await local.open(auth.user.id);
		await sync.refresh();
		if (local && !local.userId) return;
		if (local && auth.isAuthenticated && !sync.snapshot.lastSyncedAt) await sync.syncNow();
		await Promise.all([settings.load(), folders.load(), notes.load()]);
	}

	async function bootstrap() {
		await auth.bootstrap();
		// La sesión de ejemplo del simulador arranca ya desbloqueada (tiene la clave maestra de ejemplo).
		if (startAuthenticated && auth.user?.id === DEMO_USER_ID && vault.status !== 'unlocked')
			await vault.unlock(DEMO_USER_ID, await importMasterKeyRaw(DEMO_MASTER_KEY_RAW), false);
		await loadData();
	}

	async function resetData(dataset?: Dataset) {
		if (dataset) scenario.dataset = dataset;
		await local?.clear();
		backend.db.reset();
		notes.setFilter({ kind: 'all' });
		notes.select(null);
		await bootstrap();
	}

	// Cuando cambian la conectividad o la sesión en el simulador, el estado lo refleja al instante.
	let autoSyncTimer: ReturnType<typeof setTimeout> | undefined;
	let pollTimer: ReturnType<typeof setInterval> | undefined;
	const onOnline = () => void sync.syncNow();
	if (local && typeof window !== 'undefined') {
		window.addEventListener('online', onOnline);
		pollTimer = setInterval(() => {
			if (settings.values.autoSync && auth.isAuthenticated && sync.phase === 'idle')
				void sync.syncNow();
		}, AUTO_SYNC_POLL_MS);
	}

	// Bloqueo automático: tras un rato sin actividad, o al ocultar la pestaña si se eligió "inmediatamente".
	const LOCK_AFTER_MS = { immediately: 0, '1m': 60_000, '5m': 300_000, '15m': 900_000 } as const;
	let lockTimer: ReturnType<typeof setTimeout> | undefined;
	const armLock = () => {
		clearTimeout(lockTimer);
		const after = LOCK_AFTER_MS[settings.values.lockTimeout];
		if (!auth.isAuthenticated || vault.status !== 'unlocked' || after === 0) return;
		lockTimer = setTimeout(() => vault.lock(), after);
	};
	const onActivity = () => armLock();
	const onVisibility = () => {
		if (document.hidden && settings.values.lockTimeout === 'immediately' && auth.isAuthenticated)
			vault.lock();
	};
	const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
	if (options.autoLock && typeof window !== 'undefined') {
		for (const type of ACTIVITY) window.addEventListener(type, onActivity, { passive: true });
		document.addEventListener('visibilitychange', onVisibility);
	}

	const stop = $effect.root(() => {
		// Al desbloquear (o cambiar el ajuste) se vuelve a contar el tiempo de inactividad.
		$effect(() => {
			void vault.status;
			void settings.values.lockTimeout;
			void auth.isAuthenticated;
			if (options.autoLock) untrack(armLock);
		});

		// Tras un cambio local, se sincroniza sola a los pocos segundos (si está activado y hay red).
		$effect(() => {
			const pending = sync.snapshot.pendingCount;
			const ready = settings.values.autoSync && auth.isAuthenticated && sync.phase === 'idle';
			untrack(() => {
				clearTimeout(autoSyncTimer);
				if (local && ready && pending > 0)
					autoSyncTimer = setTimeout(() => void sync.syncNow(), AUTO_SYNC_DELAY_MS);
			});
		});

		// Al bloquear, se vacía lo que hay en memoria; al desbloquear de nuevo, se vuelve a cargar.
		let wasUnlocked = vault.status === 'unlocked';
		$effect(() => {
			const unlocked = vault.status === 'unlocked';
			untrack(() => {
				if (wasUnlocked && !unlocked) {
					notes.reset();
					folders.reset();
					void sync.refresh();
				}
				if (!wasUnlocked && unlocked && auth.isAuthenticated && notes.status === 'idle')
					void loadData();
				wasUnlocked = unlocked;
			});
		});

		// Al iniciar sesión de nuevo (la copia local se borró al salir) se vuelven a cargar los datos.
		let wasAuthenticated = auth.isAuthenticated;
		$effect(() => {
			const authenticated = auth.isAuthenticated;
			untrack(() => {
				if (authenticated && !wasAuthenticated) void loadData();
				wasAuthenticated = authenticated;
			});
		});

		$effect(() => {
			void scenario.offline;
			void scenario.serverError;
			void scenario.sessionExpired;
			void scenario.deviceRevoked;
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
		storage,
		sync,
		vault,
		scenario,
		backend,
		bootstrap,
		resetData,
		destroy: () => {
			clearTimeout(autoSyncTimer);
			clearTimeout(lockTimer);
			clearInterval(pollTimer);
			if (options.autoLock && typeof window !== 'undefined') {
				for (const type of ACTIVITY) window.removeEventListener(type, onActivity);
				document.removeEventListener('visibilitychange', onVisibility);
			}
			if (local && typeof window !== 'undefined') window.removeEventListener('online', onOnline);
			channel?.close();
			stop();
		}
	};
}
