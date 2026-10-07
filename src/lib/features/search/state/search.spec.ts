import { describe, expect, it } from 'vitest';
import { testApp } from '#lib/test/test-app.js';

describe('SearchState', () => {
	it('sin texto no hay búsqueda', async () => {
		const { search } = await testApp();
		expect(search.status).toBe('idle');
		expect(search.results).toEqual([]);
	});

	it('encuentra por título sin importar tildes ni mayúsculas', async () => {
		const { search } = await testApp();
		search.query = 'NORMALIZACION';
		expect(search.status).toBe('results');
		expect(search.results.map((r) => r.note.title)).toContain('Resumen: Bases de datos II');
	});

	it('busca por prefijo', async () => {
		const { search } = await testApp();
		search.query = 'norm';
		expect(search.results.map((r) => r.note.title)).toContain('Resumen: Bases de datos II');
	});

	it('tolera un error de tipeo', async () => {
		const { search } = await testApp();
		search.query = 'normalisacion';
		expect(search.results.map((r) => r.note.title)).toContain('Resumen: Bases de datos II');
	});

	it('busca también en etiquetas y en el contenido', async () => {
		const { search } = await testApp();
		search.query = 'proyecto-final';
		expect(search.results.length).toBeGreaterThan(0);
		search.query = 'transitivas';
		expect(search.results.map((r) => r.note.title)).toContain('Resumen: Bases de datos II');
	});

	it('el título pesa más que el contenido', async () => {
		const { search } = await testApp();
		search.query = 'redes';
		expect(search.results[0].note.title).toBe('Notas de clase — Redes');
	});

	it('sin coincidencias queda en estado "empty"', async () => {
		const { search } = await testApp();
		search.query = 'xylofon';
		expect(search.status).toBe('empty');
		expect(search.results).toEqual([]);
	});

	it('no incluye notas de la papelera', async () => {
		const { search } = await testApp();
		search.query = 'Borrador de informe';
		expect(search.results.map((r) => r.note.title)).not.toContain('Borrador de informe');
	});

	it('el índice se actualiza cuando cambian las notas', async () => {
		const { search, notes } = await testApp();
		search.query = 'quokka';
		expect(search.status).toBe('empty');
		await notes.create({ title: 'Mi quokka' });
		expect(search.status).toBe('results');
	});

	it('puede limitarse a la lista actual', async () => {
		const { search, notes, folders } = await testApp();
		search.query = 'notas';
		const global = search.results.length;
		notes.setFilter({
			kind: 'folder',
			folderId: folders.list.find((f) => f.name === 'Recetas')!.id
		});
		search.scope = 'current';
		expect(search.results.length).toBeLessThan(global);
		search.clear();
		expect(search.status).toBe('idle');
	});

	it('expone los términos sin tildes para resaltar', async () => {
		const { search } = await testApp();
		search.query = 'Normalización  Formas';
		expect(search.terms).toEqual(['normalizacion', 'formas']);
	});
});
