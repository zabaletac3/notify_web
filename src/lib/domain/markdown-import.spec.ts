import { describe, expect, it } from 'vitest';
import { IMPORT_TITLE_MAX_LENGTH, parseMarkdownNote } from './markdown-import.js';

describe('parseMarkdownNote', () => {
	it('toma el título de la primera línea «# …» y lo quita del texto', () => {
		expect(parseMarkdownNote('x.md', '# Receta\n\nHuevos\n- sal\n')).toEqual({
			title: 'Receta',
			content: 'Huevos\n- sal'
		});
	});

	it('lee lo que escribe la exportación de AxoNote (título, línea en blanco y contenido)', () => {
		const exported = '# Reunión del lunes\n\nTemas:\n\n- Presupuesto\n';
		expect(parseMarkdownNote('Reunión del lunes.md', exported)).toEqual({
			title: 'Reunión del lunes',
			content: 'Temas:\n\n- Presupuesto'
		});
	});

	it('sin título usa el nombre del archivo y conserva todo el texto', () => {
		expect(parseMarkdownNote('Ideas sueltas.md', 'Primera idea\n\nSegunda')).toEqual({
			title: 'Ideas sueltas',
			content: 'Primera idea\n\nSegunda'
		});
		expect(parseMarkdownNote('notas.MARKDOWN', 'a').title).toBe('notas');
		expect(parseMarkdownNote('lista.txt', 'a').title).toBe('lista');
	});

	it('un «## subtítulo» al principio no es el título de la nota', () => {
		expect(parseMarkdownNote('guía.md', '## Paso 1\n\nHacer algo')).toEqual({
			title: 'guía',
			content: '## Paso 1\n\nHacer algo'
		});
	});

	it('ignora líneas en blanco iniciales, el BOM y los saltos de línea de Windows', () => {
		expect(parseMarkdownNote('x.md', '﻿\r\n\r\n# Título\r\n\r\nTexto\r\nmás\r\n')).toEqual({
			title: 'Título',
			content: 'Texto\nmás'
		});
	});

	it('quita los # de cierre del título y recorta títulos larguísimos', () => {
		expect(parseMarkdownNote('x.md', '# Con cierre ##\ntexto').title).toBe('Con cierre');
		const long = 'a'.repeat(IMPORT_TITLE_MAX_LENGTH + 50);
		expect(parseMarkdownNote('x.md', `# ${long}\n`).title).toHaveLength(IMPORT_TITLE_MAX_LENGTH);
	});

	it('un archivo vacío da una nota con el nombre del archivo y sin texto', () => {
		expect(parseMarkdownNote('vacío.md', '')).toEqual({ title: 'vacío', content: '' });
		expect(parseMarkdownNote('.md', '   \n')).toEqual({ title: 'Sin título', content: '' });
	});

	it('solo un título deja el texto vacío', () => {
		expect(parseMarkdownNote('x.md', '# Solo título')).toEqual({
			title: 'Solo título',
			content: ''
		});
	});
});
