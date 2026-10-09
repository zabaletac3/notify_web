import { untrack } from 'svelte';
import { DEFAULT_KDF, LIGHT_KDF, importMasterKeyRaw } from '#lib/core/crypto/index.js';
import { DEFAULT_SETTINGS, LOCK_TIMEOUT_MS, lockTimeoutExceeded } from '#lib/domain/index.js';
import {
	DEMO_MASTER_KEY_RAW,
	DEMO_USER_ID,
	DeviceKeyStore,
	DevicePrefs,
	TrustedDeviceStore,
	createLocalBackend,
	createSessionChannel,
	describeDevice,
	HttpAuthRepository,
	HttpClient,
	HttpDeviceRepository,
	HttpShareRepository,
	HttpStorageRepository,
	HttpSyncTransport,
	HttpTrustedDeviceRepository,
	LocalStorageSessionMarker,
	LocalStorageTokenStore,
	createMockBackend,
	type Dataset,
	type LocalBackend,
	type MockBackend,
	type SessionMode,
	type TokenStore
} from '#lib/data/index.js';
import { AuthState } from '#lib/features/auth/index.js';
import { FoldersState } from '#lib/features/folders/index.js';
import { NotesState } from '#lib/features/notes/index.js';
import { SearchState } from '#lib/features/search/index.js';
import {
	DevicesState,
	MfaState,
	SettingsState,
	TrustedDevicesState
} from '#lib/features/settings/index.js';
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
	/**
	 * API real. Con esto, la cuenta, los dispositivos, los enlaces, el espacio y la sincronización van al
	 * servidor (las notas siguen en IndexedDB y se sincronizan). Requiere `persistence: 'indexeddb'`.
	 */
	api?: { baseUrl: string; tokens?: TokenStore; fetch?: typeof fetch; sessionMode?: SessionMode };
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
	trustedDevices: TrustedDevicesState;
	mfa: MfaState;
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
	// Con la API real no hay sesión de ejemplo: se empieza sin iniciar sesión.
	const startAuthenticated = options.startAuthenticated ?? !options.api;
	const keysName = options.dbName ? `${options.dbName}-keys` : 'apunte-keys';
	// La mitad local de los dispositivos de confianza vive en la misma base `apunte-keys`.
	const trustedStore = new TrustedDeviceStore(keysName);
	// Se asigna tras crear los repositorios: el cofre lo usa para revocar en el servidor.
	let revokeTrustOnServer: (userId: string, trustId: string) => Promise<void> = async () => {};
	const vault = new VaultState(new DeviceKeyStore(keysName), trustedStore, {
		forgetTrustOnServer: (userId, trustId) => revokeTrustOnServer(userId, trustId)
	});
	// Preferencias que viven en este dispositivo y no se sincronizan (bloqueo). Fuera de la base local:
	// cerrar sesión no las borra; borrar la cuenta sí.
	const devicePrefs = new DevicePrefs();
	const backend: MockBackend | LocalBackend =
		options.backend ??
		(persistence === 'indexeddb'
			? createLocalBackend({
					remote: options.api ? remoteServices(options.api) : undefined,
					now,
					startAuthenticated,
					dbName: options.dbName,
					devicePrefs,
					// Las notas se cifran con la clave de la sesión: bloqueada, no se puede leer ni escribir.
					vault: () => vault.current
				})
			: createMockBackend({ now, startAuthenticated }));
	const local = (backend as Partial<LocalBackend>).local ?? null;
	if (options.latencyMs !== undefined) backend.scenario.latencyMs = options.latencyMs;
	const { repos, scenario } = backend;
	// Mejor esfuerzo: al bloquear u olvidar el dispositivo se intenta revocar la mitad del servidor.
	revokeTrustOnServer = async (_userId, trustId) => {
		try {
			await repos.trustedDevices.remove(trustId);
		} catch {
			// Sin red o ya revocado: el servidor lo purgará solo.
		}
	};

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

	const auth = new AuthState(repos.auth, now, {
		vault,
		kdf: options.kdf ?? (import.meta.env.PROD ? DEFAULT_KDF : LIGHT_KDF),
		// Las preferencias del dispositivo se cargan antes de desbloquear: `rememberDevice` las necesita.
		beforeUnlock: async (userId) => {
			await settings.load(userId);
		},
		// Con "bloquear al salir" activado la clave no se guarda en el dispositivo.
		rememberDevice: () => !settings.values.lockOnExit,
		restoreVault: async (userId) => {
			// En el arranque también se cargan las preferencias en cuanto se conoce la cuenta.
			await settings.load(userId);
			// Si se cerró la pestaña y pasó el tiempo de bloqueo, no se restaura (y se borra la clave).
			if (
				lockTimeoutExceeded(
					settings.values.lockTimeout,
					devicePrefs.readActiveAt(userId),
					now().getTime()
				)
			) {
				await vault.forgetDevice(userId);
			} else if (await vault.restore(userId)) {
				return true;
			}
			// La sesión de ejemplo del simulador arranca ya desbloqueada (tiene la clave maestra de ejemplo).
			if (!startAuthenticated || userId !== DEMO_USER_ID) return false;
			await vault.unlock(userId, await importMasterKeyRaw(DEMO_MASTER_KEY_RAW), false);
			return true;
		},
		// S2: al entrar con Google por primera vez en este dispositivo, el bloqueo arranca desactivado;
		// si no, la app se bloquearía casi siempre y el acceso con Google no serviría de nada.
		applyGooglePrefs: async (userId) => {
			if (devicePrefs.read(userId)) return;
			devicePrefs.write(userId, { ...DEFAULT_SETTINGS, lockOnExit: false, lockTimeout: 'never' });
			await settings.load(userId);
		},
		// Dispositivos de confianza: el servidor (repositorio) más la marca local por cuenta.
		trustedDevices: repos.trustedDevices,
		deviceName: describeDevice,
		readTrustedDevice: (userId) => devicePrefs.readTrust(userId),
		markTrustedDevice: (userId) => devicePrefs.writeTrust(userId),
		clearTrustedDevice: (userId) => devicePrefs.removeTrust(userId),
		// Al salir, la copia local se borra (los datos siguen en el servidor). Las preferencias del
		// dispositivo (bloqueo) no: solo se borran al eliminar la cuenta. La marca de actividad sí se
		// borra (es por sesión) y los ajustes en memoria vuelven a los valores por defecto.
		onSignedOut: async (signedOutUserId) => {
			const userId = signedOutUserId ?? local?.userId ?? null;
			if (userId) devicePrefs.removeActiveAt(userId);
			settings.reset();
			// Primero se vacía lo que la pantalla tiene en memoria; después se borra la base.
			notes.reset();
			folders.reset();
			await local?.destroy();
			void sync.refresh();
			if (!applyingRemote) channel?.post({ type: 'signed-out', userId });
		},
		onAccountDeleted: (userId) => devicePrefs.remove(userId)
	});
	const notes = new NotesState(repos.notes, now, refreshPending, (note) => share.republish(note));
	const folders = new FoldersState(repos.folders, () => notes.refresh(), refreshPending);
	const search = new SearchState(notes);
	const settings = new SettingsState(repos.settings);
	const devices = new DevicesState(repos.devices, () => auth.markExpired());
	const trustedDevices = new TrustedDevicesState(repos.trustedDevices, () => auth.markExpired());
	const mfa = new MfaState(repos.auth, auth, () => auth.markExpired());
	const share = new ShareState(repos.share, vault, {
		getNote: (id) => notes.all.find((n) => n.id === id),
		// La nota tiene que estar en el servidor para poder compartirla.
		beforeCreate: async () => {
			if (local && sync.pendingCount > 0) await sync.syncNow();
		},
		onSessionExpired: () => auth.markExpired()
	});
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
		// Los ajustes no se cifran: se cargan aunque el cofre esté bloqueado.
		await settings.load(auth.user?.id);
		// Bloqueado no se puede descifrar: ni notas ni carpetas ni sincronización (quedarían en error).
		if (auth.isLocked) return;
		if (local && auth.isAuthenticated && !sync.snapshot.lastSyncedAt) await sync.syncNow();
		await Promise.all([folders.load(), notes.load()]);
	}

	async function bootstrap() {
		await auth.bootstrap();
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
	// `never` y `immediately` no arman temporizador: el primero no bloquea nunca y el segundo lo gestiona
	// `onVisibility` (al ocultar la pestaña).
	let lockTimer: ReturnType<typeof setTimeout> | undefined;
	const armLock = () => {
		clearTimeout(lockTimer);
		const after = LOCK_TIMEOUT_MS[settings.values.lockTimeout];
		if (!auth.isAuthenticated || vault.status !== 'unlocked' || typeof after !== 'number') return;
		lockTimer = setTimeout(() => void vault.lock(), after);
	};

	// Última actividad en el dispositivo, para saber al recargar si ya pasó el tiempo de bloqueo.
	// Se escribe como mucho cada 15 s para no castigar `localStorage` con cada tecla.
	const ACTIVITY_PERSIST_MS = 15_000;
	let lastActivitySavedAt = 0;
	/** Última actividad real, en memoria; `null` si aún no hubo ninguna que guardar. */
	let lastActivityAt: number | null = null;
	/** Anota que hay actividad ahora y la guarda si ya pasó el límite de escritura. */
	const saveActivity = () => {
		const userId = vault.userId;
		if (!userId) return;
		const t = now().getTime();
		lastActivityAt = t;
		if (t - lastActivitySavedAt < ACTIVITY_PERSIST_MS) return;
		lastActivitySavedAt = t;
		devicePrefs.writeActiveAt(userId, t);
	};
	/**
	 * Al ocultar o cerrar la pestaña se guarda la última actividad real (no el instante de ocultar:
	 * eso alargaría el plazo), sin esperar al límite de escritura, para que al recargar el dato sea exacto.
	 */
	const flushActivity = () => {
		const userId = vault.userId;
		if (!userId || lastActivityAt === null) return;
		lastActivitySavedAt = lastActivityAt;
		devicePrefs.writeActiveAt(userId, lastActivityAt);
	};

	const onActivity = () => {
		saveActivity();
		armLock();
	};
	const onVisibility = () => {
		if (!document.hidden) return;
		flushActivity();
		if (settings.values.lockTimeout === 'immediately' && auth.isAuthenticated) vault.lock();
	};
	const onPageHide = () => flushActivity();
	const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
	if (options.autoLock && typeof window !== 'undefined') {
		for (const type of ACTIVITY) window.addEventListener(type, onActivity, { passive: true });
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pagehide', onPageHide);
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
				if (!wasUnlocked && unlocked && auth.isAuthenticated) {
					// Queda constancia de que hay actividad reciente (para el bloqueo al recargar).
					saveActivity();
					if (notes.status !== 'ready') void loadData();
				}
				wasUnlocked = unlocked;
			});
		});

		// Al iniciar sesión de nuevo (la copia local se borró al salir) se vuelven a cargar los datos.
		let wasAuthenticated = auth.isAuthenticated;
		$effect(() => {
			const authenticated = auth.isAuthenticated;
			untrack(() => {
				if (authenticated && !wasAuthenticated) {
					// El cofre ya está desbloqueado cuando la sesión pasa a autenticada: queda constancia
					// de la actividad para el bloqueo al recargar.
					saveActivity();
					void loadData();
				}
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
		trustedDevices,
		mfa,
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
			share.dispose();
			clearInterval(pollTimer);
			if (options.autoLock && typeof window !== 'undefined') {
				for (const type of ACTIVITY) window.removeEventListener(type, onActivity);
				document.removeEventListener('visibilitychange', onVisibility);
				window.removeEventListener('pagehide', onPageHide);
			}
			if (local && typeof window !== 'undefined') window.removeEventListener('online', onOnline);
			channel?.close();
			stop();
		}
	};
}

/** Cliente HTTP y repositorios reales para la API. */
function remoteServices(api: NonNullable<AppOptions['api']>) {
	// La web real usa cookie `HttpOnly` (mode `cookie`); `body` queda para escritorio/móvil y pruebas.
	const sessionMode: SessionMode =
		api.sessionMode ?? (import.meta.env.PUBLIC_SESSION_MODE === 'body' ? 'body' : 'cookie');
	const http = new HttpClient({
		baseUrl: api.baseUrl.replace(/\/+$/, ''),
		tokens: api.tokens ?? new LocalStorageTokenStore(),
		sessionMode,
		// Al construirse, el marcador borra los tokens de una instalación anterior (solo esa clave).
		marker: sessionMode === 'cookie' ? new LocalStorageSessionMarker() : undefined,
		fetch: api.fetch
	});
	return {
		auth: new HttpAuthRepository(http),
		devices: new HttpDeviceRepository(http),
		trustedDevices: new HttpTrustedDeviceRepository(http),
		share: new HttpShareRepository(http),
		storage: new HttpStorageRepository(http),
		transport: new HttpSyncTransport(http)
	};
}
