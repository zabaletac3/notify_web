import { beforeEach, describe, expect, it } from 'vitest';
import { LIGHT_KDF, deriveFromPassword } from '#lib/core/crypto/index.js';
import { createShare } from '#lib/data/crypto/index.js';
import {
	changePasswordKeys,
	createAccountKeys,
	recoverWithRecoveryKey,
	rotateRecoveryKeys
} from '#lib/data/crypto/index.js';
import { AppFailure, TRASH_RETENTION_DAYS, type AppError } from '#lib/domain/index.js';
import {
	createDemoVault,
	createMockBackend,
	DEMO_KEYS,
	DEMO_RECOVERY_KEY,
	DEMO_USER_EMAIL,
	DEMO_USER_ID,
	DEMO_USER_PASSWORD,
	RESET_TOKEN,
	type Dataset,
	type MockBackend
} from './index.js';

const fakeShare = { slug: 'x'.repeat(22), payload: 'a', wrappedShareKey: 'b' };
const NOW = new Date('2026-10-07T12:00:00.000Z');
const make = (dataset: Dataset = 'normal', extra: { startAuthenticated?: boolean } = {}) => {
	const backend = createMockBackend({ now: () => NOW, ...extra });
	if (dataset !== 'normal') {
		backend.scenario.dataset = dataset;
		backend.db.reset();
	}
	return backend;
};

/** Ejecuta y devuelve el AppError con el que falló. */
async function errorOf(p: Promise<unknown>): Promise<AppError> {
	try {
		await p;
	} catch (e) {
		if (e instanceof AppFailure) return e.error;
		throw e;
	}
	throw new Error('Se esperaba un fallo');
}

describe('datos de ejemplo (los contadores del diseño)', () => {
	it('dataset normal: 48 notas activas, 3 fijadas, 3 en papelera', async () => {
		const { repos } = make();
		const active = await repos.notes.list();
		const trash = await repos.notes.list({ filter: { kind: 'trash' } });
		expect(active).toHaveLength(48);
		expect(active.filter((n) => n.pinned)).toHaveLength(3);
		expect(trash).toHaveLength(3);
	});

	it('carpetas: Universidad 12 · Personal 9 · Ideas 5 · Recetas 4 · Proyectos 0 · sin carpeta 18', async () => {
		const { repos } = make();
		const folders = await repos.folders.list();
		const notes = await repos.notes.list();
		const count = (name: string) => {
			const f = folders.find((x) => x.name === name)!;
			return notes.filter((n) => n.folderId === f.id).length;
		};
		expect(folders.map((f) => f.name)).toEqual([
			'Universidad',
			'Personal',
			'Ideas',
			'Recetas',
			'Proyectos'
		]);
		expect([
			count('Universidad'),
			count('Personal'),
			count('Ideas'),
			count('Recetas'),
			count('Proyectos')
		]).toEqual([12, 9, 5, 4, 0]);
		expect(notes.filter((n) => n.folderId === null)).toHaveLength(18);
	});

	it('etiquetas: parcial 6 · proyecto-final 3 · lecturas 8', async () => {
		const { repos } = make();
		const tag = async (t: string) =>
			(await repos.notes.list({ filter: { kind: 'tag', tag: t } })).length;
		expect([await tag('parcial'), await tag('proyecto-final'), await tag('lecturas')]).toEqual([
			6, 3, 8
		]);
	});

	it('incluye la nota "Resumen: Bases de datos II" con su contenido', async () => {
		const { repos } = make();
		const bd = (await repos.notes.list()).find((n) => n.title === 'Resumen: Bases de datos II')!;
		expect(bd.content).toContain('## Formas normales');
		expect(bd.content).toContain('- [x] Repasar ejemplos de dependencias funcionales');
		expect(bd.tags).toEqual(['parcial', 'lecturas']);
	});

	it('papelera: vencen a los 29, 16 y 9 días', async () => {
		const { repos } = make();
		const trash = await repos.notes.list({ filter: { kind: 'trash' } });
		const days = trash
			.map((n) =>
				Math.round(
					TRASH_RETENTION_DAYS - (NOW.getTime() - new Date(n.deletedAt!).getTime()) / 86400000
				)
			)
			.sort((a, b) => b - a);
		expect(days).toEqual([29, 16, 9]);
	});

	it('es determinista: dos corridas dan los mismos datos', async () => {
		const a = await make().repos.notes.list();
		const b = await make().repos.notes.list();
		expect(a).toEqual(b);
	});

	it('dataset first-time: sin notas ni carpetas', async () => {
		const { repos } = make('first-time');
		expect(await repos.notes.list()).toEqual([]);
		expect(await repos.folders.list()).toEqual([]);
	});

	it('dataset large: 2.000+ notas', async () => {
		const { repos } = make('large');
		expect((await repos.notes.list()).length).toBeGreaterThanOrEqual(2000);
	});
});

describe('notas', () => {
	let b: MockBackend;
	beforeEach(() => {
		b = make();
	});

	it('ordena por modificación, creación o título', async () => {
		const byUpdated = await b.repos.notes.list({ sort: 'updated' });
		expect(byUpdated[0].title).toBe('Resumen: Bases de datos II');
		const byTitle = await b.repos.notes.list({ sort: 'title' });
		const titles = byTitle.map((n) => n.title);
		expect(titles).toEqual(
			[...titles].sort((x, y) => x.localeCompare(y, 'es', { sensitivity: 'base' }))
		);
	});

	it('crea una nota pendiente de sincronizar', async () => {
		const n = await b.repos.notes.create({ title: 'Nueva', tags: ['#Parcial'] });
		expect(n).toMatchObject({
			title: 'Nueva',
			syncStatus: 'pending',
			tags: ['parcial'],
			deletedAt: null
		});
		expect(await b.repos.notes.list()).toHaveLength(49);
	});

	it('edita, marca como pendiente y valida la carpeta', async () => {
		const [first] = await b.repos.notes.list();
		const updated = await b.repos.notes.update(first.id, { content: 'nuevo', pinned: true });
		expect(updated).toMatchObject({ content: 'nuevo', pinned: true, syncStatus: 'pending' });
		expect(await errorOf(b.repos.notes.update(first.id, { folderId: 'no-existe' }))).toEqual({
			kind: 'not-found',
			entity: 'folder'
		});
	});

	it('devuelve copias: modificar el resultado no altera la base', async () => {
		const [first] = await b.repos.notes.list();
		first.title = 'MUTADO';
		expect((await b.repos.notes.get(first.id)).title).not.toBe('MUTADO');
	});

	it('papelera: mover, restaurar y eliminar para siempre', async () => {
		const [first] = await b.repos.notes.list();
		const trashed = await b.repos.notes.moveToTrash(first.id);
		expect(trashed.deletedAt).toBeTruthy();
		expect(await b.repos.notes.list()).toHaveLength(47);
		expect(await errorOf(b.repos.notes.update(first.id, { title: 'x' }))).toMatchObject({
			kind: 'validation'
		});
		await b.repos.notes.restore(first.id);
		expect(await b.repos.notes.list()).toHaveLength(48);
		await b.repos.notes.moveToTrash(first.id);
		await b.repos.notes.deleteForever(first.id);
		expect(await errorOf(b.repos.notes.get(first.id))).toEqual({
			kind: 'not-found',
			entity: 'note'
		});
	});

	it('vacía la papelera', async () => {
		expect(await b.repos.notes.emptyTrash()).toBe(3);
		expect(await b.repos.notes.list({ filter: { kind: 'trash' } })).toEqual([]);
	});

	it('purga solo las notas de más de 30 días en la papelera', async () => {
		const [first] = await b.repos.notes.list();
		await b.repos.notes.moveToTrash(first.id);
		b.db.notes.find((n) => n.id === first.id)!.deletedAt = new Date(
			NOW.getTime() - 31 * 86400000
		).toISOString();
		const trash = await b.repos.notes.list({ filter: { kind: 'trash' } });
		expect(trash.some((n) => n.id === first.id)).toBe(false);
		expect(trash).toHaveLength(3);
	});

	it('duplica sin fijar', async () => {
		const pinned = (await b.repos.notes.list({ filter: { kind: 'pinned' } }))[0];
		const copy = await b.repos.notes.duplicate(pinned.id);
		expect(copy).toMatchObject({ title: `${pinned.title} (copia)`, pinned: false });
		expect(copy.id).not.toBe(pinned.id);
	});
});

describe('carpetas', () => {
	it('crea, renombra y valida nombres', async () => {
		const { repos } = make();
		const f = await repos.folders.create('  Viajes ');
		expect(f.name).toBe('Viajes');
		expect(await errorOf(repos.folders.create('viajes'))).toEqual({
			kind: 'validation',
			fields: { name: 'name-taken' }
		});
		expect((await repos.folders.rename(f.id, 'Viajes 2026')).name).toBe('Viajes 2026');
		expect(await errorOf(repos.folders.rename('nope', 'X'))).toMatchObject({ kind: 'not-found' });
	});

	it('al borrar una carpeta, sus notas pasan a "sin carpeta"', async () => {
		const { repos } = make();
		const ideas = (await repos.folders.list()).find((f) => f.name === 'Ideas')!;
		await repos.folders.delete(ideas.id);
		const notes = await repos.notes.list();
		expect(notes.filter((n) => n.folderId === null)).toHaveLength(18 + 5);
		expect(notes.some((n) => n.folderId === ideas.id)).toBe(false);
	});
});

describe('cuentas', () => {
	type Repos = MockBackend['repos'];

	/** Lo que hace el cliente al registrarse: crea las claves y manda solo pruebas y claves cifradas. */
	async function signUp(repos: Repos, email = 'luis@correo.com', password = 'Secret123!') {
		const account = await createAccountKeys(password, LIGHT_KDF);
		const result = await repos.auth.register({
			fullName: 'Luis Gómez',
			email,
			acceptedTerms: true,
			userId: account.userId,
			authKey: account.authKey,
			recoveryAuth: account.recoveryAuth,
			keys: account.keys
		});
		return { ...result, account };
	}

	/** Lo que hace el cliente al iniciar sesión: consulta los parámetros, deriva y envía la prueba. */
	async function logIn(repos: Repos, email: string, password: string) {
		const { kdf } = await repos.auth.prelogin(email);
		const { authKey } = await deriveFromPassword(password, kdf);
		return repos.auth.login({ email, authKey });
	}

	it('registro → verificación → sesión iniciada', async () => {
		const { repos } = make('normal', { startAuthenticated: false });
		const { email } = await signUp(repos, ' Luis@Correo.com ');
		expect(email).toBe('luis@correo.com');
		expect(await errorOf(repos.auth.verifyEmail(email, '000000'))).toEqual({
			kind: 'validation',
			fields: { code: 'invalid-code' }
		});
		const user = await repos.auth.verifyEmail(email, '123456');
		expect(user.emailVerified).toBe(true);
		expect((await repos.auth.currentSession())?.user.email).toBe('luis@correo.com');
	});

	it('el servidor no guarda ni la contraseña ni nada con lo que descifrar las notas', async () => {
		const { repos, db } = make('normal', { startAuthenticated: false });
		const { account } = await signUp(repos, 'luis@correo.com', 'UnaClaveMuyPropia9!');
		const stored = JSON.stringify(db.users.find((u) => u.user.email === 'luis@correo.com'));
		expect(stored).not.toContain('UnaClaveMuyPropia9!');
		expect(stored).not.toContain(account.authKey);
		expect(stored).not.toContain(account.recoveryAuth);
		expect(stored).not.toContain(account.recoveryKey);
	});

	it('no permite registrar un correo repetido', async () => {
		const { repos } = make();
		expect(await errorOf(signUp(repos, DEMO_USER_EMAIL))).toEqual({
			kind: 'validation',
			fields: { email: 'email-taken' }
		});
	});

	it('sin verificar no inicia sesión', async () => {
		const { repos } = make('normal', { startAuthenticated: false });
		await signUp(repos);
		expect(await errorOf(logIn(repos, 'luis@correo.com', 'Secret123!'))).toEqual({
			kind: 'forbidden',
			code: 'email-not-verified'
		});
	});

	it('mismo error para correo inexistente y contraseña errónea', async () => {
		const { repos } = make();
		const a = await errorOf(logIn(repos, 'no@existe.com', 'x'));
		const b = await errorOf(logIn(repos, DEMO_USER_EMAIL, 'mal'));
		expect(a).toEqual(b);
		expect(a).toEqual({ kind: 'unauthorized', code: 'invalid-credentials' });
	});

	it('prelogin de un correo inexistente da parámetros falsos pero estables', async () => {
		const { repos } = make();
		const a = await repos.auth.prelogin('no@existe.com');
		const b = await repos.auth.prelogin('NO@existe.com ');
		const real = await repos.auth.prelogin(DEMO_USER_EMAIL);
		expect(a).toEqual(b);
		expect(a.kdf.salt).not.toBe(real.kdf.salt);
		expect({ ...a.kdf, salt: '' }).toEqual({ ...real.kdf, salt: '' });
	});

	it('bloquea tras 5 intentos fallidos', async () => {
		const { repos } = make();
		for (let i = 0; i < 5; i++) await errorOf(logIn(repos, DEMO_USER_EMAIL, 'mal'));
		expect((await errorOf(logIn(repos, DEMO_USER_EMAIL, DEMO_USER_PASSWORD))).kind).toBe(
			'rate-limited'
		);
	});

	it('inicia y cierra sesión, y devuelve las claves cifradas de la cuenta', async () => {
		const { repos } = make('normal', { startAuthenticated: false });
		expect(await repos.auth.currentSession()).toBeNull();
		const session = await logIn(repos, DEMO_USER_EMAIL, DEMO_USER_PASSWORD);
		expect(session.user.fullName).toBe('Ana Pérez');
		expect(session.keys).toEqual(DEMO_KEYS);
		expect(await repos.auth.keys()).toEqual(DEMO_KEYS);
		await repos.auth.logout();
		expect(await repos.auth.currentSession()).toBeNull();
	});

	it('cambiar la contraseña exige la prueba de la actual y conserva la clave maestra', async () => {
		const { repos } = make();
		const change = await changePasswordKeys(
			DEMO_USER_PASSWORD,
			'Nueva123!x',
			DEMO_USER_ID,
			DEMO_KEYS,
			LIGHT_KDF
		);
		expect(
			await errorOf(
				repos.auth.changePassword({
					currentAuthKey: 'prueba-falsa',
					newAuthKey: change.newAuthKey,
					keys: change.keys
				})
			)
		).toEqual({ kind: 'validation', fields: { currentPassword: 'wrong-password' } });
		await repos.auth.changePassword({
			currentAuthKey: change.currentAuthKey,
			newAuthKey: change.newAuthKey,
			keys: change.keys
		});
		expect((await repos.auth.keys()).keysVersion).toBe(DEMO_KEYS.keysVersion + 1);
		await repos.auth.logout();
		expect((await logIn(repos, DEMO_USER_EMAIL, 'Nueva123!x')).user.email).toBe(DEMO_USER_EMAIL);
		expect((await errorOf(logIn(repos, DEMO_USER_EMAIL, DEMO_USER_PASSWORD))).kind).toBe(
			'unauthorized'
		);
	});

	it('eliminar la cuenta exige la prueba de la contraseña', async () => {
		const { repos, db } = make();
		expect(await errorOf(repos.auth.deleteAccount('prueba-falsa'))).toEqual({
			kind: 'validation',
			fields: { password: 'wrong-password' }
		});
		expect(db.session).not.toBeNull();
		const { kdf } = await repos.auth.prelogin(DEMO_USER_EMAIL);
		const { authKey } = await deriveFromPassword(DEMO_USER_PASSWORD, kdf);
		await repos.auth.deleteAccount(authKey);
		expect(db.session).toBeNull();
	});

	describe('recuperación', () => {
		it('no revela si el correo existe y el token es de un solo uso', async () => {
			const { repos } = make('normal', { startAuthenticated: false });
			await repos.auth.requestPasswordReset('no@existe.com'); // no lanza
			expect(await errorOf(repos.auth.passwordResetBundle(RESET_TOKEN))).toEqual({
				kind: 'validation',
				fields: { token: 'invalid-token' }
			});
			await repos.auth.requestPasswordReset(DEMO_USER_EMAIL);
			const bundle = await repos.auth.passwordResetBundle(RESET_TOKEN);
			expect(bundle.userId).toBe(DEMO_USER_ID);
			const recovered = await recoverWithRecoveryKey(
				DEMO_RECOVERY_KEY,
				'Nueva123!',
				bundle.userId,
				bundle,
				LIGHT_KDF
			);
			const request = {
				token: RESET_TOKEN,
				mode: 'keep' as const,
				newAuthKey: recovered.newAuthKey,
				recoveryAuth: recovered.recoveryAuth,
				keys: recovered.keys
			};
			await repos.auth.resetPassword(request);
			expect((await logIn(repos, DEMO_USER_EMAIL, 'Nueva123!')).user.email).toBe(DEMO_USER_EMAIL);
			expect(await errorOf(repos.auth.resetPassword(request))).toMatchObject({
				kind: 'validation'
			});
		});

		it('conservar las notas exige la prueba de la clave de recuperación', async () => {
			const { repos } = make('normal', { startAuthenticated: false });
			await repos.auth.requestPasswordReset(DEMO_USER_EMAIL);
			const bundle = await repos.auth.passwordResetBundle(RESET_TOKEN);
			const recovered = await recoverWithRecoveryKey(
				DEMO_RECOVERY_KEY,
				'Nueva123!',
				bundle.userId,
				bundle,
				LIGHT_KDF
			);
			expect(
				await errorOf(
					repos.auth.resetPassword({
						token: RESET_TOKEN,
						mode: 'keep',
						newAuthKey: recovered.newAuthKey,
						recoveryAuth: 'prueba-falsa',
						keys: recovered.keys
					})
				)
			).toEqual({ kind: 'validation', fields: { recoveryKey: 'invalid-recovery-key' } });
		});

		it('empezar de cero borra las notas del servidor y da claves nuevas', async () => {
			const { repos, db } = make('normal', { startAuthenticated: false });
			expect(db.notes.length).toBeGreaterThan(0);
			await repos.auth.requestPasswordReset(DEMO_USER_EMAIL);
			const bundle = await repos.auth.passwordResetBundle(RESET_TOKEN);
			const account = await createAccountKeys('Nueva123!', LIGHT_KDF, bundle.userId);
			await repos.auth.resetPassword({
				token: RESET_TOKEN,
				mode: 'wipe',
				newAuthKey: account.authKey,
				recoveryAuth: account.recoveryAuth,
				keys: account.keys
			});
			expect(db.notes).toHaveLength(0);
			expect(db.folders).toHaveLength(0);
			const session = await logIn(repos, DEMO_USER_EMAIL, 'Nueva123!');
			expect(session.keys.wrappedMasterKey).not.toBe(DEMO_KEYS.wrappedMasterKey);
		});

		it('cambiar la clave de recuperación invalida la anterior', async () => {
			const { repos } = make();
			const rotated = await rotateRecoveryKeys(DEMO_USER_PASSWORD, DEMO_USER_ID, DEMO_KEYS);
			await repos.auth.rotateRecoveryKey({
				authKey: rotated.authKey,
				recoveryAuth: rotated.recoveryAuth,
				recoveryWrappedMasterKey: rotated.recoveryWrappedMasterKey
			});
			await repos.auth.requestPasswordReset(DEMO_USER_EMAIL);
			const bundle = await repos.auth.passwordResetBundle(RESET_TOKEN);
			// La clave anterior ya no abre la clave maestra guardada.
			await expect(
				recoverWithRecoveryKey(DEMO_RECOVERY_KEY, 'Nueva123!', bundle.userId, bundle, LIGHT_KDF)
			).rejects.toThrow();
			const ok = await recoverWithRecoveryKey(
				rotated.recoveryKey,
				'Nueva123!',
				bundle.userId,
				bundle,
				LIGHT_KDF
			);
			expect(ok.recoveryAuth).toBe(rotated.recoveryAuth);
		});
	});
});

describe('escenarios del simulador', () => {
	it('sin conexión: lo remoto falla, lo local sigue funcionando', async () => {
		const { repos, scenario } = make();
		scenario.offline = true;
		expect((await errorOf(repos.sync.syncNow())).kind).toBe('network');
		expect((await errorOf(repos.share.createLink('n_1', fakeShare))).kind).toBe('network');
		expect((await errorOf(repos.devices.list())).kind).toBe('network');
		expect((await repos.sync.snapshot()).phase).toBe('offline');
		const n = await repos.notes.create({ title: 'Sin red' }); // las notas se guardan localmente
		expect(n.syncStatus).toBe('pending');
		expect((await repos.sync.snapshot()).pendingCount).toBe(1);
	});

	it('error de servidor: falla la carga de listas y las llamadas remotas', async () => {
		const { repos, scenario } = make();
		scenario.serverError = true;
		expect((await errorOf(repos.notes.list())).kind).toBe('server');
		expect((await errorOf(repos.folders.list())).kind).toBe('server');
		expect((await errorOf(repos.sync.syncNow())).kind).toBe('server');
		expect((await repos.sync.snapshot()).phase).toBe('error');
	});

	it('sesión expirada: la sesión y las llamadas remotas lo reportan; iniciar sesión sigue funcionando', async () => {
		const { repos, scenario } = make();
		scenario.sessionExpired = true;
		expect((await errorOf(repos.auth.currentSession())).kind).toBe('session-expired');
		expect((await errorOf(repos.sync.syncNow())).kind).toBe('session-expired');
		const { kdf } = await repos.auth.prelogin(DEMO_USER_EMAIL);
		const { authKey } = await deriveFromPassword(DEMO_USER_PASSWORD, kdf);
		expect((await repos.auth.login({ email: DEMO_USER_EMAIL, authKey })).user.email).toBe(
			DEMO_USER_EMAIL
		);
	});

	it('la latencia retrasa las llamadas', async () => {
		const { repos, scenario } = make();
		scenario.latencyMs = 40;
		const t = performance.now();
		await repos.notes.list();
		expect(performance.now() - t).toBeGreaterThanOrEqual(35);
	});

	it('clear() restablece los interruptores', () => {
		const { scenario } = make();
		Object.assign(scenario, {
			offline: true,
			serverError: true,
			sessionExpired: true,
			latencyMs: 9
		});
		scenario.clear();
		expect([
			scenario.offline,
			scenario.serverError,
			scenario.sessionExpired,
			scenario.latencyMs
		]).toEqual([false, false, false, 0]);
	});
});

describe('sincronización', () => {
	it('sube lo pendiente y sube la revisión', async () => {
		const { repos } = make();
		const n = await repos.notes.create({ title: 'Para subir' });
		expect((await repos.sync.snapshot()).pendingCount).toBe(1);
		const snap = await repos.sync.syncNow();
		expect(snap).toMatchObject({ pendingCount: 0, phase: 'idle', conflicts: [] });
		expect(snap.lastSyncedAt).toBe(NOW.toISOString());
		const after = await repos.notes.get(n.id);
		expect(after).toMatchObject({ syncStatus: 'synced', revision: 1 });
	});

	it('genera un conflicto una sola vez y se resuelve con "usar la mía"', async () => {
		const { repos, scenario } = make();
		scenario.injectConflict = true;
		const snap = await repos.sync.syncNow();
		expect(snap.conflicts).toHaveLength(1);
		expect(scenario.injectConflict).toBe(false);
		const c = snap.conflicts[0];
		expect(c.remote.deviceName).toBe('Pixel 8');
		expect((await repos.notes.get(c.noteId)).syncStatus).toBe('conflict');
		const resolved = await repos.sync.resolveConflict(c.noteId, 'local');
		expect(resolved.conflicts).toEqual([]);
		expect((await repos.notes.get(c.noteId)).content).toBe(c.local.content);
	});

	it('resolver con "usar la de la nube" reemplaza el contenido', async () => {
		const { repos, scenario } = make();
		scenario.injectConflict = true;
		const c = (await repos.sync.syncNow()).conflicts[0];
		await repos.sync.resolveConflict(c.noteId, 'remote');
		const note = await repos.notes.get(c.noteId);
		expect(note.content).toBe(c.remote.content);
		expect(note.syncStatus).toBe('synced');
	});

	it('"conservar ambas" crea una copia con la versión remota', async () => {
		const { repos, scenario } = make();
		scenario.injectConflict = true;
		const c = (await repos.sync.syncNow()).conflicts[0];
		const before = (await repos.notes.list()).length;
		await repos.sync.resolveConflict(c.noteId, 'both');
		const notes = await repos.notes.list();
		expect(notes).toHaveLength(before + 1);
		expect(
			notes.some((n) => n.title.endsWith('(conflicto)') && n.content === c.remote.content)
		).toBe(true);
	});
});

describe('dispositivos, ajustes y compartir', () => {
	it('lista dispositivos y no deja quitar el actual', async () => {
		const { repos } = make();
		const list = await repos.devices.list();
		expect(list.map((d) => d.name)).toEqual(['Laptop Fedora', 'Pixel 8', 'PC de la universidad']);
		expect(await errorOf(repos.devices.remove('d_laptop'))).toMatchObject({ kind: 'validation' });
		await repos.devices.remove('d_pixel');
		expect(await repos.devices.list()).toHaveLength(2);
	});

	it('guarda ajustes parciales', async () => {
		const { repos } = make();
		expect((await repos.settings.update({ theme: 'dark', wifiOnly: true })).theme).toBe('dark');
		expect(await repos.settings.get()).toMatchObject({
			theme: 'dark',
			wifiOnly: true,
			autoSync: true
		});
	});

	describe('enlaces compartidos', () => {
		/** Lo que prepara el cliente: copia cifrada con una clave propia del enlace. */
		async function share(note: { id: string; title: string; content: string }) {
			return createShare(await createDemoVault(), note);
		}

		it('crea un enlace por nota (idempotente), lo lee por su slug y lo revoca', async () => {
			const { repos } = make();
			const [n] = await repos.notes.list();
			const input = await share(n);
			const a = await repos.share.createLink(n.id, input);
			expect(a).toMatchObject({ noteId: n.id, slug: input.slug, payload: input.payload });
			// Pedirlo otra vez no crea otro: devuelve el que ya existe.
			const b = await repos.share.createLink(n.id, await share(n));
			expect(b).toEqual(a);
			expect(await repos.share.getLink(n.id)).toEqual(a);
			expect((await repos.share.readPublic(input.slug)).payload).toBe(input.payload);

			await repos.share.revokeLink(n.id);
			expect(await repos.share.getLink(n.id)).toBeNull();
			expect(await errorOf(repos.share.readPublic(input.slug))).toMatchObject({
				kind: 'not-found'
			});
			await repos.notes.moveToTrash(n.id);
			expect(await errorOf(repos.share.createLink(n.id, await share(n)))).toMatchObject({
				kind: 'not-found'
			});
		});

		it('el servidor no guarda el texto de la nota compartida', async () => {
			const { repos, db } = make();
			const [n] = await repos.notes.list();
			await repos.share.createLink(n.id, await share(n));
			const stored = JSON.stringify(db.shareLinks);
			expect(stored).not.toContain(n.title);
			expect(stored).not.toContain(n.content.slice(0, 20));
		});

		it('rechaza lo que no tiene forma de enlace cifrado o repite el slug', async () => {
			const { repos } = make();
			const [one, two] = await repos.notes.list();
			const good = await share(one);
			expect(await errorOf(repos.share.createLink(one.id, { ...good, slug: 'corto' }))).toEqual({
				kind: 'validation',
				fields: { slug: 'invalid-slug' }
			});
			expect(
				await errorOf(repos.share.createLink(one.id, { ...good, payload: 'texto en claro' }))
			).toEqual({ kind: 'validation', fields: { payload: 'invalid-payload' } });
			await repos.share.createLink(one.id, good);
			expect(
				await errorOf(repos.share.createLink(two.id, { ...(await share(two)), slug: good.slug }))
			).toEqual({ kind: 'validation', fields: { slug: 'slug-taken' } });
		});

		it('cambiar la copia de un enlace exige que exista', async () => {
			const { repos } = make();
			const [n] = await repos.notes.list();
			expect(
				await errorOf(repos.share.updateLinkPayload(n.id, 'a1.AAAAAAAAAAAAAAAA.xx'))
			).toMatchObject({
				kind: 'not-found'
			});
			const input = await share(n);
			await repos.share.createLink(n.id, input);
			const next = await share({ ...n, content: 'otro' });
			await repos.share.updateLinkPayload(n.id, next.payload);
			expect((await repos.share.readPublic(input.slug)).payload).toBe(next.payload);
			expect(await errorOf(repos.share.updateLinkPayload(n.id, 'texto'))).toMatchObject({
				kind: 'validation'
			});
		});

		it('quien abre el enlace no necesita sesión, pero sí red', async () => {
			const { repos, scenario } = make();
			const [n] = await repos.notes.list();
			const input = await share(n);
			await repos.share.createLink(n.id, input);
			scenario.sessionExpired = true;
			expect((await repos.share.readPublic(input.slug)).payload).toBe(input.payload);
			scenario.offline = true;
			expect((await errorOf(repos.share.readPublic(input.slug))).kind).toBe('network');
		});
	});
});
