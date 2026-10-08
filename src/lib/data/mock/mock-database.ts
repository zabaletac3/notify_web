import {
	DEFAULT_SETTINGS,
	fail,
	type AppSettings,
	type Conflict,
	type Device,
	type EncryptedFolder,
	type EncryptedNote,
	type Folder,
	type KeyBundle,
	type Note,
	type Session,
	type SharedNote,
	type User
} from '#lib/domain/index.js';
import { buildFolders, buildNotes, DEMO_DEVICE_ID } from './fixtures/index.js';
import { DEMO_AUTH_KEY_HASH, DEMO_KEYS, DEMO_RECOVERY_AUTH_HASH } from './fixtures/demo-keys.js';
import { Scenario, type Dataset } from './scenario.svelte.js';

export interface StoredUser {
	user: User;
	/**
	 * Hash de la prueba de la contraseña (`authKey`). El servidor nunca conoce la contraseña.
	 * (El real guarda Argon2id del `authKey`; aquí basta SHA-256.)
	 */
	authKeyHash: string;
	/** Hash de la prueba de la clave de recuperación. */
	recoveryAuthHash: string;
	/** Claves cifradas de la cuenta: sin la contraseña o la clave de recuperación no sirven de nada. */
	keys: KeyBundle;
}

/** Lo que el servidor de sincronización guarda de una cuenta: solo metadatos y textos cifrados. */
export interface ServerAccount {
	notes: EncryptedNote[];
	folders: EncryptedFolder[];
	/** Número del último cambio asignado. El cursor del cliente es el último que vio. */
	seq: number;
	/** Número del último cambio de cada entidad (`note:ID`, `folder:ID`). */
	entitySeq: Map<string, number>;
	/** Borrados definitivos, para avisar a los demás dispositivos. */
	tombstones: { entity: 'note' | 'folder'; id: string; seq: number; revision: number }[];
	/** `false` hasta que se cifran los datos de ejemplo (solo la cuenta de ejemplo los tiene). */
	seeded: boolean;
	/** Cifrado de los datos de ejemplo en curso (para que dos dispositivos a la vez no lo hagan dos veces). */
	seeding?: Promise<void>;
}

const emptyAccount = (seeded: boolean): ServerAccount => ({
	notes: [],
	folders: [],
	seq: 0,
	entitySeq: new Map(),
	tombstones: [],
	seeded
});

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
export const DEMO_USER_ID = 'u_1';
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
	shareLinks: SharedNote[] = [];
	settings: AppSettings = { ...DEFAULT_SETTINGS };
	session: Session | null = null;
	lastSyncedAt: string | null = null;
	resetTokens = new Map<string, string>();
	failedLogins = new Map<string, number>();
	/** Cambio de correo pendiente de confirmar con el código. */
	pendingEmailChange: { userId: string; email: string } | null = null;

	// ── Estado del "servidor de sincronización" (lo usa MockSyncServer) ──
	/** Datos cifrados de cada cuenta. La cuenta de ejemplo se rellena sola a partir de los datos de ejemplo. */
	accounts = new Map<string, ServerAccount>();
	/** Nombres de los dispositivos que han sincronizado (id → nombre). */
	deviceNames = new Map<string, string>();

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
			id: DEMO_USER_ID,
			email: DEMO_USER_EMAIL,
			fullName: 'Ana Pérez',
			emailVerified: true,
			createdAt: iso(60 * 24 * 90)
		};
		this.users = [
			{
				user: demo,
				authKeyHash: DEMO_AUTH_KEY_HASH,
				recoveryAuthHash: DEMO_RECOVERY_AUTH_HASH,
				keys: structuredClone(DEMO_KEYS)
			}
		];
		this.settings = { ...DEFAULT_SETTINGS };
		this.conflicts = [];
		this.shareLinks = [];
		this.resetTokens.clear();
		this.failedLogins.clear();
		this.pendingEmailChange = null;
		this.lastSyncedAt = iso(2);
		this.normalizeFixtures();
		this.accounts.clear();
		this.deviceNames.clear();
		this.session = this.startAuthenticated
			? { user: demo, expiresAt: new Date(now.getTime() + 60 * 60000).toISOString() }
			: null;
	}

	/** Los datos de ejemplo se consideran ya sincronizados con el servidor. */
	private normalizeFixtures() {
		for (const n of this.notes) {
			n.revision = Math.max(1, n.revision);
			n.syncStatus = 'synced';
		}
	}

	/** Datos del servidor de una cuenta. Las cuentas nuevas empiezan vacías. */
	account(userId: string): ServerAccount {
		let account = this.accounts.get(userId);
		if (!account) {
			account = emptyAccount(userId !== DEMO_USER_ID);
			this.accounts.set(userId, account);
		}
		return account;
	}

	/** Borra todos los datos de una cuenta (al restablecer la contraseña sin la clave de recuperación). */
	wipeAccount(userId: string) {
		this.accounts.set(userId, emptyAccount(true));
		this.notes = [];
		this.folders = [];
		this.shareLinks = [];
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
		if (this.scenario.deviceRevoked && !options.ignoreExpired) throw fail.deviceRevoked();
		if (this.scenario.sessionExpired && !options.ignoreExpired) throw fail.sessionExpired();
	}

	private delay() {
		return this.scenario.latencyMs > 0 ? sleep(this.scenario.latencyMs) : Promise.resolve();
	}
}
