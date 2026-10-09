/**
 * Clases de la fila de botones de un diálogo.
 *
 * `dialogButtons`: botones lado a lado que se reparten el ancho en móvil y, desde `md`, van a la derecha
 * con su ancho natural. `flex-wrap` evita que una fila con textos largos se salga del recuadro
 * (los botones no encogen ni parten el texto): el que no cabe baja a la línea siguiente.
 *
 * `dialogButtonsStacked`: uno debajo de otro, a todo el ancho. Para textos largos como
 * «Cerrar sesión y olvidar este dispositivo».
 */
export const dialogButtons = 'flex flex-wrap gap-3 *:flex-1 md:justify-end md:*:flex-none';
export const dialogButtonsStacked = 'flex flex-col gap-2.5 *:w-full';
