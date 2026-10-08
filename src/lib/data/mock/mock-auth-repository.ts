import { toB64u, utf8 } from '#lib/core/crypto/index.js';
import {
	fail,
	isValidEmail,
	type KdfParams,
	type KeyBundle,
	type LoginResult,
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
import { RESET_TOKEN, type MockDatabase } from './mock-database.js';

const MAX_FAILED_LOGINS = 5;
const norm = (email: string) => email.trim().toLowerCase();

/** El servidor real guarda Argon2id del valor recibido; aquí basta un hash. */
const hashOf = async (value: string) =>
	toB64u(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(value))));

export class MockAuthRepository implements AuthRepository {
	constructor(private db: MockDatabase) {}

	private findByEmail(email: string) {
		return this.db.users.find((u) => u.user.email === norm(email));
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
	}

	async login(input: { email: string; authKey: string }): Promise<LoginResult> {
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
		return { ...this.startSession(stored.user), keys: structuredClone(stored.keys) };
	}

	async keys(): Promise<KeyBundle> {
		await this.db.remote();
		return structuredClone(this.requireUser().keys);
	}

	async logout(): Promise<void> {
		await this.db.local('write');
		this.db.session = null;
	}

	async deleteAccount(): Promise<void> {
		await this.db.local('write');
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
			kdf: structuredClone(stored.keys.kdf)
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
		if (input.mode === 'keep') {
			// Conservar las notas exige la prueba de la clave de recuperación vigente.
			if (stored.recoveryAuthHash !== (await hashOf(input.recoveryAuth)))
				throw fail.validation({ recoveryKey: 'invalid-recovery-key' });
		} else {
			// Empezar de cero: las notas cifradas con la clave anterior ya no se podrían leer.
			this.db.notes = [];
			this.db.folders = [];
			this.db.shareLinks = [];
			stored.recoveryAuthHash = await hashOf(input.recoveryAuth);
		}
		stored.authKeyHash = await hashOf(input.newAuthKey);
		stored.keys = { ...structuredClone(input.keys), keysVersion: stored.keys.keysVersion + 1 };
		this.db.resetTokens.delete(input.token);
		this.db.failedLogins.delete(stored.user.email);
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
