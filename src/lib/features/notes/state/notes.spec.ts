import { describe, expect, it } from 'vitest';
import { NotesState } from '#lib/features/notes/index.js';
import { fail } from '#lib/domain/index.js';
import { testApp, TEST_NOW } from '#lib/test/test-app.js';

describe('NotesState · carga y conteos', () => {
	it('carga todas las notas y calcula los contadores de la barra lateral', async () => {
		const { notes, folders } = await testApp();
		expect(notes.status).toBe('ready');
		expect(notes.counts).toMatchObject({ all: 48, pinned: 3, trash: 3, unfiled: 18 });
		const byName = (n: string) => notes.counts.byFolder[folders.list.find((f) => f.name === n)!.id];
		expect([byName('Universidad'), byName('Personal'), byName('Ideas'), byName('Recetas')]).toEqual(
			[12, 9, 5, 4]
		);
		expect(notes.tags).toEqual([
			{ name: 'lecturas', count: 8 },
			{ name: 'parcial', count: 6 },
			{ name: 'proyecto-final', count: 3 }
		]);
	});

	it('una cuenta nueva queda como "primera vez"', async () => {
		const { notes } = await testApp({ dataset: 'first-time' });
		expect(notes.isFirstTime).toBe(true);
		expect(notes.visible).toEqual([]);
		expect(notes.groups).toEqual([]);
	});

	it('con error de servidor la carga falla y queda el error', async () => {
		const app = await testApp({ load: false });
		app.scenario.serverError = true;
		const result = await app.notes.load();
		expect(result.ok).toBe(false);
		expect(app.notes.status).toBe('error');
		expect(app.notes.error?.kind).toBe('server');
		app.scenario.serverError = false;
		expect((await app.notes.load()).ok).toBe(true);
		expect(app.notes.error).toBeNull();
	});
});

describe('NotesState · listas', () => {
	it('agrupa como el diseño: Fijadas primero y la nota más reciente en "Hoy"', async () => {
		const { notes } = await testApp();
		const groups = notes.groups;
		expect(groups[0]).toMatchObject({ key: 'pinned', label: 'Fijadas' });
		expect(groups[0].notes).toHaveLength(3);
		const today = groups.find((g) => g.key === 'today');
		expect(today?.notes[0].title).toBe('Resumen: Bases de datos II');
		// todas las notas visibles aparecen exactamente una vez
		expect(groups.flatMap((g) => g.notes)).toHaveLength(48);
	});

	it('filtra por carpeta, etiqueta y fijadas', async () => {
		const { notes, folders } = await testApp();
		const uni = folders.list.find((f) => f.name === 'Universidad')!;
		notes.setFilter({ kind: 'folder', folderId: uni.id });
		expect(notes.visible).toHaveLength(12);
		notes.setFilter({ kind: 'folder', folderId: null });
		expect(notes.visible).toHaveLength(18);
		notes.setFilter({ kind: 'tag', tag: 'parcial' });
		expect(notes.visible).toHaveLength(6);
		notes.setFilter({ kind: 'pinned' });
		expect(notes.visible).toHaveLength(3);
	});

	it('la papelera es una sola lista y no mezcla notas activas', async () => {
		const { notes } = await testApp();
		notes.setFilter({ kind: 'trash' });
		expect(notes.visible).toHaveLength(3);
		expect(notes.groups).toHaveLength(1);
		expect(notes.groups[0]).toMatchObject({ key: 'trash', label: 'Papelera' });
		expect(notes.visible.every((n) => n.deletedAt)).toBe(true);
	});

	it('ordena por título', async () => {
		const { notes } = await testApp();
		notes.sort = 'title';
		const titles = notes.visible.map((n) => n.title);
		expect(titles).toEqual(
			[...titles].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
		);
	});

	it('al cambiar de lista se deselecciona la nota que ya no se ve', async () => {
		const { notes, folders } = await testApp();
		notes.select(notes.visible[0].id);
		notes.setFilter({
			kind: 'folder',
			folderId: folders.list.find((f) => f.name === 'Recetas')!.id
		});
		expect(notes.selectedId).toBeNull();
	});
});

describe('NotesState · acciones', () => {
	it('crea una nota en la carpeta que se está viendo y la selecciona', async () => {
		const { notes, folders } = await testApp();
		const proyectos = folders.list.find((f) => f.name === 'Proyectos')!;
		notes.setFilter({ kind: 'folder', folderId: proyectos.id });
		expect(notes.visible).toEqual([]); // carpeta vacía
		const result = await notes.create({ title: 'Primera' });
		expect(result.ok).toBe(true);
		expect(notes.visible).toHaveLength(1);
		expect(notes.selected?.title).toBe('Primera');
		expect(notes.selected?.folderId).toBe(proyectos.id);
		expect(notes.counts.byFolder[proyectos.id]).toBe(1);
	});

	it('crea con la etiqueta de la lista actual', async () => {
		const { notes } = await testApp();
		notes.setFilter({ kind: 'tag', tag: 'lecturas' });
		const r = await notes.create();
		expect(r.ok && r.value.tags).toEqual(['lecturas']);
	});

	it('edita al instante (optimista) y queda pendiente de sincronizar', async () => {
		const { notes } = await testApp();
		const id = notes.visible[0].id;
		const promise = notes.update(id, { title: 'Editada' });
		expect(notes.all.find((n) => n.id === id)?.title).toBe('Editada'); // antes de que responda el repo
		const result = await promise;
		expect(result.ok).toBe(true);
		expect(notes.all.find((n) => n.id === id)).toMatchObject({
			title: 'Editada',
			syncStatus: 'pending'
		});
	});

	it('revierte la edición si el guardado falla', async () => {
		const app = await testApp();
		const failing = new NotesState(
			Object.assign(Object.create(app.backend.repos.notes), {
				update: async () => {
					throw fail.server();
				}
			})
		);
		await failing.load();
		const original = failing.all[0];
		const result = await failing.update(original.id, { title: 'No se guarda' });
		expect(result.ok).toBe(false);
		expect(failing.all.find((n) => n.id === original.id)?.title).toBe(original.title);
		expect(failing.lastError?.kind).toBe('server');
	});

	it('fija y desfija', async () => {
		const { notes } = await testApp();
		const unpinned = notes.visible.find((n) => !n.pinned)!;
		await notes.togglePin(unpinned.id);
		expect(notes.counts.pinned).toBe(4);
		await notes.togglePin(unpinned.id);
		expect(notes.counts.pinned).toBe(3);
	});

	it('mueve a la papelera, restaura y elimina para siempre', async () => {
		const { notes } = await testApp();
		const id = notes.visible[0].id;
		notes.select(id);
		await notes.moveToTrash(id);
		expect(notes.counts).toMatchObject({ all: 47, trash: 4 });
		expect(notes.selectedId).toBeNull();
		await notes.restore(id);
		expect(notes.counts).toMatchObject({ all: 48, trash: 3 });
		await notes.moveToTrash(id);
		await notes.deleteForever(id);
		expect(notes.counts.trash).toBe(3);
		expect(notes.all.some((n) => n.id === id)).toBe(false);
	});

	it('vacía la papelera', async () => {
		const { notes } = await testApp();
		const r = await notes.emptyTrash();
		expect(r.ok && r.value).toBe(3);
		expect(notes.counts.trash).toBe(0);
	});

	it('duplica y selecciona la copia', async () => {
		const { notes } = await testApp();
		const id = notes.visible[0].id;
		await notes.duplicate(id);
		expect(notes.counts.all).toBe(49);
		expect(notes.selected?.title).toMatch(/\(copia\)$/);
	});

	it('mover a una carpeta que no existe devuelve not-found y no cambia nada', async () => {
		const { notes } = await testApp();
		const note = notes.visible[0];
		const r = await notes.moveToFolder(note.id, 'f_inexistente');
		expect(r.ok).toBe(false);
		expect(notes.all.find((n) => n.id === note.id)?.folderId).toBe(note.folderId);
	});

	it('las fechas usan el reloj inyectado', async () => {
		const { notes } = await testApp();
		const id = notes.visible[0].id;
		const r = await notes.update(id, { title: 'x' });
		expect(r.ok && r.value.updatedAt).toBe(TEST_NOW.toISOString());
	});
});
