import { createMockBackend, type MockBackend } from '../mock/create-mock-repositories.js';
import { MockSyncServer } from '../mock/mock-sync-server.js';
import { DEMO_DEVICE_ID } from '../mock/fixtures/index.js';
import type { MockDatabase, MockDatabaseOptions } from '../mock/mock-database.js';
import { ApunteDb } from './apunte-db.js';
import type { DataGate } from './gate.js';
import { LocalFolderRepository } from './local-folder-repository.js';
import { LocalNoteRepository } from './local-note-repository.js';
import { LocalSettingsRepository } from './local-settings-repository.js';
import { LocalSyncRepository } from './local-sync-repository.js';

export interface LocalBackendOptions extends MockDatabaseOptions {
	/** Nombre de la base IndexedDB (distinto por dispositivo en las pruebas). */
	dbName?: string;
	/** Servidor compartido: permite simular varios dispositivos contra el mismo servidor. */
	server?: MockDatabase;
	/** Este dispositivo (por defecto, el "actual" del simulador). */
	device?: { id: string; name: string };
}

export interface LocalBackend extends MockBackend {
	local: {
		db: ApunteDb;
		sync: LocalSyncRepository;
		server: MockSyncServer;
		/** Borra la copia local (al cerrar sesión o al cambiar de datos de ejemplo). */
		clear(): Promise<void>;
	};
}

/**
 * Backend "offline-first": notas, carpetas y ajustes viven en IndexedDB y se sincronizan con un
 * servidor simulado. Cuenta, dispositivos, enlaces y almacenamiento siguen siendo del simulador.
 */
export function createLocalBackend(options: LocalBackendOptions = {}): LocalBackend {
	const mock = createMockBackend({ ...options, database: options.server });
	const serverDb = mock.db;
	const scenario = serverDb.scenario;
	const db = new ApunteDb(options.dbName ?? 'apunte');

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
	const deps = { db, now: serverDb.now, deviceId: device.id, gate };
	const server = new MockSyncServer(serverDb);

	const notes = new LocalNoteRepository(deps);
	const sync = new LocalSyncRepository({
		db,
		transport: server,
		now: serverDb.now,
		device,
		gate,
		connectivity: () => (scenario.offline ? 'offline' : scenario.serverError ? 'error' : 'online'),
		// "Conflicto en la próxima sincronización": otro dispositivo edita la nota y aquí también.
		beforeSync: async () => {
			if (!scenario.injectConflict) return;
			scenario.injectConflict = false;
			const target = (await notes.list()).find((n) => n.revision > 0 && !n.deletedAt);
			if (!target || !server.simulateRemoteEdit(target.id)) return;
			await notes.update(target.id, { content: `${target.content}\n\nEditado aquí sin conexión.` });
		}
	});

	return {
		...mock,
		repos: {
			...mock.repos,
			notes,
			folders: new LocalFolderRepository(deps),
			settings: new LocalSettingsRepository(deps),
			sync
		},
		local: { db, sync, server, clear: () => db.clearAll() }
	};
}
