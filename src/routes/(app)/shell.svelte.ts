import { viewport } from '#lib/components/app/index.js';

/** Clave donde se recuerda si la barra lateral está recogida ('1') o abierta ('0'). */
export const SIDEBAR_STORAGE_KEY = 'axonote-sidebar-collapsed';

/** Lee el estado guardado. Sin almacenamiento, o con un valor raro, la barra queda abierta. */
function readCollapsed(): boolean {
	try {
		return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
	} catch {
		return false;
	}
}

/**
 * Estado del marco de la app que depende del tamaño de pantalla.
 *  - ≥ 1024 px: barra lateral fija + lista + editor.
 *  - 768–1023 px: lista + editor; la barra lateral es un cajón.
 *  - < 768 px: una columna a la vez (lista o editor); barra lateral como cajón.
 *
 * La barra lateral se puede recoger (solo iconos) a partir de `lg`; el estado se recuerda entre
 * sesiones en `localStorage` (`axonote-sidebar-collapsed`) y `static/theme-init.js` lo aplica antes
 * de pintar para que no parpadee.
 */
export class Shell {
	/** Cajón de navegación abierto (solo existe por debajo de 1024 px). */
	drawerOpen = $state(false);
	/** En pantallas estrechas: `true` muestra el editor, `false` la lista. */
	editing = $state(false);
	/** Barra lateral recogida (solo se aplica a partir de `lg`). */
	sidebarCollapsed = $state(readCollapsed());
	/** Barra lateral fija. */
	wide = viewport.wide;
	/** Lista y editor lado a lado. */
	split = viewport.split;

	/** La barra está recogida y se está mostrando (pantalla ancha). */
	get sidebar(): boolean {
		return this.wide.current && this.sidebarCollapsed;
	}

	/** Alterna la barra lateral y recuerda el estado. */
	toggleSidebar() {
		this.sidebarCollapsed = !this.sidebarCollapsed;
		try {
			localStorage.setItem(SIDEBAR_STORAGE_KEY, this.sidebarCollapsed ? '1' : '0');
		} catch {
			// Sin almacenamiento: funciona igual, pero no se recuerda para la próxima carga.
		}
	}
}

export const shell = new Shell();
