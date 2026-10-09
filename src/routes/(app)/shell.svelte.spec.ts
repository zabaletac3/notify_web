import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Shell, SIDEBAR_STORAGE_KEY } from './shell.svelte.js';

/**
 * Estado de la barra lateral recogible: valor inicial desde `localStorage`, alternar y el caso de
 * almacenamiento bloqueado (debe funcionar solo en memoria, sin romper).
 */
describe('Shell: barra lateral recogida', () => {
	beforeEach(() => localStorage.removeItem(SIDEBAR_STORAGE_KEY));
	afterEach(() => localStorage.removeItem(SIDEBAR_STORAGE_KEY));

	it('empieza abierta cuando no hay nada guardado', () => {
		expect(new Shell().sidebarCollapsed).toBe(false);
	});

	it('lee el estado guardado ("1" = recogida)', () => {
		localStorage.setItem(SIDEBAR_STORAGE_KEY, '1');
		expect(new Shell().sidebarCollapsed).toBe(true);
	});

	it('trata los valores raros como abierto', () => {
		for (const value of ['', 'true', 'si', '2', '{}']) {
			localStorage.setItem(SIDEBAR_STORAGE_KEY, value);
			expect(new Shell().sidebarCollapsed, value).toBe(false);
		}
	});

	it('alterna y recuerda el estado', () => {
		const shell = new Shell();
		shell.toggleSidebar();
		expect(shell.sidebarCollapsed).toBe(true);
		expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('1');
		shell.toggleSidebar();
		expect(shell.sidebarCollapsed).toBe(false);
		expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('0');
	});

	it('con el almacenamiento bloqueado no rompe y funciona en memoria', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('bloqueado');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('bloqueado');
		});

		const shell = new Shell();
		expect(shell.sidebarCollapsed).toBe(false);
		shell.toggleSidebar();
		expect(shell.sidebarCollapsed).toBe(true);
		shell.toggleSidebar();
		expect(shell.sidebarCollapsed).toBe(false);

		vi.restoreAllMocks();
	});
});
