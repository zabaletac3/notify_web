import type {
	AppSettings,
	AppSettingsPatch,
	Conflict,
	ConflictResolution,
	Device,
	Folder,
	GoogleOutcome,
	GoogleRegisterInput,
	Id,
	LoginResult,
	MfaChallenge,
	MfaRecoveryCodes,
	MfaSetupResult,
	MfaStatus,
	Note,
	NoteDraft,
	NoteQuery,
	KdfParams,
	KeyBundle,
	PasswordChangeRequest,
	PasswordResetBundle,
	PasswordResetRequest,
	RecoveryKeyRotation,
	RegisterRequest,
	Session,
	PublicNote,
	ShareInput,
	SharedNote,
	StorageUsage,
	EncryptedSyncRequest,
	EncryptedSyncResponse,
	SyncSnapshot,
	TrustedDevice,
	TrustedDeviceInput,
	Sealed,
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
	/**
	 * Parámetros de derivación de la contraseña de esa cuenta. Para correos que no existen devuelve
	 * parámetros falsos y estables, para no revelar qué cuentas hay.
	 */
	prelogin(email: string): Promise<{ kdf: KdfParams }>;
	/** Crea la cuenta (sin verificar) y envía el código al correo. La contraseña nunca llega aquí. */
	register(input: RegisterRequest): Promise<{ email: string }>;
	verifyEmail(email: string, code: string): Promise<User>;
	resendVerificationCode(email: string): Promise<void>;
	/** `authKey` se deriva de la contraseña en el cliente. Devuelve la sesión y las claves cifradas. */
	login(input: { email: string; authKey: string }): Promise<LoginResult | MfaChallenge>;
	/** Segundo paso del login: completa un `MfaChallenge` con el código TOTP o de respaldo. */
	loginMfa(mfaToken: string, code: string): Promise<LoginResult>;
	/** Estado de la verificación en dos pasos de la cuenta. */
	mfaStatus(): Promise<MfaStatus>;
	/** Genera (o sustituye) un secreto TOTP pendiente. Exige la prueba de la contraseña. */
	mfaSetup(authKey: string): Promise<MfaSetupResult>;
	/** Confirma el código y activa la verificación en dos pasos; devuelve los códigos de respaldo. */
	mfaEnable(code: string): Promise<MfaRecoveryCodes>;
	/** Desactiva la verificación en dos pasos (contraseña + código). */
	mfaDisable(authKey: string, code: string): Promise<void>;
	/** Regenera los 10 códigos de respaldo (contraseña + código). */
	mfaRegenerateCodes(authKey: string, code: string): Promise<MfaRecoveryCodes>;
	/**
	 * Inicia el flujo OAuth con Google. La web envía su `challenge` (PKCE) y el servidor devuelve la
	 * URL de autorización a la que hay que redirigir. No hay ventanas emergentes ni scripts de Google.
	 */
	googleStart(challenge: string): Promise<{ url: string }>;
	/**
	 * Canjea el resultado de Google con el `verifier` guardado en el navegador (ata el retorno al
	 * navegador que empezó el flujo). Devuelve la unión de cuatro estados.
	 */
	googleExchange(code: string, verifier: string): Promise<GoogleOutcome>;
	/** Vincula Google a una cuenta existente; exige la contraseña (es, a efectos, un login). */
	googleLink(linkToken: string, authKey: string): Promise<LoginResult | MfaChallenge>;
	/** Crea la cuenta con Google (correo ya verificado) e inicia sesión. */
	googleRegister(input: GoogleRegisterInput): Promise<LoginResult>;
	/** Desvincula Google de la cuenta (exige la prueba de la contraseña). */
	unlinkGoogle(authKey: string): Promise<void>;
	/** Claves cifradas de la cuenta con sesión vigente (para desbloquear sin volver a iniciar sesión). */
	keys(): Promise<KeyBundle>;
	logout(): Promise<void>;
	/** Cambia el nombre visible. */
	updateProfile(patch: { fullName: string }): Promise<User>;
	/**
	 * Pide cambiar el correo: exige la prueba de la contraseña actual y envía un código al correo nuevo.
	 * El cambio no se aplica hasta `confirmEmailChange`.
	 */
	requestEmailChange(newEmail: string, authKey: string): Promise<{ email: string }>;
	confirmEmailChange(email: string, code: string): Promise<User>;
	changePassword(input: PasswordChangeRequest): Promise<void>;
	/**
	 * Elimina la cuenta y todos sus datos (se conservan 30 días antes del borrado definitivo).
	 * Exige la prueba de la contraseña actual (`authKey`).
	 */
	deleteAccount(authKey: string): Promise<void>;
	/** Sesión vigente, o `null` si no hay sesión. Lanza `session-expired` si venció. */
	currentSession(): Promise<Session | null>;
	/** Siempre resuelve, exista o no la cuenta (no revela qué correos están registrados). */
	requestPasswordReset(email: string): Promise<void>;
	/** Con el token del correo: lo necesario para restablecer conservando las notas. */
	passwordResetBundle(token: string): Promise<PasswordResetBundle>;
	resetPassword(input: PasswordResetRequest): Promise<void>;
	/** Cambia la clave de recuperación (la anterior deja de servir). */
	rotateRecoveryKey(input: RecoveryKeyRotation): Promise<void>;
}

export interface DeviceRepository {
	list(): Promise<Device[]>;
	remove(id: Id): Promise<void>;
}

/**
 * Dispositivos de confianza: el servidor guarda la clave maestra cifrada con la clave propia del
 * navegador y solo la entrega a una sesión válida. Sin la clave local no sirve de nada.
 */
export interface TrustedDeviceRepository {
	/** Dispositivos vigentes de la cuenta. Solo para cuentas con Google vinculado. */
	list(): Promise<TrustedDevice[]>;
	/** Da de alta este dispositivo (la clave maestra llega ya cifrada con la clave del navegador). */
	add(input: TrustedDeviceInput): Promise<void>;
	/** Clave maestra cifrada de un dispositivo. Lanza `not-found` si ya no existe (revocado). */
	get(id: Id): Promise<{ wrappedMasterKey: Sealed }>;
	/** Revoca un dispositivo de confianza. */
	remove(id: Id): Promise<void>;
}

export interface SettingsRepository {
	/**
	 * Preferencias del dispositivo. `userId` solo lo usan las implementaciones que las guardan por
	 * cuenta (las locales); el resto lo ignora.
	 */
	get(userId?: string): Promise<AppSettings>;
	update(patch: AppSettingsPatch, userId?: string): Promise<AppSettings>;
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
	sync(request: EncryptedSyncRequest): Promise<EncryptedSyncResponse>;
}

export interface ShareRepository {
	/**
	 * Crea el enlace con la copia cifrada que prepara el cliente. Si la nota ya tiene enlace, devuelve el
	 * existente (y se ignora lo enviado).
	 */
	createLink(noteId: Id, input: ShareInput): Promise<SharedNote>;
	/** Cambia la copia cifrada de un enlace existente (al editar la nota). */
	updateLinkPayload(noteId: Id, payload: string): Promise<void>;
	revokeLink(noteId: Id): Promise<void>;
	getLink(noteId: Id): Promise<SharedNote | null>;
	/** Lee la copia cifrada por la parte pública del enlace. No necesita sesión. */
	readPublic(slug: string): Promise<PublicNote>;
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
	trustedDevices: TrustedDeviceRepository;
	settings: SettingsRepository;
	sync: SyncRepository;
	share: ShareRepository;
	storage: StorageRepository;
}

export type { Conflict };
