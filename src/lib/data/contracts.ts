import type {
	AppSettings,
	Conflict,
	ConflictResolution,
	Device,
	Folder,
	Id,
	LoginInput,
	Note,
	NoteDraft,
	NoteQuery,
	RegisterInput,
	Session,
	ShareLink,
	StorageUsage,
	SyncRequest,
	SyncResponse,
	SyncSnapshot,
	User
} from '#lib/domain/index.js';

/**
 * Contratos de datos. La UI y el estado solo dependen de estas interfaces.
 * Hoy las implementa `data/mock`; después `data/local` (IndexedDB) y `data/remote` (API).
 *
 * Convención: devuelven la entidad resultante; ante un fallo lanzan `AppFailure`
 * (ver `domain/errors.ts`). Nunca devuelven `null` para "no existe": lanzan `not-found`.
 */

export interface NoteRepository {
	/** Notas que cumplen la consulta. La papelera solo sale con `filter: { kind: 'trash' }`. */
	list(query?: NoteQuery): Promise<Note[]>;
	get(id: Id): Promise<Note>;
	create(draft?: NoteDraft): Promise<Note>;
	update(id: Id, patch: NoteDraft): Promise<Note>;
	duplicate(id: Id): Promise<Note>;
	moveToTrash(id: Id): Promise<Note>;
	restore(id: Id): Promise<Note>;
	deleteForever(id: Id): Promise<void>;
	/** Vacía la papelera y devuelve cuántas notas eliminó. */
	emptyTrash(): Promise<number>;
}

export interface FolderRepository {
	list(): Promise<Folder[]>;
	create(name: string): Promise<Folder>;
	rename(id: Id, name: string): Promise<Folder>;
	/** Elimina la carpeta; sus notas pasan a "sin carpeta". */
	delete(id: Id): Promise<void>;
}

export interface AuthRepository {
	/** Crea la cuenta (sin verificar) y envía el código al correo. */
	register(input: RegisterInput): Promise<{ email: string }>;
	verifyEmail(email: string, code: string): Promise<User>;
	resendVerificationCode(email: string): Promise<void>;
	login(input: LoginInput): Promise<Session>;
	logout(): Promise<void>;
	/** Cambia el nombre visible. */
	updateProfile(patch: { fullName: string }): Promise<User>;
	/**
	 * Pide cambiar el correo: exige la contraseña actual y envía un código al correo nuevo.
	 * El cambio no se aplica hasta `confirmEmailChange`.
	 */
	requestEmailChange(newEmail: string, password: string): Promise<{ email: string }>;
	confirmEmailChange(email: string, code: string): Promise<User>;
	changePassword(currentPassword: string, newPassword: string): Promise<void>;
	/** Elimina la cuenta y todos sus datos (se conservan 30 días antes del borrado definitivo). */
	deleteAccount(): Promise<void>;
	/** Sesión vigente, o `null` si no hay sesión. Lanza `session-expired` si venció. */
	currentSession(): Promise<Session | null>;
	/** Siempre resuelve, exista o no la cuenta (no revela qué correos están registrados). */
	requestPasswordReset(email: string): Promise<void>;
	resetPassword(token: string, newPassword: string): Promise<void>;
}

export interface DeviceRepository {
	list(): Promise<Device[]>;
	remove(id: Id): Promise<void>;
}

export interface SettingsRepository {
	get(): Promise<AppSettings>;
	update(patch: Partial<AppSettings>): Promise<AppSettings>;
}

export interface SyncRepository {
	snapshot(): Promise<SyncSnapshot>;
	/** Sube lo pendiente y baja los cambios remotos. Puede dejar conflictos en el snapshot. */
	syncNow(): Promise<SyncSnapshot>;
	resolveConflict(noteId: Id, resolution: ConflictResolution): Promise<SyncSnapshot>;
}

/** Canal con el servidor para sincronizar. Lo implementa `mock/MockSyncServer` y, después, el cliente HTTP. */
export interface SyncTransport {
	/** Envía los cambios locales y recibe los remotos. Lanza `AppFailure` (`network`, `server`, `session-expired`…). */
	sync(request: SyncRequest): Promise<SyncResponse>;
}

export interface ShareRepository {
	createLink(noteId: Id): Promise<ShareLink>;
	revokeLink(noteId: Id): Promise<void>;
	getLink(noteId: Id): Promise<ShareLink | null>;
}

export interface StorageRepository {
	/** Espacio usado en el servidor, desglosado, frente a la cuota de la cuenta. */
	usage(): Promise<StorageUsage>;
}

export interface Repositories {
	notes: NoteRepository;
	folders: FolderRepository;
	auth: AuthRepository;
	devices: DeviceRepository;
	settings: SettingsRepository;
	sync: SyncRepository;
	share: ShareRepository;
	storage: StorageRepository;
}

export type { Conflict };
