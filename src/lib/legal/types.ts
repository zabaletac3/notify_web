/** Un bloque de contenido de un documento legal. */
export type LegalBlock =
	| { p: string }
	| { ul: string[] }
	/** Aviso destacado (p. ej. la advertencia de no recuperación). */
	| { callout: string };

export interface LegalSection {
	/** Ancla estable (`#id`) y clave del índice. */
	id: string;
	title: string;
	blocks: LegalBlock[];
}

export interface LegalDocument {
	title: string;
	/** Versión del texto; se registrará con la aceptación cuando exista (deuda B4). */
	version: string;
	/** Fecha de entrada en vigor (ISO) o `null` mientras sea borrador. */
	effectiveDate: string | null;
	status: 'borrador' | 'vigente';
	intro: string;
	sections: LegalSection[];
}
