import {
	DEFAULT_SETTINGS,
	fail,
	type AppSettings,
	type Conflict,
	type Device,
	type Folder,
	type Note,
	type Session,
	type ShareLink,
	type User
} from '#lib/domain/index.js';
import { buildFolders, buildNotes, DEMO_DEVICE_ID } from './fixtures/index.js';
import { Scenario, type Dataset } from './scenario.svelte.js';

export interface StoredUser {
	user: User;
	/** Texto plano: solo existe en el mock. */
	password: string;
}

export interface MockDatabaseOptions {
	scenario?: Scenario;
	/** Reloj inyectable para pruebas deterministas. */
	now?: () => Date;
	/** Código que "llega por correo" al registrarse. */
	verificationCode?: string;
	/** Empezar con la sesión del usuario demo ya iniciada (por defecto sí). */
	startAuthenticated?: boolean;
}

export const DEMO_USER_EMAIL = 'ana@correo.com';
export const DEMO_USER_PASSWORD = 'Secret123!';
export const RESET_TOKEN = 'token-de-prueba';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * "Servidor y base de datos" en memoria. Los repositorios mock leen y escriben aquí.
 * Los escenarios (`Scenario`) deciden cuándo y cómo fallan las llamadas.
 */
export class MockDatabase {
	readonly scenario: Scenario;
	readonly now: () => Date;
	readonly verificationCode: string;
	private readonly startAuthenticated: boolean;
	private seq = 100_000;

	notes: Note[] = [];
	folders: Folder[] = [];
	devices: Device[] = [];
	users: StoredUser[] = [];
	conflicts: Conflict[] = [];
	shareLinks: ShareLink[] = [];
	settings: AppSettings = { ...DEFAULT_SETTINGS };
	session: Session | null = null;
	lastSyncedAt: string | null = null;
	resetTokens = new Map<string, string>();
	failedLogins = new Map<string, number>();
	/** Cambio de correo pendiente de confirmar con el código. */
	pendingEmailChange: { userId: string; email: string } | null = null;

	// ── Estado del "servidor de sincronización" (lo usa MockSyncServer) ──
	/** Último número de cambio asignado. El cursor del cliente es el último que vio. */
	serverSeq = 0;
	/** Número del último cambio de cada entidad (`note:ID`, `folder:ID`). */
	entitySeq = new Map<string, number>();
	folderRevisions = new Map<string, number>();
	/** Nombres de los dispositivos que han sincronizado (id → nombre). */
	deviceNames = new Map<string, string>();
	/** Borrados definitivos, para avisar a los demás dispositivos. */
	tombstones: { entity: 'note' | 'folder'; id: string; seq: number; revision: number }[] = [];

	constructor(options: MockDatabaseOptions = {}) {
		this.scenario = options.scenario ?? new Scenario();
		this.now = options.now ?? (() => new Date());
		this.verificationCode = options.verificationCode ?? '123456';
		this.startAuthenticated = options.startAuthenticated ?? true;
		this.reset();
	}

	/** Vuelve a cargar los datos de fixtures según el dataset del escenario. */
	reset(dataset: Dataset = this.scenario.dataset) {
		const now = this.now();
		const { folders, byName } = buildFolders(now, dataset);
		this.folders = folders;
		this.notes = buildNotes(now, dataset, byName);
		const iso = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60000).toISOString();
		this.devices = [
			{
				id: DEMO_DEVICE_ID,
				name: 'Laptop Fedora',
				platform: 'linux',
				lastActiveAt: iso(0),
				current: true
			},
			{
				id: 'd_pixel',
				name: 'Pixel 8',
				platform: 'android',
				lastActiveAt: iso(120),
				current: false
			},
			{
				id: 'd_pc',
				name: 'PC de la universidad',
				platform: 'windows',
				lastActiveAt: iso(60 * 24 * 3),
				current: false
			}
		];
		const demo: User = {
			id: 'u_1',
			email: DEMO_USER_EMAIL,
			fullName: 'Ana Pérez',
			emailVerified: true,
			createdAt: iso(60 * 24 * 90)
		};
		this.users = [{ user: demo, password: DEMO_USER_PASSWORD }];
		this.settings = { ...DEFAULT_SETTINGS };
		this.conflicts = [];
		this.shareLinks = [];
		this.resetTokens.clear();
		this.failedLogins.clear();
		this.pendingEmailChange = null;
		this.lastSyncedAt = iso(2);
		this.seedSequences();
		this.session = this.startAuthenticated
			? { user: demo, expiresAt: new Date(now.getTime() + 60 * 60000).toISOString() }
			: null;
	}

	/** Numera los datos de ejemplo como si el servidor ya los tuviera (primer arranque = descarga completa). */
	private seedSequences() {
		this.entitySeq.clear();
		this.folderRevisions.clear();
		this.deviceNames.clear();
		this.tombstones = [];
		let seq = 0;
		for (const f of this.folders) {
			this.entitySeq.set(`folder:${f.id}`, ++seq);
			this.folderRevisions.set(f.id, 1);
		}
		for (const n of this.notes) {
			n.revision = Math.max(1, n.revision);
			n.syncStatus = 'synced';
			this.entitySeq.set(`note:${n.id}`, ++seq);
		}
		this.serverSeq = seq;
	}

	nextId(prefix: string): string {
		return `${prefix}_${++this.seq}`;
	}

	/** Operaciones sobre datos locales: solo fallan al leer si el escenario fuerza un error de carga. */
	async local(kind: 'read' | 'write') {
		await this.delay();
		if (kind === 'read' && this.scenario.serverError) throw fail.server();
	}

	/** Operaciones que hablan con el servidor: sin red, sesión vencida o error 500. */
	async remote(options: { ignoreExpired?: boolean } = {}) {
		await this.delay();
		if (this.scenario.offline) throw fail.network();
		if (this.scenario.serverError) throw fail.server();
		if (this.scenario.sessionExpired && !options.ignoreExpired) throw fail.sessionExpired();
	}

	private delay() {
		return this.scenario.latencyMs > 0 ? sleep(this.scenario.latencyMs) : Promise.resolve();
	}
}
