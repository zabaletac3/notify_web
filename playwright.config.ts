import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: { command: 'pnpm build && pnpm preview', port: 4173 },
	testMatch: '**/*.e2e.{ts,js}',
	use: {
		// Opcional: usar un Chromium ya instalado (CHROMIUM_PATH=/ruta/al/chrome).
		launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined }
	}
});
