import 'fake-indexeddb/auto';
import { createLocalBackend, type LocalBackend } from '#lib/data/local/create-local-backend.js';
import { createDemoVault } from '#lib/data/mock/demo-vault.js';
import { MockDatabase } from '#lib/data/mock/mock-database.js';
import type {
	ConflictResolution,
	EncryptedFolder,
	EncryptedNote,
	EncryptedSyncRequest,
	EncryptedSyncResponse,
	Id
} from '#lib/domain/index.js';
import { decryptFolder, decryptNote } from './note-codec.js';
import type { Vault } from './vault.js';

/**
 * Vectores de **comportamiento de sincronización** (`docs/api/vectors/sync-behavior.json`).
 *
 * Se generan ejecutando el código real (`outbox.ts`, `LocalSyncRepository` y `MockSyncServer`) con
 * reloj e identificadores fijos, y describen el estado en **campos lógicos** (id, título, texto,
 * revisión, estado, cola, conflictos, cursor), nunca en bytes cifrados. El móvil los reproduce en su
 * fase 7 para comprobar que se comporta igual (ver §7 del plan).
 *
 * Convenciones del vector:
 *  - `steps[]` describe cada acción; `device` indica si la hizo `a` (el dispositivo observado) o `b`.
 *  - `expected[]` es el estado de `a` **después** de cada paso (misma longitud que `steps`).
 *  - Los ids de notas y carpetas son deterministas: se parchea `crypto.getRandomValues` con una
 *    secuencia fija mientras se generan.
 */

interface LogicalNote {
	id: Id;
	title: string;
	content: string;
	revision: number;
	syncStatus: string;
	deleted: boolean;
	folderId: Id | null;
	pinned: boolean;
}

interface LogicalFolder {
	id: Id;
	name: string;
	revision: number;
}

interface LogicalConflict {
	noteId: Id;
	local: { title: string; content: string; device: string };
	remote: { title: string; content: string; device: string };
}

interface LogicalState {
	notes: LogicalNote[];
	folders: LogicalFolder[];
	outbox: { entity: string; entityId: Id; op: string; baseRevision: number; version: number }[];
	conflicts: LogicalConflict[];
	cursor: string | null;
	lastSyncedAt: string | null;
	pendingCount: number;
}

/**
 * Un intercambio `POST /sync` del dispositivo `a`, en campos lógicos (sin bytes cifrados): lo que
 * necesita un transporte guionizado para reproducir el protocolo sin un servidor real.
 */
interface LogicalRequest {
	cursor: string | null;
	changes: { entity: string; id: Id; op: string; baseRevision: number }[];
}
interface LogicalRemoteNote {
	id: Id;
	title: string;
	content: string;
	folderId: Id | null;
	revision: number;
	deletedAt: string | null;
}
interface LogicalRemoteFolder {
	id: Id;
	name: string;
	revision: number;
}
interface LogicalRemoteChange {
	entity: string;
	id: Id;
	deleted: boolean;
	revision: number;
	note?: LogicalRemoteNote;
	folder?: LogicalRemoteFolder;
}
interface LogicalConflictReport {
	noteId: Id;
	remote: { title: string; content: string };
	remoteDeviceName: string;
}
interface LogicalResponse {
	cursor: string;
	hasMore: boolean;
	applied: { entity: string; id: Id; revision: number }[];
	conflicts: LogicalConflictReport[];
	remoteChanges: LogicalRemoteChange[];
}
interface LogicalExchange {
	request: LogicalRequest;
	response: LogicalResponse;
}

const NOW = new Date('2026-03-04T10:00:00.000Z');
const now = () => NOW;
const USER_ID = 'u_test';

/** Secuencia determinista de bytes aleatorios: ids y IVs estables entre ejecuciones. */
async function withDeterministicRandom<T>(fn: () => Promise<T>): Promise<T> {
	const original = crypto.getRandomValues.bind(crypto);
	let counter = 0;
	crypto.getRandomValues = ((array: Uint8Array) => {
		for (let i = 0; i < array.length; i++) array[i] = (counter++ * 37 + 11) & 0xff;
		return array;
	}) as unknown as typeof crypto.getRandomValues;
	try {
		return await fn();
	} finally {
		crypto.getRandomValues = original;
	}
}

/** Transporte que pagina `remoteChanges` alrededor de `MockSyncServer` (que no pagina por sí solo). */
function paginating(
	inner: (req: EncryptedSyncRequest) => Promise<EncryptedSyncResponse>,
	pageSize: number
) {
	let buffer: EncryptedSyncResponse['remoteChanges'] | null = null;
	let offset = 0;
	let realCursor = '';
	return async (req: EncryptedSyncRequest): Promise<EncryptedSyncResponse> => {
		if (buffer && offset > 0) {
			const page = buffer.slice(offset, offset + pageSize);
			offset += page.length;
			const hasMore = offset < buffer.length;
			return {
				cursor: hasMore ? `page:${offset}` : realCursor,
				applied: [],
				remoteChanges: page,
				conflicts: [],
				hasMore
			};
		}
		const response = await inner(req);
		if (response.remoteChanges.length > pageSize) {
			buffer = response.remoteChanges;
			realCursor = response.cursor;
			offset = pageSize;
			return {
				...response,
				remoteChanges: buffer.slice(0, pageSize),
				cursor: `page:${offset}`,
				hasMore: true
			};
		}
		return { ...response, hasMore: false };
	};
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

class Harness {
	readonly a: LocalBackend;
	readonly b: LocalBackend;
	readonly steps: Record<string, unknown>[] = [];
	readonly expected: LogicalState[] = [];
	private readonly devices: Record<'a' | 'b', LocalBackend>;
	private readonly vaultA: Vault;
	/** El transporte real que ve `a` (sin grabar). `installPagination`/`editDuringSync` lo sustituyen. */
	private innerSyncA: (req: EncryptedSyncRequest) => Promise<EncryptedSyncResponse>;
	/** Intercambios grabados desde el último `exchanges = []`. */
	private exchanges: LogicalExchange[] = [];

	private constructor(a: LocalBackend, b: LocalBackend, vaultA: Vault) {
		this.a = a;
		this.b = b;
		this.vaultA = vaultA;
		this.devices = { a, b };
		this.innerSyncA = a.local.server.sync.bind(a.local.server);
		// Grabador permanente: envuelve lo que haya en `innerSyncA` en cada momento (la paginación y
		// la edición en vuelo lo sustituyen a él, no esta capa) y registra cada intercambio real.
		a.local.server.sync = async (req: EncryptedSyncRequest) => {
			const response = await this.innerSyncA(req);
			this.exchanges.push(await this.toLogicalExchange(req, response));
			return response;
		};
	}

	static async create(name: string): Promise<Harness> {
		const server = new MockDatabase({ now });
		// Cuenta vacía: el servidor simulado decide la cuenta por la sesión, no por el cliente.
		server.session = {
			user: {
				id: USER_ID,
				email: 'test@correo.com',
				fullName: 'Cuenta de prueba',
				emailVerified: true,
				hasGoogle: false,
				createdAt: NOW.toISOString()
			},
			expiresAt: new Date(NOW.getTime() + 60 * 60_000).toISOString()
		};
		const [vaultA, vaultB] = await Promise.all([createDemoVault(), createDemoVault()]);
		const a = createLocalBackend({
			vault: () => vaultA,
			dbName: `sbb-${name}-a`,
			userId: USER_ID,
			server,
			now,
			device: { id: 'd_a', name: 'A' }
		});
		const b = createLocalBackend({
			vault: () => vaultB,
			dbName: `sbb-${name}-b`,
			userId: USER_ID,
			server,
			now,
			device: { id: 'd_b', name: 'B' }
		});
		return new Harness(a, b, vaultA);
	}

	/** Versión lógica (sin bytes cifrados) de una nota remota: lo que decodificaría el móvil. */
	private async logicalNote(note: EncryptedNote): Promise<LogicalRemoteNote> {
		const plain = await decryptNote(this.vaultA, note, 'synced');
		return {
			id: note.id,
			title: plain.title,
			content: plain.content,
			folderId: note.folderId,
			revision: note.revision,
			deletedAt: note.deletedAt
		};
	}

	private async logicalFolder(folder: EncryptedFolder): Promise<LogicalRemoteFolder> {
		const plain = await decryptFolder(this.vaultA, folder);
		return { id: folder.id, name: plain.name, revision: folder.revision };
	}

	private async toLogicalExchange(
		req: EncryptedSyncRequest,
		response: EncryptedSyncResponse
	): Promise<LogicalExchange> {
		return {
			request: {
				cursor: req.cursor,
				changes: req.changes.map((c) => ({
					entity: c.entity,
					id: c.id,
					op: c.op,
					baseRevision: c.baseRevision
				}))
			},
			response: {
				cursor: response.cursor,
				hasMore: !!response.hasMore,
				applied: response.applied,
				conflicts: await Promise.all(
					response.conflicts.map(async (c) => ({
						noteId: c.noteId,
						remote: await this.logicalNote(c.remote).then(({ title, content }) => ({
							title,
							content
						})),
						remoteDeviceName: c.remoteDeviceName
					}))
				),
				remoteChanges: await Promise.all(
					response.remoteChanges.map(async (ch) => ({
						entity: ch.entity,
						id: ch.id,
						deleted: ch.deleted,
						revision: ch.revision,
						...(ch.note ? { note: await this.logicalNote(ch.note) } : {}),
						...(ch.folder ? { folder: await this.logicalFolder(ch.folder) } : {})
					}))
				)
			}
		};
	}

	private dev(who: 'a' | 'b') {
		return this.devices[who];
	}

	/** Estado lógico observable del dispositivo `a`. */
	async state(): Promise<LogicalState> {
		const deps = this.a;
		const active = await deps.repos.notes.list();
		const trash = await deps.repos.notes.list({ filter: { kind: 'trash' } });
		const folderRevision = new Map(
			(await deps.local.db.folders.toArray()).map((f) => [f.id, f.revision])
		);
		const folders = (await deps.repos.folders.list()).map((f) => ({
			id: f.id,
			name: f.name,
			revision: folderRevision.get(f.id) ?? 0
		}));
		const outbox = await deps.local.db.outbox.orderBy('seq').toArray();
		const snapshot = await deps.repos.sync.snapshot();
		return {
			notes: [...active, ...trash]
				.map((n) => ({
					id: n.id,
					title: n.title,
					content: n.content,
					revision: n.revision,
					syncStatus: n.syncStatus,
					deleted: n.deletedAt !== null,
					folderId: n.folderId,
					pinned: n.pinned
				}))
				.sort(byId),
			folders: folders.sort(byId),
			outbox: outbox.map((o) => ({
				entity: o.entity,
				entityId: o.entityId,
				op: o.op,
				baseRevision: o.baseRevision,
				version: o.version
			})),
			conflicts: snapshot.conflicts.map((c) => ({
				noteId: c.noteId,
				local: { title: c.local.title, content: c.local.content, device: c.local.deviceName },
				remote: { title: c.remote.title, content: c.remote.content, device: c.remote.deviceName }
			})),
			cursor: (await deps.local.db.getMeta<string>('cursor')) ?? null,
			lastSyncedAt: snapshot.lastSyncedAt,
			pendingCount: snapshot.pendingCount
		};
	}

	private async record(op: Record<string, unknown>) {
		this.steps.push(op);
		this.expected.push(await this.state());
	}

	async sync(who: 'a' | 'b' = 'a') {
		this.exchanges = [];
		await this.dev(who).repos.sync.syncNow();
		const exchanges = who === 'a' ? this.exchanges : undefined;
		await this.record({ op: 'sync', device: who, ...(exchanges ? { exchanges } : {}) });
	}

	async createNote(who: 'a' | 'b', draft: { title?: string; content?: string; folderId?: Id }) {
		const note = await this.dev(who).repos.notes.create(draft);
		await this.record({ op: 'createNote', device: who, id: note.id, ...draft });
		return note;
	}

	async updateNote(
		who: 'a' | 'b',
		id: Id,
		patch: { title?: string; content?: string; pinned?: boolean }
	) {
		await this.dev(who).repos.notes.update(id, patch);
		await this.record({ op: 'updateNote', device: who, id, ...patch });
	}

	async moveToTrash(who: 'a' | 'b', id: Id) {
		await this.dev(who).repos.notes.moveToTrash(id);
		await this.record({ op: 'moveToTrash', device: who, id });
	}

	async restore(who: 'a' | 'b', id: Id) {
		await this.dev(who).repos.notes.restore(id);
		await this.record({ op: 'restore', device: who, id });
	}

	async deleteForever(who: 'a' | 'b', id: Id) {
		await this.dev(who).repos.notes.deleteForever(id);
		await this.record({ op: 'deleteForever', device: who, id });
	}

	async createFolder(who: 'a' | 'b', name: string) {
		const folder = await this.dev(who).repos.folders.create(name);
		await this.record({ op: 'createFolder', device: who, id: folder.id, name });
		return folder;
	}

	async renameFolder(who: 'a' | 'b', id: Id, name: string) {
		await this.dev(who).repos.folders.rename(id, name);
		await this.record({ op: 'renameFolder', device: who, id, name });
	}

	async deleteFolder(who: 'a' | 'b', id: Id) {
		await this.dev(who).repos.folders.delete(id);
		await this.record({ op: 'deleteFolder', device: who, id });
	}

	async resolveConflict(id: Id, resolution: ConflictResolution) {
		await this.a.repos.sync.resolveConflict(id, resolution);
		await this.record({ op: 'resolveConflict', device: 'a', id, resolution });
	}

	/** Edita la nota mientras su sincronización está en vuelo (el cambio nuevo queda pendiente). */
	async editDuringSync(id: Id, patch: { content?: string }) {
		this.exchanges = [];
		const dev = this.a;
		const original = this.innerSyncA;
		this.innerSyncA = async (req) => {
			const response = await original(req);
			await dev.repos.notes.update(id, patch);
			return response;
		};
		try {
			await dev.repos.sync.syncNow();
		} finally {
			this.innerSyncA = original;
		}
		await this.record({
			op: 'editDuringSync',
			device: 'a',
			id,
			...patch,
			editDuringSync: this.exchanges.length - 1,
			exchanges: this.exchanges
		});
	}

	/** Envuelve el transporte de `a` para paginar `remoteChanges` con el tamaño dado. */
	installPagination(pageSize: number) {
		this.innerSyncA = paginating(this.innerSyncA, pageSize);
	}

	toJson(name: string, initial: LogicalState) {
		return { name, initial, steps: this.steps, expected: this.expected };
	}
}

/** Un escenario: se le da un arnés recién creado y lo llena. */
type ScenarioBuilder = (h: Harness) => Promise<void>;

const SCENARIOS: { name: string; build: ScenarioBuilder }[] = [
	{
		name: 'cola-fusiona-ediciones',
		build: async (h) => {
			await h.sync();
			const note = await h.createNote('a', { title: 'Idea', content: 'uno' });
			await h.updateNote('a', note.id, { content: 'uno dos' });
			await h.updateNote('a', note.id, { content: 'uno dos tres' });
			await h.sync();
		}
	},
	{
		name: 'crear-y-borrar-antes-de-sincronizar',
		build: async (h) => {
			await h.sync();
			const note = await h.createNote('a', { title: 'Efímera' });
			await h.moveToTrash('a', note.id);
			await h.deleteForever('a', note.id);
			await h.sync();
		}
	},
	{
		name: 'editar-durante-la-sincronizacion',
		build: async (h) => {
			await h.sync();
			const note = await h.createNote('a', { title: 'En vuelo', content: 'v1' });
			await h.editDuringSync(note.id, { content: 'v2' });
			await h.sync();
		}
	},
	{
		name: 'conflicto-resolucion-local',
		build: async (h) => {
			await h.sync();
			await h.sync('b');
			const note = await h.createNote('a', { title: 'Compartida', content: 'base' });
			await h.sync();
			await h.sync('b');
			await h.updateNote('a', note.id, { content: 'versión de A' });
			await h.updateNote('b', note.id, { content: 'versión de B' });
			await h.sync('b');
			await h.sync();
			await h.resolveConflict(note.id, 'local');
			await h.sync();
			await h.sync('b');
		}
	},
	{
		name: 'conflicto-resolucion-remote',
		build: async (h) => {
			await h.sync();
			await h.sync('b');
			const note = await h.createNote('a', { title: 'Compartida', content: 'base' });
			await h.sync();
			await h.sync('b');
			await h.updateNote('a', note.id, { content: 'versión de A' });
			await h.updateNote('b', note.id, { content: 'versión de B' });
			await h.sync('b');
			await h.sync();
			await h.resolveConflict(note.id, 'remote');
			await h.sync();
		}
	},
	{
		name: 'conflicto-resolucion-both',
		build: async (h) => {
			await h.sync();
			await h.sync('b');
			const note = await h.createNote('a', { title: 'Compartida', content: 'base' });
			await h.sync();
			await h.sync('b');
			await h.updateNote('a', note.id, { content: 'versión de A' });
			await h.updateNote('b', note.id, { content: 'versión de B' });
			await h.sync('b');
			await h.sync();
			await h.resolveConflict(note.id, 'both');
			await h.sync();
		}
	},
	{
		name: 'cambio-remoto-con-local-pendiente',
		build: async (h) => {
			await h.sync();
			await h.sync('b');
			const local = await h.createNote('a', { title: 'Local', content: 'base' });
			const remota = await h.createNote('a', { title: 'Remota', content: 'base' });
			await h.sync();
			await h.sync('b');
			// A edita una (queda pendiente) mientras B edita la otra y la sube.
			await h.updateNote('a', local.id, { content: 'local pendiente' });
			await h.updateNote('b', remota.id, { content: 'remoto' });
			await h.sync('b');
			// A sube su pendiente y baja lo remoto de la otra nota (sin pisarse).
			await h.sync();
		}
	},
	{
		name: 'borrado-remoto',
		build: async (h) => {
			await h.sync();
			await h.sync('b');
			const note = await h.createNote('a', { title: 'Para borrar', content: 'x' });
			await h.sync();
			await h.sync('b');
			await h.moveToTrash('b', note.id);
			await h.deleteForever('b', note.id);
			await h.sync('b');
			await h.sync();
		}
	},
	{
		name: 'carpeta-gana-el-ultimo',
		build: async (h) => {
			await h.sync();
			await h.sync('b');
			const folder = await h.createFolder('a', 'Proyectos');
			await h.sync();
			await h.sync('b');
			await h.renameFolder('a', folder.id, 'Proyectos de A');
			await h.renameFolder('b', folder.id, 'Proyectos de B');
			await h.sync('b');
			await h.sync();
		}
	},
	{
		name: 'paginacion-con-hasmore',
		build: async (h) => {
			await h.sync('a');
			await h.sync('b');
			for (let i = 0; i < 5; i++) await h.createNote('b', { title: `B${i}`, content: `nota ${i}` });
			await h.sync('b');
			h.installPagination(2);
			await h.sync();
		}
	},
	{
		name: 'carpeta-antes-que-nota',
		build: async (h) => {
			await h.sync();
			await h.sync('b');
			const folder = await h.createFolder('b', 'Carpeta');
			await h.createNote('b', { title: 'Nota', content: 'x', folderId: folder.id });
			await h.sync('b');
			await h.sync();
			// `a` debe aplicar la carpeta antes de la nota para que la nota quede dentro.
		}
	},
	{
		name: 'editar-y-borrar-una-nota-ya-sincronizada',
		build: async (h) => {
			await h.sync();
			const note = await h.createNote('a', { title: 'Editar y borrar', content: 'v1' });
			await h.sync();
			// Sincronizada (revision > 0): editar y luego borrar deja solo el borrado, con esa revisión.
			await h.updateNote('a', note.id, { content: 'v2' });
			await h.moveToTrash('a', note.id);
			await h.deleteForever('a', note.id);
			await h.sync();
		}
	},
	{
		name: 'conflicto-no-bloquea-el-envio-de-otras',
		build: async (h) => {
			await h.sync();
			await h.sync('b');
			const shared = await h.createNote('a', { title: 'Compartida', content: 'base' });
			const other = await h.createNote('a', { title: 'Otra', content: 'independiente' });
			await h.sync();
			await h.sync('b');
			await h.updateNote('b', shared.id, { content: 'versión de B' });
			await h.sync('b');
			// `a` sube a la vez el cambio de la compartida (entra en conflicto) y el de la otra nota.
			await h.updateNote('a', shared.id, { content: 'versión de A' });
			await h.updateNote('a', other.id, { content: 'independiente editada' });
			await h.sync();
		}
	},
	{
		name: 'cambio-remoto-actualiza-un-conflicto-abierto',
		build: async (h) => {
			await h.sync();
			await h.sync('b');
			const note = await h.createNote('a', { title: 'Compartida', content: 'base' });
			await h.sync();
			await h.sync('b');
			await h.updateNote('a', note.id, { content: 'versión de A' });
			await h.updateNote('b', note.id, { content: 'versión de B' });
			await h.sync('b');
			await h.sync(); // conflicto abierto: remoto = «versión de B»
			await h.updateNote('b', note.id, { content: 'versión de B otra vez' });
			await h.sync('b');
			await h.sync(); // sin resolver: la versión remota del conflicto se actualiza
		}
	},
	{
		name: 'borrado-remoto-de-una-nota-en-conflicto',
		build: async (h) => {
			await h.sync();
			await h.sync('b');
			const note = await h.createNote('a', { title: 'Compartida', content: 'base' });
			await h.sync();
			await h.sync('b');
			await h.updateNote('a', note.id, { content: 'versión de A' });
			await h.updateNote('b', note.id, { content: 'versión de B' });
			await h.sync('b');
			await h.sync(); // conflicto abierto
			await h.moveToTrash('b', note.id);
			await h.deleteForever('b', note.id);
			await h.sync('b');
			await h.sync();
		}
	},
	{
		name: 'carpeta-borrada-en-remoto-con-cambio-local-pendiente',
		build: async (h) => {
			await h.sync();
			await h.sync('b');
			const folder = await h.createFolder('a', 'Carpeta');
			await h.sync();
			await h.sync('b');
			await h.renameFolder('a', folder.id, 'Carpeta renombrada por A');
			await h.deleteFolder('b', folder.id);
			await h.sync('b');
			await h.sync();
		}
	},
	{
		name: 'borrar-una-carpeta-con-notas',
		build: async (h) => {
			await h.sync();
			const folder = await h.createFolder('a', 'Con notas');
			const note = await h.createNote('a', {
				title: 'Dentro',
				content: 'x',
				folderId: folder.id
			});
			await h.sync();
			await h.deleteFolder('a', note.folderId!);
			await h.sync();
		}
	},
	{
		name: 'mover-a-la-papelera-y-restaurar',
		build: async (h) => {
			await h.sync();
			const note = await h.createNote('a', { title: 'Para la papelera', content: 'x' });
			await h.sync();
			await h.moveToTrash('a', note.id);
			await h.sync();
			await h.restore('a', note.id);
			await h.sync();
		}
	},
	{
		name: 'resolver-local-y-editar-antes-de-sincronizar',
		build: async (h) => {
			await h.sync();
			await h.sync('b');
			const note = await h.createNote('a', { title: 'Compartida', content: 'base' });
			await h.sync();
			await h.sync('b');
			await h.updateNote('a', note.id, { content: 'versión de A' });
			await h.updateNote('b', note.id, { content: 'versión de B' });
			await h.sync('b');
			await h.sync(); // conflicto abierto
			await h.resolveConflict(note.id, 'local');
			await h.updateNote('a', note.id, { content: 'versión de A otra vez' });
			await h.sync();
		}
	}
];

export async function buildSyncBehaviorVector(): Promise<Record<string, unknown>> {
	return withDeterministicRandom(async () => {
		const scenarios = [];
		for (const scenario of SCENARIOS) {
			const harness = await Harness.create(scenario.name);
			const initial = await harness.state();
			try {
				await scenario.build(harness);
			} catch (e) {
				throw new Error(`escenario «${scenario.name}»: ${(e as Error).message}`, { cause: e });
			}
			scenarios.push(harness.toJson(scenario.name, initial));
		}
		return {
			version: 1,
			description:
				'Comportamiento del motor de sincronización (outbox + LocalSyncRepository + MockSyncServer) ' +
				'con reloj e ids fijos. Cada escenario lista sus `steps` (con `device` a/b) y el estado lógico ' +
				'de `a` tras cada paso en `expected`. Campos lógicos (id, título, texto, revisión, estado, cola, ' +
				'conflictos, cursor), nunca bytes cifrados. Cada paso `sync` de `a` lleva además `exchanges[]` ' +
				'(uno por página `POST /sync`) con su `request` y `response` lógicos, para reproducirlo con un ' +
				'transporte guionizado sin servidor; `editDuringSync` indica en qué intercambio ocurrió la edición.',
			scenarios
		};
	});
}
