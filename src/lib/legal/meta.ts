/**
 * Datos del responsable del tratamiento. Fuente única para los textos legales y la página de soporte.
 * Los valores con `[[REVISAR]]` los confirma quien revisa los textos antes de publicarlos.
 */
export const RESPONSIBLE = {
	name: 'AXONOTE S.A.S.',
	/** [[REVISAR]] El número tiene 10 dígitos antes del guion; un NIT colombiano lleva 9 + dígito de verificación. */
	nit: '9009009001-2',
	city: 'Barranquilla',
	country: 'Colombia',
	/** [[REVISAR]] Falta la dirección. */
	address: '[[REVISAR: dirección]]',
	email: 'axonote@gmail.com'
} as const;

/** Mientras sea `true`, las páginas muestran «Borrador pendiente de revisión legal». */
export const LEGAL_DRAFT = true;
