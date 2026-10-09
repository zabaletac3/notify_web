// Implementación en memoria de los repositorios, con datos de ejemplo y simulador de escenarios.
export { createMockBackend, type MockBackend } from './create-mock-repositories.js';
export {
	MockDatabase,
	DEMO_USER_EMAIL,
	DEMO_USER_ID,
	DEMO_USER_PASSWORD,
	RESET_TOKEN,
	type MockDatabaseOptions
} from './mock-database.js';
export { DEMO_KEYS, DEMO_MASTER_KEY_RAW, DEMO_RECOVERY_KEY } from './fixtures/demo-keys.js';
export { createDemoVault } from './demo-vault.js';
export {
	Scenario,
	DEV_LATENCY_MS,
	isGoogleScenario,
	type Dataset,
	type GoogleScenario
} from './scenario.svelte.js';
