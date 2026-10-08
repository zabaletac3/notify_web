import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	// El cifrado (KDF) es pesado: en paralelo los tests se disputan la CPU y vencen los plazos.
	workers: 1,
	webServer: { command: 'pnpm build && pnpm preview', port: 4173 },
	testMatch: '**/*.e2e.{ts,js}',
	use: {
		// Opcional: usar un Chromium ya instalado (CHROMIUM_PATH=/ruta/al/chrome).
		launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined }
	}
});
