import { fromB64u, fromUtf8, toB64u, utf8 } from '#lib/core/crypto/index.js';
import {
	fail,
	isValidEmail,
	type GoogleOutcome,
	type GoogleRegisterInput,
	type KdfParams,
	type KeyBundle,
	type LoginResult,
	type MfaChallenge,
	type MfaRecoveryCodes,
	type MfaSetupResult,
	type MfaStatus,
	type PasswordChangeRequest,
	type PasswordResetBundle,
	type PasswordResetRequest,
	type RecoveryKeyRotation,
	type RegisterRequest,
	type Session,
	type User
} from '#lib/domain/index.js';
import type { AuthRepository } from '../contracts.js';
import { DEMO_KEYS } from './fixtures/demo-keys.js';
import {
	DEMO_USER_ID,
	RESET_TOKEN,
	type MockDatabase,
	type StoredMfa,
	type StoredUser
} from './mock-database.js';
import { isGoogleScenario, type GoogleScenario } from './scenario.svelte.js';

const MAX_FAILED_LOGINS = 5;
const norm = (email: string) => email.trim().toLowerCase();

/**
 * Verificación en dos pasos del simulado. El código TOTP válido es siempre `123456`; los códigos de
 * respaldo se generan al activar y se consumen de uno en uno. Nada de esto es criptografía real: solo
 * reproduce el flujo y los estados de la interfaz.
 */
const MOCK_TOTP_CODE = '123456';
const MFA_TICKET_TTL_MS = 5 * 60 * 1000;
const MAX_MFA_ATTEMPTS = 5;
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
/** Códigos del escenario «cuenta con verificación en dos pasos» (deterministas, para las pruebas). */
const DEMO_RECOVERY_CODES = [
	'ABCDE-FGHJK',
	'MNPQR-STVWX',
	'YZ234-56789',
	'AB2CD-3EFGH',
	'JKLMN-PQRST',
	'VWXYZ-23456',
	'789AB-CDEFG',
	'HJKLM-NPQRS',
	'TVWXY-Z2345',
	'6789A-BCDEF'
];
/** Secreto de ejemplo del escenario (no se verifica; el código válido es `123456`). */
const DEMO_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

/** Secreto base32 sin relleno, ~160 bits. */
function generateBase32Secret(bytes = 20): string {
	const raw = crypto.getRandomValues(new Uint8Array(bytes));
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of raw) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += alphabet[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
	return out;
}

/** 10 códigos `XXXXX-XXXXX` con un alfabeto sin caracteres ambiguos. */
function generateRecoveryCodes(n: number): string[] {
	const values = crypto.getRandomValues(new Uint32Array(n * 2));
	const code = (offset: number) => {
		let out = '';
		for (let i = 0; i < 5; i++) {
			const v = values[offset + i >= values.length ? (offset + i) % values.length : offset + i];
			out += RECOVERY_ALPHABET[v % RECOVERY_ALPHABET.length];
		}
		return out;
	};
	return Array.from({ length: n }, (_, i) => `${code(i * 2)}-${code(i * 2 + 1)}`);
}

const normalizeRecovery = (code: string) => code.toUpperCase().replace(/[^A-Z2-9]/g, '');

/** El servidor real guarda Argon2id del valor recibido; aquí basta un hash. */
const hashOf = async (value: string) =>
	toB64u(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(value))));

export class MockAuthRepository implements AuthRepository {
	constructor(private db: MockDatabase) {}

	private findByEmail(email: string) {
		return this.db.users.find((u) => u.user.email === norm(email));
	}

	/**
	 * MFA efectiva de una cuenta: si nunca se tocó (`undefined`) y el escenario lo pide, se activa la
	 * del ejemplo (y se fija, para que los códigos se consuman de verdad). `null` = desactivada.
	 */
	private effectiveMfa(stored: StoredUser): StoredMfa | null {
		if (stored.mfa !== undefined) return stored.mfa;
		if (this.db.scenario.mfaEnabled && stored.user.id === DEMO_USER_ID) {
			stored.mfa = {
				secret: DEMO_TOTP_SECRET,
				enabledAt: this.db.now().toISOString(),
				recoveryCodes: [...DEMO_RECOVERY_CODES]
			};
			return stored.mfa;
		}
		return null;
	}

	/** Comprueba el código TOTP fijo o un código de respaldo, y consume este último. */
	private consumeCode(mfa: StoredMfa, code: string): boolean {
		if (code.trim() === MOCK_TOTP_CODE) return true;
		const normalized = normalizeRecovery(code);
		const index = mfa.recoveryCodes.findIndex((c) => normalizeRecovery(c) === normalized);
		if (index === -1) return false;
		mfa.recoveryCodes.splice(index, 1);
		return true;
	}

	private startSession(user: User): Session {
		const session: Session = {
			user: structuredClone(user),
			expiresAt: new Date(this.db.now().getTime() + 60 * 60000).toISOString()
		};
		this.db.session = session;
		return structuredClone(session);
	}

	async prelogin(email: string): Promise<{ kdf: KdfParams }> {
		await this.db.remote({ ignoreExpired: true });
		const stored = this.findByEmail(email);
		if (stored) return { kdf: structuredClone(stored.keys.kdf) };
		// Cuenta inexistente: parámetros falsos pero estables, iguales a los de las cuentas reales.
		const fake = (await hashOf(`apunte-fake-salt:${norm(email)}`)).slice(0, 22);
		return { kdf: { ...DEMO_KEYS.kdf, salt: fake } };
	}

	async register(input: RegisterRequest): Promise<{ email: string }> {
		await this.db.remote();
		const email = norm(input.email);
		if (this.findByEmail(email)) throw fail.validation({ email: 'email-taken' });
		this.db.users.push({
			authKeyHash: await hashOf(input.authKey),
			recoveryAuthHash: await hashOf(input.recoveryAuth),
			keys: structuredClone(input.keys),
			user: {
				id: input.userId,
				email,
				fullName: input.fullName.trim(),
				emailVerified: false,
				hasGoogle: false,
				createdAt: this.db.now().toISOString()
			}
		});
		return { email };
	}

	async verifyEmail(email: string, code: string): Promise<User> {
		await this.db.remote();
		const stored = this.findByEmail(email);
		if (!stored) throw fail.notFound('user');
		if (code !== this.db.verificationCode) throw fail.validation({ code: 'invalid-code' });
		stored.user.emailVerified = true;
		this.startSession(stored.user);
		return structuredClone(stored.user);
	}

	async resendVerificationCode(email: string): Promise<void> {
		await this.db.remote();
		if (!this.findByEmail(email)) throw fail.notFound('user');
	}

	private requireUser() {
		const current = this.db.session;
		const stored = current && this.db.users.find((u) => u.user.id === current.user.id);
		if (!stored) throw fail.sessionExpired();
		return stored;
	}

	private refreshSession(user: User) {
		if (this.db.session) this.db.session = { ...this.db.session, user: structuredClone(user) };
	}

	async updateProfile(patch: { fullName: string }): Promise<User> {
		await this.db.remote();
		const stored = this.requireUser();
		const fullName = patch.fullName.trim();
		if (fullName.length < 2) throw fail.validation({ fullName: 'name-too-short' });
		stored.user.fullName = fullName;
		this.refreshSession(stored.user);
		return structuredClone(stored.user);
	}

	async requestEmailChange(newEmail: string, authKey: string): Promise<{ email: string }> {
		await this.db.remote();
		const stored = this.requireUser();
		if (stored.authKeyHash !== (await hashOf(authKey)))
			throw fail.validation({ password: 'wrong-password' });
		const email = norm(newEmail);
		if (!isValidEmail(email)) throw fail.validation({ email: 'invalid-email' });
		if (this.findByEmail(email)) throw fail.validation({ email: 'email-taken' });
		this.db.pendingEmailChange = { userId: stored.user.id, email };
		return { email };
	}

	async confirmEmailChange(email: string, code: string): Promise<User> {
		await this.db.remote();
		const stored = this.requireUser();
		const pending = this.db.pendingEmailChange;
		if (!pending || pending.userId !== stored.user.id || pending.email !== norm(email))
			throw fail.notFound('email-change');
		if (code !== this.db.verificationCode) throw fail.validation({ code: 'invalid-code' });
		stored.user.email = pending.email;
		this.db.pendingEmailChange = null;
		this.refreshSession(stored.user);
		return structuredClone(stored.user);
	}

	async changePassword(input: PasswordChangeRequest): Promise<void> {
		await this.db.remote();
		const stored = this.requireUser();
		if (stored.authKeyHash !== (await hashOf(input.currentAuthKey)))
			throw fail.validation({ currentPassword: 'wrong-password' });
		stored.authKeyHash = await hashOf(input.newAuthKey);
		stored.keys = { ...structuredClone(input.keys), keysVersion: stored.keys.keysVersion + 1 };
		// Cambiar la contraseña revoca los dispositivos de confianza: cada uno vuelve a darse de alta.
		this.db.revokeTrustedDevices(stored.user.id, this.db.now().toISOString());
	}

	async login(input: { email: string; authKey: string }): Promise<LoginResult | MfaChallenge> {
		// Iniciar sesión funciona aunque la sesión anterior haya vencido.
		await this.db.remote({ ignoreExpired: true });
		const email = norm(input.email);
		if ((this.db.failedLogins.get(email) ?? 0) >= MAX_FAILED_LOGINS) throw fail.rateLimited();
		const stored = this.findByEmail(email);
		// Mismo error para correo inexistente y contraseña incorrecta (no revela qué cuentas existen).
		if (!stored || stored.authKeyHash !== (await hashOf(input.authKey))) {
			this.db.failedLogins.set(email, (this.db.failedLogins.get(email) ?? 0) + 1);
			throw fail.invalidCredentials();
		}
		if (!stored.user.emailVerified) throw fail.emailNotVerified();
		this.db.failedLogins.delete(email);
		// Con MFA activa, el primer paso no abre sesión: devuelve un reto y un ticket de un solo uso.
		const mfa = this.effectiveMfa(stored);
		if (mfa?.enabledAt) return { mfaRequired: true, ...this.newMfaTicket(stored.user.id) };
		return { ...this.startSession(stored.user), keys: structuredClone(stored.keys) };
	}

	async loginMfa(mfaToken: string, code: string): Promise<LoginResult> {
		await this.db.remote({ ignoreExpired: true });
		const ticket = this.db.mfaTickets.get(mfaToken);
		const valid =
			ticket &&
			!ticket.consumed &&
			ticket.attempts < MAX_MFA_ATTEMPTS &&
			new Date(ticket.expiresAt).getTime() > this.db.now().getTime();
		if (!valid) throw fail.validation({ mfaToken: 'invalid-token' });
		const stored = this.db.users.find((u) => u.user.id === ticket.userId);
		if (!stored || !stored.user.emailVerified) throw fail.validation({ mfaToken: 'invalid-token' });
		const mfa = this.effectiveMfa(stored);
		if (!mfa?.enabledAt) throw fail.validation({ mfaToken: 'invalid-token' });
		if (!this.consumeCode(mfa, code)) {
			ticket.attempts += 1;
			throw fail.validation({ code: 'invalid-code' });
		}
		ticket.consumed = true;
		return { ...this.startSession(stored.user), keys: structuredClone(stored.keys) };
	}

	async mfaStatus(): Promise<MfaStatus> {
		await this.db.remote();
		const stored = this.requireUser();
		const mfa = this.effectiveMfa(stored);
		return {
			enabled: !!mfa?.enabledAt,
			enabledAt: mfa?.enabledAt ?? null,
			recoveryCodesLeft: mfa?.enabledAt ? mfa.recoveryCodes.length : 0
		};
	}

	async mfaSetup(authKey: string): Promise<MfaSetupResult> {
		await this.db.remote();
		const stored = this.requireUser();
		if (stored.authKeyHash !== (await hashOf(authKey)))
			throw fail.validation({ password: 'wrong-password' });
		if (this.effectiveMfa(stored)?.enabledAt) throw fail.mfaConflict('mfa-already-enabled');
		const secret = generateBase32Secret();
		// Un setup repetido sustituye la configuración pendiente.
		stored.mfa = { secret, enabledAt: null, recoveryCodes: [] };
		const account = encodeURIComponent(stored.user.email);
		const otpauthUri = `otpauth://totp/AxoNote:${account}?secret=${secret}&issuer=AxoNote&algorithm=SHA1&digits=6&period=30`;
		return { secret, otpauthUri };
	}

	async mfaEnable(code: string): Promise<MfaRecoveryCodes> {
		await this.db.remote();
		const stored = this.requireUser();
		const mfa = stored.mfa;
		if (!mfa || mfa.enabledAt) throw fail.mfaConflict('mfa-not-pending');
		if (code.trim() !== MOCK_TOTP_CODE) throw fail.validation({ code: 'invalid-code' });
		mfa.enabledAt = this.db.now().toISOString();
		mfa.recoveryCodes = generateRecoveryCodes(10);
		return { recoveryCodes: [...mfa.recoveryCodes] };
	}

	async mfaDisable(authKey: string, code: string): Promise<void> {
		await this.db.remote();
		const stored = this.requireUser();
		if (stored.authKeyHash !== (await hashOf(authKey)))
			throw fail.validation({ password: 'wrong-password' });
		const mfa = this.effectiveMfa(stored);
		if (!mfa?.enabledAt) throw fail.mfaConflict('mfa-not-enabled');
		if (!this.consumeCode(mfa, code)) throw fail.validation({ code: 'invalid-code' });
		stored.mfa = null;
	}

	async mfaRegenerateCodes(authKey: string, code: string): Promise<MfaRecoveryCodes> {
		await this.db.remote();
		const stored = this.requireUser();
		if (stored.authKeyHash !== (await hashOf(authKey)))
			throw fail.validation({ password: 'wrong-password' });
		const mfa = this.effectiveMfa(stored);
		if (!mfa?.enabledAt) throw fail.mfaConflict('mfa-not-enabled');
		if (!this.consumeCode(mfa, code)) throw fail.validation({ code: 'invalid-code' });
		mfa.recoveryCodes = generateRecoveryCodes(10);
		return { recoveryCodes: [...mfa.recoveryCodes] };
	}

	// ─── Acceso con Google (simulado) ──────────────────────────────────────────
	// El simulador no navega a Google: `googleStart` devuelve una URL de la propia web con un `code`
	// que lleva el escenario elegido, para que sobreviva a la recarga. La identidad se elige en
	// `/dev/simulator` (o con `localStorage['apunte-google-scenario']` en las pruebas e2e).

	private googleScenario(): GoogleScenario {
		return this.db.scenario.googleScenario;
	}

	private googleScenarioFromCode(code: string): GoogleScenario | null {
		try {
			const parsed = JSON.parse(fromUtf8(fromB64u(code))) as { google?: unknown };
			return isGoogleScenario(parsed.google) ? parsed.google : null;
		} catch {
			return null;
		}
	}

	/** Crea un reto de segundo paso y lo registra; lo comparte el login, el vínculo y Google. */
	private newMfaTicket(userId: string) {
		const mfaToken = toB64u(crypto.getRandomValues(new Uint8Array(32)));
		const expiresAt = new Date(this.db.now().getTime() + MFA_TICKET_TTL_MS).toISOString();
		this.db.mfaTickets.set(mfaToken, { userId, expiresAt, attempts: 0, consumed: false });
		return { mfaToken, expiresAt };
	}

	async googleStart(challenge: string): Promise<{ url: string }> {
		await this.db.remote({ ignoreExpired: true });
		if (!/^[A-Za-z0-9_-]{43}$/.test(challenge))
			throw fail.validation({ challenge: 'invalid-payload' });
		const scenario = this.googleScenario();
		if (scenario === 'off') throw fail.forbidden('google-disabled');
		const code = toB64u(utf8(JSON.stringify({ google: scenario })));
		const origin = typeof location !== 'undefined' ? location.origin : '';
		return { url: `${origin}/auth/google#code=${encodeURIComponent(code)}` };
	}

	async googleExchange(code: string): Promise<GoogleOutcome> {
		await this.db.remote({ ignoreExpired: true });
		const scenario = this.googleScenarioFromCode(code) ?? this.googleScenario();
		if (scenario === 'off') throw fail.forbidden('google-disabled');
		const demo = this.db.users.find((u) => u.user.id === DEMO_USER_ID);
		if (!demo) throw fail.server();

		switch (scenario) {
			case 'new': {
				const email = 'nueva.persona@gmail.com';
				const fullName = 'Nueva Persona';
				const signupToken = toB64u(crypto.getRandomValues(new Uint8Array(24)));
				this.db.googleSignups.set(signupToken, { email, fullName });
				return { status: 'signup-required', signupToken, email, fullName };
			}
			case 'unlinked': {
				const linkToken = toB64u(crypto.getRandomValues(new Uint8Array(24)));
				this.db.googleLinks.set(linkToken, { userId: demo.user.id });
				return {
					status: 'link-required',
					linkToken,
					email: demo.user.email,
					kdf: structuredClone(demo.keys.kdf)
				};
			}
			case 'linked':
				demo.user.hasGoogle = true;
				return {
					status: 'authenticated',
					session: { ...this.startSession(demo.user), keys: structuredClone(demo.keys) }
				};
			case 'with-mfa':
				demo.user.hasGoogle = true;
				if (!demo.mfa?.enabledAt) {
					demo.mfa = {
						secret: DEMO_TOTP_SECRET,
						enabledAt: this.db.now().toISOString(),
						recoveryCodes: [...DEMO_RECOVERY_CODES]
					};
				}
				return { status: 'mfa-required', ...this.newMfaTicket(demo.user.id) };
		}
	}

	async googleLink(linkToken: string, authKey: string): Promise<LoginResult | MfaChallenge> {
		await this.db.remote({ ignoreExpired: true });
		const pending = this.db.googleLinks.get(linkToken);
		const stored = pending ? this.db.users.find((u) => u.user.id === pending.userId) : undefined;
		if (!stored) throw fail.validation({ linkToken: 'invalid-token' });
		if (stored.authKeyHash !== (await hashOf(authKey))) throw fail.invalidCredentials();
		stored.user.hasGoogle = true;
		this.db.googleLinks.delete(linkToken);
		this.refreshSession(stored.user);
		if (this.effectiveMfa(stored)?.enabledAt)
			return { mfaRequired: true, ...this.newMfaTicket(stored.user.id) };
		return { ...this.startSession(stored.user), keys: structuredClone(stored.keys) };
	}

	async googleRegister(input: GoogleRegisterInput): Promise<LoginResult> {
		await this.db.remote({ ignoreExpired: true });
		const pending = this.db.googleSignups.get(input.signupToken);
		if (!pending) throw fail.validation({ signupToken: 'invalid-token' });
		if (this.findByEmail(pending.email)) throw fail.validation({ email: 'email-taken' });
		const stored: StoredUser = {
			authKeyHash: await hashOf(input.authKey),
			recoveryAuthHash: await hashOf(input.recoveryAuth),
			keys: structuredClone(input.keys),
			user: {
				id: input.userId,
				email: pending.email,
				fullName: input.fullName.trim(),
				emailVerified: true,
				hasGoogle: true,
				createdAt: this.db.now().toISOString()
			}
		};
		this.db.users.push(stored);
		this.db.googleSignups.delete(input.signupToken);
		return { ...this.startSession(stored.user), keys: structuredClone(stored.keys) };
	}

	async unlinkGoogle(authKey: string): Promise<void> {
		await this.db.remote();
		const stored = this.requireUser();
		if (stored.authKeyHash !== (await hashOf(authKey)))
			throw fail.validation({ password: 'wrong-password' });
		stored.user.hasGoogle = false;
		this.refreshSession(stored.user);
		// Sin Google ya no hay acceso por dispositivo de confianza.
		this.db.revokeTrustedDevices(stored.user.id, this.db.now().toISOString());
	}

	async keys(): Promise<KeyBundle> {
		await this.db.remote();
		return structuredClone(this.requireUser().keys);
	}

	async logout(): Promise<void> {
		await this.db.local('write');
		this.db.session = null;
	}

	async deleteAccount(authKey: string): Promise<void> {
		await this.db.remote();
		const stored = this.requireUser();
		if (stored.authKeyHash !== (await hashOf(authKey)))
			throw fail.validation({ password: 'wrong-password' });
		this.db.session = null;
	}

	async currentSession(): Promise<Session | null> {
		await this.db.local('write');
		if (this.db.scenario.deviceRevoked && this.db.session) throw fail.deviceRevoked();
		if (this.db.scenario.sessionExpired && this.db.session) {
			throw fail.sessionExpired();
		}
		return this.db.session ? structuredClone(this.db.session) : null;
	}

	async requestPasswordReset(email: string): Promise<void> {
		await this.db.remote({ ignoreExpired: true });
		if (isValidEmail(email) && this.findByEmail(email))
			this.db.resetTokens.set(RESET_TOKEN, norm(email));
		// Siempre resuelve, exista o no la cuenta.
	}

	async passwordResetBundle(token: string): Promise<PasswordResetBundle> {
		await this.db.remote({ ignoreExpired: true });
		const stored = this.userForToken(token);
		return {
			userId: stored.user.id,
			recoveryWrappedMasterKey: stored.keys.recoveryWrappedMasterKey,
			kdf: structuredClone(stored.keys.kdf),
			mfaEnabled: !!this.effectiveMfa(stored)?.enabledAt
		};
	}

	private userForToken(token: string) {
		const email = this.db.resetTokens.get(token);
		const stored = email ? this.findByEmail(email) : undefined;
		if (!stored) throw fail.validation({ token: 'invalid-token' });
		return stored;
	}

	async resetPassword(input: PasswordResetRequest): Promise<void> {
		await this.db.remote({ ignoreExpired: true });
		const stored = this.userForToken(input.token);
		const mfa = this.effectiveMfa(stored);
		if (input.mode === 'keep') {
			// Conservar las notas exige la prueba de la clave de recuperación vigente.
			if (stored.recoveryAuthHash !== (await hashOf(input.recoveryAuth)))
				throw fail.validation({ recoveryKey: 'invalid-recovery-key' });
			// Con MFA activa se puede desactivar a petición (M5, modo keep).
			if (input.disableMfa) stored.mfa = null;
		} else {
			if (input.disableMfa) throw fail.validation({ disableMfa: 'invalid-payload' });
			// Con MFA activa, `wipe` exige un código y no borra nada si falta o es incorrecto.
			if (mfa?.enabledAt) {
				if (!input.mfaCode) throw fail.validation({ mfaCode: 'required' });
				if (!this.consumeCode(mfa, input.mfaCode))
					throw fail.validation({ mfaCode: 'invalid-code' });
			}
			// Empezar de cero: las notas cifradas con la clave anterior ya no se podrían leer.
			this.db.wipeAccount(stored.user.id);
			stored.recoveryAuthHash = await hashOf(input.recoveryAuth);
		}
		stored.authKeyHash = await hashOf(input.newAuthKey);
		stored.keys = { ...structuredClone(input.keys), keysVersion: stored.keys.keysVersion + 1 };
		this.db.resetTokens.delete(input.token);
		this.db.failedLogins.delete(stored.user.email);
		// Restablecer la contraseña revoca los dispositivos de confianza vigentes.
		this.db.revokeTrustedDevices(stored.user.id, this.db.now().toISOString());
	}

	async rotateRecoveryKey(input: RecoveryKeyRotation): Promise<void> {
		await this.db.remote();
		const stored = this.requireUser();
		if (stored.authKeyHash !== (await hashOf(input.authKey)))
			throw fail.validation({ password: 'wrong-password' });
		stored.recoveryAuthHash = await hashOf(input.recoveryAuth);
		stored.keys = {
			...stored.keys,
			recoveryWrappedMasterKey: input.recoveryWrappedMasterKey,
			keysVersion: stored.keys.keysVersion + 1
		};
	}
}
