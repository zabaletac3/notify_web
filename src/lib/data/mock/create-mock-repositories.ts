import type { Repositories } from '../contracts.js';
import { MockAuthRepository } from './mock-auth-repository.js';
import { MockDatabase, type MockDatabaseOptions } from './mock-database.js';
import { MockFolderRepository } from './mock-folder-repository.js';
import {
	MockDeviceRepository,
	MockSettingsRepository,
	MockShareRepository,
	MockStorageRepository,
	MockSyncRepository
} from './mock-misc-repositories.js';
import { MockNoteRepository } from './mock-note-repository.js';

export interface MockBackend {
	repos: Repositories;
	db: MockDatabase;
	/** Simulador de escenarios (reactivo). */
	scenario: MockDatabase['scenario'];
}

/** Crea todos los repositorios mock sobre una misma base en memoria. */
export function createMockBackend(
	options: MockDatabaseOptions & { database?: MockDatabase } = {}
): MockBackend {
	const db = options.database ?? new MockDatabase(options);
	return {
		db,
		scenario: db.scenario,
		repos: {
			notes: new MockNoteRepository(db),
			folders: new MockFolderRepository(db),
			auth: new MockAuthRepository(db),
			devices: new MockDeviceRepository(db),
			settings: new MockSettingsRepository(db),
			sync: new MockSyncRepository(db),
			share: new MockShareRepository(db),
			storage: new MockStorageRepository(db)
		}
	};
}
