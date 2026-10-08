/**
 * Versión de la app y build. Las inyecta Vite como constantes (`vite.config.ts` → `define`):
 * `__APP_VERSION__` sale de package.json y `__APP_BUILD__` del nº de CI, del SHA corto de git o de «dev».
 */
export const APP_VERSION = __APP_VERSION__;
export const APP_BUILD = __APP_BUILD__;
