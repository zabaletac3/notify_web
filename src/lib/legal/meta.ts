/**
 * Datos del responsable del tratamiento. Fuente única para los textos legales y la página de soporte.
 * Los valores con `[[REVISAR]]` los confirma quien revisa los textos antes de publicarlos.
 */
export const RESPONSIBLE = {
	name: 'AXONOTE S.A.S.',
	/** [[REVISAR]] El dígito de verificación calculado para 900900901 es 8, no 2: confirmar con el RUT. */
	nit: '900900901-2',
	city: 'Barranquilla',
	country: 'Colombia',
	/** [[REVISAR]] Falta la dirección. */
	address: '[[REVISAR: dirección]]',
	email: 'axonote@gmail.com'
} as const;

/** Mientras sea `true`, las páginas muestran «Borrador pendiente de revisión legal». */
export const LEGAL_DRAFT = true;
