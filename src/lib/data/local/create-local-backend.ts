import { fail } from '#lib/domain/index.js';
import type { Vault } from '../crypto/vault.js';
import type {
	AuthRepository,
	DeviceRepository,
	ShareRepository,
	StorageRepository,
	SyncTransport
} from '../contracts.js';
import { createMockBackend, type MockBackend } from '../mock/create-mock-repositories.js';
import { MockSyncServer } from '../mock/mock-sync-server.js';
import { DEMO_DEVICE_ID } from '../mock/fixtures/index.js';
import type { MockDatabase, MockDatabaseOptions } from '../mock/mock-database.js';
import { ApunteDb } from './apunte-db.js';
import type { DataGate } from './gate.js';
import { Mutex } from './gate.js';
import { LocalCodec } from './local-codec.js';
import { LocalFolderRepository } from './local-folder-repository.js';
import { LocalNoteRepository } from './local-note-repository.js';
import { LocalSettingsRepository } from './local-settings-repository.js';
import { LocalSyncRepository } from './local-sync-repository.js';

/** Servicios reales (API HTTP) que sustituyen a los simulados de cuenta, dispositivos, enlaces, espacio y sincronización. */
export interface RemoteServices {
	auth: AuthRepository;
	devices: DeviceRepository;
	share: ShareRepository;
	storage: StorageRepository;
	transport: SyncTransport;
}

export interface LocalBackendOptions extends MockDatabaseOptions {
	/** Si se indica, la cuenta, los dispositivos, los enlaces y la sincronización van a la API en vez de al simulador. */
	remote?: RemoteServices;
	/** Cofre de claves de la sesión: cifra y descifra las notas y carpetas. Lanza `locked` si está bloqueado. */
	vault: () => Vault;
	/** Prefijo de la base IndexedDB; la de cada cuenta se llama `<prefijo>-<userId>` (distinto por dispositivo en las pruebas). */
	dbName?: string;
	/** Abre ya la base de esta cuenta (si no, se abre con `local.open` tras conocer la sesión). */
	userId?: string;
	/** Servidor compartido: permite simular varios dispositivos contra el mismo servidor. */
	server?: MockDatabase;
	/** Este dispositivo (por defecto, el "actual" del simulador). */
	device?: { id: string; name: string };
}

export interface LocalBackend extends MockBackend {
	local: {
		/** Base de la cuenta abierta. Lanza `session-expired` si no hay ninguna. */
		readonly db: ApunteDb;
		/** Cuenta cuya base está abierta, o `null`. */
		readonly userId: string | null;
		sync: LocalSyncRepository;
		server: MockSyncServer;
		/** Abre la base de esta cuenta (cierra la anterior). Si pertenecía a otra cuenta, se borra y se recrea. */
		open(userId: string): Promise<void>;
		/** Cierra la base sin borrarla (otra pestaña la borró, o se cambia de cuenta). */
		close(): void;
		/** Borra todo el contenido de la base abierta (al cambiar de datos de ejemplo). */
		clear(): Promise<void>;
		/** Borra la base de la cuenta por completo y la cierra (cerrar sesión, dispositivo revocado). */
		destroy(): Promise<void>;
	};
}

/**
 * Backend "offline-first": notas, carpetas y ajustes viven en IndexedDB y se sincronizan con un
 * servidor simulado. Cuenta, dispositivos, enlaces y almacenamiento siguen siendo del simulador.
 */
export function createLocalBackend(options: LocalBackendOptions): LocalBackend {
	const mock = createMockBackend({ ...options, database: options.server });
	const serverDb = mock.db;
	const scenario = serverDb.scenario;
	const prefix = options.dbName ?? 'apunte';
	const dbNameFor = (userId: string) => `${prefix}-${userId}`;
	let holder: { db: ApunteDb; userId: string } | null = null;
	const attach = (userId: string) => {
		holder?.db.close();
		holder = { db: new ApunteDb(dbNameFor(userId)), userId };
	};
	if (options.userId) attach(options.userId);
	// Sin base abierta (sin sesión) nadie puede leer ni escribir: las operaciones fallan como sesión vencida.
	const openDb = () => {
		if (!holder) throw fail.sessionExpired();
		return holder.db;
	};

	const current = serverDb.devices.find((d) => d.current);
	const device = options.device ?? {
		id: current?.id ?? DEMO_DEVICE_ID,
		name: current?.name ?? 'Este dispositivo'
	};

	// Latencia y errores de carga del simulador también valen para la base local.
	const gate: DataGate = {
		read: () => serverDb.local('read'),
		write: () => serverDb.local('write')
	};
	const codec = new LocalCodec(options.vault);
	const lock = new Mutex();
	const deps = {
		get db() {
			return openDb();
		},
		codec,
		lock,
		now: serverDb.now,
		deviceId: device.id,
		gate
	};
	const server = new MockSyncServer(serverDb);

	const notes = new LocalNoteRepository(deps);
	const sync = new LocalSyncRepository({
		get db() {
			return openDb();
		},
		codec,
		lock,
		isOpen: () => holder !== null,
		transport: options.remote?.transport ?? server,
		now: serverDb.now,
		device,
		gate,
		connectivity: () =>
			options.remote
				? typeof navigator !== 'undefined' && navigator.onLine === false
					? 'offline'
					: 'online'
				: scenario.offline
					? 'offline'
					: scenario.serverError
						? 'error'
						: 'online',
		// "Conflicto en la próxima sincronización": otro dispositivo edita la nota y aquí también.
		beforeSync: async () => {
			if (options.remote || !scenario.injectConflict) return;
			scenario.injectConflict = false;
			const target = (await notes.list()).find((n) => n.revision > 0 && !n.deletedAt);
			if (!target || !(await server.simulateRemoteEdit(target.id))) return;
			await notes.update(target.id, { content: `${target.content}\n\nEditado aquí sin conexión.` });
		}
	});

	return {
		...mock,
		repos: {
			...mock.repos,
			...(options.remote
				? {
						auth: options.remote.auth,
						devices: options.remote.devices,
						share: options.remote.share,
						storage: options.remote.storage
					}
				: {}),
			notes,
			folders: new LocalFolderRepository(deps),
			settings: new LocalSettingsRepository(deps),
			sync
		},
		local: {
			get db() {
				return openDb();
			},
			get userId() {
				return holder?.userId ?? null;
			},
			sync,
			server,
			async open(userId) {
				if (holder?.userId === userId) return;
				attach(userId);
				const db = openDb();
				await db.open();
				const owner = await db.getMeta<string>('userId');
				if (owner && owner !== userId) {
					// La base no es de esta cuenta: nunca se reutiliza.
					await db.delete();
					attach(userId);
					await openDb().open();
				}
				await openDb().setMeta('userId', userId);
			},
			close() {
				holder?.db.close();
				holder = null;
				codec.clear();
			},
			clear: async () => {
				// Antes de borrar, se deja terminar lo que se estaba escribiendo.
				await lock.run(async () => {});
				codec.clear();
				if (holder) await holder.db.clearAll();
			},
			async destroy() {
				if (!holder) return;
				await lock.run(async () => {});
				if (!holder) return;
				const { db } = holder;
				holder = null;
				codec.clear();
				await db.delete();
			}
		}
	};
}
