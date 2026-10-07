import { viewport } from '#lib/components/app/index.js';
/**
 * Estado del marco de la app que depende del tamaño de pantalla.
 *  - ≥ 1024 px: barra lateral fija + lista + editor.
 *  - 768–1023 px: lista + editor; la barra lateral es un cajón.
 *  - < 768 px: una columna a la vez (lista o editor); barra lateral como cajón.
 */
class Shell {
	/** Cajón de navegación abierto (solo existe por debajo de 1024 px). */
	drawerOpen = $state(false);
	/** En pantallas estrechas: `true` muestra el editor, `false` la lista. */
	editing = $state(false);
	/** Barra lateral fija. */
	wide = viewport.wide;
	/** Lista y editor lado a lado. */
	split = viewport.split;
}

export const shell = new Shell();
