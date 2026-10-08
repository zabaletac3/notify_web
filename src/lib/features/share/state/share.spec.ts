import { describe, expect, it, vi } from 'vitest';
import { keyFromFragment } from '#lib/data/index.js';
import { ShareState } from '#lib/features/share/index.js';
import { testApp } from '#lib/test/test-app.js';

/** Un `ShareState` con la nota que se quiera, sobre el servidor y el cofre de la app de pruebas. */
async function setup() {
	const app = await testApp();
	const note = app.notes.visible[0];
	let current = note;
	const share = new ShareState(app.backend.repos.share, app.vault, {
		getNote: (id) => (id === current.id ? current : undefined),
		republishDelayMs: 5
	});
	return {
		app,
		share,
		note,
		edit: (patch: Partial<typeof note>) => (current = { ...current, ...patch })
	};
}

const fragmentOf = (url: string) => keyFromFragment(new URL(url).hash)!;
const slugOf = (url: string) => new URL(url).pathname.split('/').pop()!;

describe('ShareState', () => {
	it('crea un enlace que se lee con la clave del fragmento', async () => {
		const { share, note } = await setup();
		const r = await share.create(note.id);
		expect(r.ok).toBe(true);
		const url = r.ok ? r.value.url : '';
		const opened = await share.open(slugOf(url), fragmentOf(url));
		expect(opened.ok && opened.value).toMatchObject({ title: note.title, content: note.content });
	});

	it('crear dos veces da el mismo enlace', async () => {
		const { share, note } = await setup();
		const a = await share.create(note.id);
		const b = await share.create(note.id);
		expect(a.ok && b.ok && a.value.url === b.value.url).toBe(true);
	});

	it('recupera el enlace de una nota (otra sesión) con la misma URL', async () => {
		const { app, share, note } = await setup();
		const created = await share.create(note.id);
		const fresh = new ShareState(app.backend.repos.share, app.vault, { getNote: () => note });
		expect(fresh.linkFor(note.id)).toBeNull();
		const loaded = await fresh.load(note.id);
		expect(loaded.ok && loaded.value?.url).toBe(created.ok && created.value.url);
		expect(fresh.linkFor(note.id)?.url).toBe(created.ok && created.value.url);
	});

	it('revocar deja el enlace sin efecto: no válido y sin pistas', async () => {
		const { share, note } = await setup();
		const r = await share.create(note.id);
		const url = r.ok ? r.value.url : '';
		await share.revoke(note.id);
		expect(share.linkFor(note.id)).toBeNull();
		const opened = await share.open(slugOf(url), fragmentOf(url));
		expect(opened.ok).toBe(false);
		expect(!opened.ok && opened.error.kind).toBe('not-found');
	});

	it('una clave equivocada da el mismo resultado que un enlace revocado', async () => {
		const { share, note } = await setup();
		const r = await share.create(note.id);
		const url = r.ok ? r.value.url : '';
		const wrong = await share.open(slugOf(url), 'A'.repeat(43));
		expect(!wrong.ok && wrong.error.kind).toBe('not-found');
	});

	it('al editar la nota, la copia pública se actualiza sola', async () => {
		const { share, note, edit } = await setup();
		const r = await share.create(note.id);
		const url = r.ok ? r.value.url : '';
		edit({ content: 'contenido nuevo' });
		share.republish({ ...note, content: 'contenido nuevo' });
		await vi.waitFor(async () => {
			const opened = await share.open(slugOf(url), fragmentOf(url));
			expect(opened.ok && opened.value.content).toBe('contenido nuevo');
		});
		share.dispose();
	});

	it('editar una nota sin enlace no hace nada', async () => {
		const { app, share, note } = await setup();
		share.republish(note);
		await new Promise((r) => setTimeout(r, 30));
		expect(app.backend.db.shareLinks).toHaveLength(0);
	});

	it('con la app bloqueada no se puede crear un enlace', async () => {
		const { app, share, note } = await setup();
		app.vault.lock();
		const r = await share.create(note.id);
		expect(!r.ok && r.error.kind).toBe('locked');
	});

	it('avisa antes de crear (para subir la nota al servidor primero)', async () => {
		const app = await testApp();
		const note = app.notes.visible[0];
		const beforeCreate = vi.fn(async () => {});
		const share = new ShareState(app.backend.repos.share, app.vault, {
			getNote: () => note,
			beforeCreate
		});
		await share.create(note.id);
		expect(beforeCreate).toHaveBeenCalledOnce();
	});

	it('una nota ilegible no se puede compartir', async () => {
		const { app, edit, share, note } = await setup();
		edit({ unreadable: true });
		const r = await share.create(note.id);
		expect(!r.ok && r.error.kind).toBe('decrypt');
		expect(app.backend.db.shareLinks).toHaveLength(0);
	});

	it('una nota desconocida no se puede compartir', async () => {
		const { share } = await setup();
		const r = await share.create('no-existe');
		expect(!r.ok && r.error.kind).toBe('not-found');
	});

	it('sin conexión no se puede crear ni abrir el enlace', async () => {
		const { app, share, note } = await setup();
		app.scenario.offline = true;
		const r = await share.create(note.id);
		expect(!r.ok && r.error.kind).toBe('network');
		const opened = await share.open('x'.repeat(22), 'A'.repeat(43));
		expect(!opened.ok && opened.error.kind).toBe('network');
	});
});
