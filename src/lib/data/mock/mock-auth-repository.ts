import {
	fail,
	isValidEmail,
	type LoginInput,
	type RegisterInput,
	type Session,
	type User
} from '#lib/domain/index.js';
import type { AuthRepository } from '../contracts.js';
import { RESET_TOKEN, type MockDatabase } from './mock-database.js';

const MAX_FAILED_LOGINS = 5;
const norm = (email: string) => email.trim().toLowerCase();

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

	async register(input: RegisterInput): Promise<{ email: string }> {
		await this.db.remote();
		const email = norm(input.email);
		if (this.findByEmail(email)) throw fail.validation({ email: 'email-taken' });
		this.db.users.push({
			password: input.password,
			user: {
				id: this.db.nextId('u'),
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

	async login(input: LoginInput): Promise<Session> {
		// Iniciar sesión funciona aunque la sesión anterior haya vencido.
		await this.db.remote({ ignoreExpired: true });
		const email = norm(input.email);
		if ((this.db.failedLogins.get(email) ?? 0) >= MAX_FAILED_LOGINS) throw fail.rateLimited();
		const stored = this.findByEmail(email);
		// Mismo error para correo inexistente y contraseña incorrecta (no revela qué cuentas existen).
		if (!stored || stored.password !== input.password) {
			this.db.failedLogins.set(email, (this.db.failedLogins.get(email) ?? 0) + 1);
			throw fail.invalidCredentials();
		}
		if (!stored.user.emailVerified) throw fail.emailNotVerified();
		this.db.failedLogins.delete(email);
		return this.startSession(stored.user);
	}

	async logout(): Promise<void> {
		await this.db.local('write');
		this.db.session = null;
	}

	async currentSession(): Promise<Session | null> {
		await this.db.local('write');
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

	async resetPassword(token: string, newPassword: string): Promise<void> {
		await this.db.remote({ ignoreExpired: true });
		const email = this.db.resetTokens.get(token);
		if (!email) throw fail.validation({ token: 'invalid-token' });
		const stored = this.findByEmail(email);
		if (!stored) throw fail.validation({ token: 'invalid-token' });
		stored.password = newPassword;
		this.db.resetTokens.delete(token);
		this.db.failedLogins.delete(email);
	}
}
