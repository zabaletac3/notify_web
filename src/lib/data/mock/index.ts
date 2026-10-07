// Implementación en memoria de los repositorios, con datos de ejemplo y simulador de escenarios.
export { createMockBackend, type MockBackend } from './create-mock-repositories.js';
export {
	MockDatabase,
	DEMO_USER_EMAIL,
	DEMO_USER_PASSWORD,
	RESET_TOKEN,
	type MockDatabaseOptions
} from './mock-database.js';
export { Scenario, DEV_LATENCY_MS, type Dataset } from './scenario.svelte.js';
