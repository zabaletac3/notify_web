import { MediaQuery } from 'svelte/reactivity';

/**
 * Tamaño de pantalla para decidir cómo se presentan menús y diálogos.
 *  - `split` (≥ 768 px): lista y editor juntos; diálogos centrados.
 *  - `wide` (≥ 1024 px): barra lateral fija.
 * Por debajo de 768 px los menús y diálogos largos se muestran como hoja inferior.
 */
export const viewport = {
	split: new MediaQuery('min-width: 768px'),
	wide: new MediaQuery('min-width: 1024px')
};
