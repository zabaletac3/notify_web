import { defineConfig } from '@playwright/test';

/**
 * Pruebas e2e contra la API REAL (Go + PostgreSQL): `pnpm e2e:http`.
 * Necesitan el repo `notify_backend` (API_DIR) y un PostgreSQL de pruebas (E2E_PG_ADMIN); ver e2e-http/api.sh.
 */
export default defineConfig({
	testDir: 'e2e-http',
	testMatch: '**/*.e2e.{ts,js}',
	workers: 1,
	fullyParallel: false,
	timeout: 180_000,
	webServer: [
		{
			command: 'bash e2e-http/api.sh',
			url: 'http://localhost:18080/health',
			timeout: 180_000,
			reuseExistingServer: false
		},
		{
			command:
				'PUBLIC_BACKEND=http PUBLIC_API_URL=http://localhost:18080 pnpm build && pnpm preview --port 4174',
			url: 'http://localhost:4174',
			timeout: 300_000,
			reuseExistingServer: false
		}
	],
	use: {
		baseURL: 'http://localhost:4174',
		launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined }
	}
});
