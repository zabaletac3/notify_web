/** Una nota lista para crear a partir de un archivo Markdown. */
export interface ImportedNote {
	title: string;
	content: string;
}

/** Largo máximo del título de una nota importada. */
export const IMPORT_TITLE_MAX_LENGTH = 200;

/** Tamaño máximo de un archivo a importar (un `.md` normal pesa muy por debajo). */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

const stripExtension = (name: string) => name.replace(/\.(md|markdown|txt)$/i, '').trim();

/**
 * Convierte el texto de un archivo Markdown en una nota. Si empieza con un título `# …` (como lo escribe
 * la exportación de AxoNote) ese título pasa a ser el de la nota y se quita del texto; si no, el título es
 * el nombre del archivo. Quita el BOM y unifica los saltos de línea.
 */
export function parseMarkdownNote(fileName: string, text: string): ImportedNote {
	const normalized = text.replace(/^\u{FEFF}/u, '').replace(/\r\n?/g, '\n');
	const lines = normalized.split('\n');
	const first = lines.findIndex((l) => l.trim() !== '');
	const heading = first >= 0 ? /^#\s+(.+?)\s*#*\s*$/.exec(lines[first]) : null;

	let title: string;
	let rest: string[];
	if (heading) {
		title = heading[1].trim();
		rest = lines.slice(first + 1);
	} else {
		title = stripExtension(fileName) || 'Sin título';
		rest = lines.slice(first >= 0 ? first : 0);
	}
	const content = rest.join('\n').replace(/^\n+/, '').trimEnd();
	return { title: title.slice(0, IMPORT_TITLE_MAX_LENGTH), content };
}
