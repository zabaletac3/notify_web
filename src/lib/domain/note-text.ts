/** Utilidades puras para el texto Markdown de una nota. */

/** Quita sintaxis Markdown para mostrar una vista previa de una línea. */
export function derivePreview(content: string, maxLength = 90): string {
	const text = content
		.split('\n')
		.map((line) =>
			line
				.replace(/^\s{0,3}#{1,6}\s+/, '') // títulos
				.replace(/^\s*>\s?/, '') // citas
				.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, '') // tareas
				.replace(/^\s*([-*+]|\d+\.)\s+/, '') // listas
				.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // imágenes
				.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // enlaces
				.replace(/[*_`~]+/g, '') // énfasis y código
				.trim()
		)
		.filter(Boolean)
		.join(' ');
	return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export function countWords(content: string): number {
	const words = content
		.replace(/[#>*_`~[\]()!-]/g, ' ')
		.split(/\s+/)
		.filter(Boolean);
	return words.length;
}

/** Normaliza una etiqueta: sin `#`, minúsculas, espacios → guiones. */
export function normalizeTag(tag: string): string {
	return tag
		.trim()
		.replace(/^#+/, '')
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^\p{L}\p{N}_-]/gu, '');
}

/** Quita acentos y pasa a minúsculas (para búsquedas insensibles a tildes). */
export function foldText(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();
}
