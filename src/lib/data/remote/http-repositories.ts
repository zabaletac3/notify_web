import type {
	AuthRepository,
	DeviceRepository,
	ShareRepository,
	StorageRepository,
	SyncTransport,
	TrustedDeviceRepository
} from '../contracts.js';
import type {
	Device,
	EncryptedSyncRequest,
	EncryptedSyncResponse,
	GoogleOutcome,
	GoogleRegisterInput,
	KdfParams,
	KeyBundle,
	LoginResult,
	MfaChallenge,
	MfaRecoveryCodes,
	MfaSetupResult,
	MfaStatus,
	PasswordChangeRequest,
	PasswordResetBundle,
	PasswordResetRequest,
	PublicNote,
	RecoveryKeyRotation,
	RegisterRequest,
	Session,
	SharedNote,
	ShareInput,
	StorageUsage,
	TrustedDevice,
	TrustedDeviceInput,
	User
} from '#lib/domain/index.js';
import type { HttpClient } from './http-client.js';

interface WireSession extends Session {
	accessToken?: string;
	refreshToken?: string;
}

/** `/auth/login` responde una sesión con `keys` o un reto de segundo paso (`mfaRequired`). */
interface WireLoginResponse extends WireSession {
	keys?: KeyBundle;
	mfaRequired?: boolean;
	mfaToken?: string;
}

/** Sesión de Google con los tokens que el cliente guarda y las claves cifradas. */
interface WireGoogleSession extends WireSession {
	keys: KeyBundle;
}

/** `/auth/google/exchange` responde una unión discriminada por `status`. */
type WireGoogleOutcome =
	| { status: 'authenticated'; session: WireGoogleSession }
	| { status: 'mfa-required'; mfaToken: string; expiresAt: string }
	| { status: 'link-required'; linkToken: string; email: string; kdf: KdfParams }
	| { status: 'signup-required'; signupToken: string; email: string; fullName: string };

/** Nombre legible de este navegador para la lista de dispositivos ("Chrome en Linux"). */
export function describeDevice(
	ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
): string {
	const browser = /Edg\//.test(ua)
		? 'Edge'
		: /Firefox\//.test(ua)
			? 'Firefox'
			: /Chrome\//.test(ua)
				? 'Chrome'
				: /Safari\//.test(ua)
					? 'Safari'
					: 'Navegador';
	const os = /Android/.test(ua)
		? 'Android'
		: /Windows/.test(ua)
			? 'Windows'
			: /Mac OS X/.test(ua)
				? 'macOS'
				: /Linux/.test(ua)
					? 'Linux'
					: '';
	return os ? `${browser} en ${os}` : browser;
}

const session = ({ user, expiresAt }: Session): Session => ({ user, expiresAt });

export class HttpAuthRepository implements AuthRepository {
	constructor(
		private http: HttpClient,
		private deviceName: () => string = describeDevice
	) {}

	prelogin(email: string): Promise<{ kdf: KdfParams }> {
		return this.http.request('POST', '/auth/prelogin', { auth: false, body: { email } });
	}

	register(input: RegisterRequest): Promise<{ email: string }> {
		return this.http.request('POST', '/auth/register', { auth: false, body: input });
	}

	async verifyEmail(email: string, code: string): Promise<User> {
		const s = await this.http.request<WireSession>('POST', '/auth/verify-email', {
			auth: false,
			session: true,
			body: { email, code }
		});
		this.http.saveTokens({
			accessToken: s.accessToken,
			refreshToken: s.refreshToken,
			expiresAt: s.expiresAt
		});
		return s.user;
	}

	async resendVerificationCode(email: string): Promise<void> {
		await this.http.request('POST', '/auth/resend-code', { auth: false, body: { email } });
	}

	async login(input: { email: string; authKey: string }): Promise<LoginResult | MfaChallenge> {
		const s = await this.http.request<WireLoginResponse>('POST', '/auth/login', {
			auth: false,
			session: true,
			body: { ...input, device: { name: this.deviceName(), platform: 'web' } }
		});
		// Con reto de segundo paso no hay sesión, tokens, claves ni cookie que guardar.
		if (s.mfaRequired) {
			return { mfaRequired: true, mfaToken: s.mfaToken ?? '', expiresAt: s.expiresAt };
		}
		this.http.saveTokens({
			accessToken: s.accessToken,
			refreshToken: s.refreshToken,
			expiresAt: s.expiresAt
		});
		return { ...session(s), keys: s.keys as KeyBundle };
	}

	async loginMfa(mfaToken: string, code: string): Promise<LoginResult> {
		const s = await this.http.request<WireSession & { keys: KeyBundle }>(
			'POST',
			'/auth/login/mfa',
			{
				auth: false,
				session: true,
				body: { mfaToken, code }
			}
		);
		this.http.saveTokens({
			accessToken: s.accessToken,
			refreshToken: s.refreshToken,
			expiresAt: s.expiresAt
		});
		return { ...session(s), keys: s.keys };
	}

	mfaStatus(): Promise<MfaStatus> {
		return this.http.request('GET', '/mfa');
	}

	mfaSetup(authKey: string): Promise<MfaSetupResult> {
		return this.http.request('POST', '/mfa/totp/setup', { body: { authKey } });
	}

	mfaEnable(code: string): Promise<MfaRecoveryCodes> {
		return this.http.request('POST', '/mfa/totp/enable', { body: { code } });
	}

	async mfaDisable(authKey: string, code: string): Promise<void> {
		await this.http.request('POST', '/mfa/totp/disable', { body: { authKey, code } });
	}

	mfaRegenerateCodes(authKey: string, code: string): Promise<MfaRecoveryCodes> {
		return this.http.request('POST', '/mfa/recovery-codes', { body: { authKey, code } });
	}

	googleStart(challenge: string): Promise<{ url: string }> {
		return this.http.request('POST', '/auth/google/start', { auth: false, body: { challenge } });
	}

	async googleExchange(code: string, verifier: string): Promise<GoogleOutcome> {
		const outcome = await this.http.request<WireGoogleOutcome>('POST', '/auth/google/exchange', {
			auth: false,
			session: true,
			body: { code, verifier, device: { name: this.deviceName(), platform: 'web' } }
		});
		// Solo el estado `authenticated` trae sesión y tokens: los demás no deben guardar nada.
		if (outcome.status !== 'authenticated') return outcome;
		this.http.saveTokens({
			accessToken: outcome.session.accessToken,
			refreshToken: outcome.session.refreshToken,
			expiresAt: outcome.session.expiresAt
		});
		return {
			status: 'authenticated',
			session: { ...session(outcome.session), keys: outcome.session.keys }
		};
	}

	async googleLink(linkToken: string, authKey: string): Promise<LoginResult | MfaChallenge> {
		const s = await this.http.request<WireLoginResponse>('POST', '/auth/google/link', {
			auth: false,
			session: true,
			body: { linkToken, authKey, device: { name: this.deviceName(), platform: 'web' } }
		});
		if (s.mfaRequired)
			return { mfaRequired: true, mfaToken: s.mfaToken ?? '', expiresAt: s.expiresAt };
		this.http.saveTokens({
			accessToken: s.accessToken,
			refreshToken: s.refreshToken,
			expiresAt: s.expiresAt
		});
		return { ...session(s), keys: s.keys as KeyBundle };
	}

	async googleRegister(input: GoogleRegisterInput): Promise<LoginResult> {
		const s = await this.http.request<WireGoogleSession>('POST', '/auth/google/register', {
			auth: false,
			session: true,
			body: { ...input, device: { name: this.deviceName(), platform: 'web' } }
		});
		this.http.saveTokens({
			accessToken: s.accessToken,
			refreshToken: s.refreshToken,
			expiresAt: s.expiresAt
		});
		return { ...session(s), keys: s.keys };
	}

	async unlinkGoogle(authKey: string): Promise<void> {
		await this.http.request('DELETE', '/me/identities/google', { body: { authKey } });
	}

	keys(): Promise<KeyBundle> {
		return this.http.request('GET', '/keys');
	}

	async logout(): Promise<void> {
		try {
			if (this.http.hasSession)
				await this.http.request('POST', '/auth/logout', {
					// En modo cookie no hace falta un Bearer válido: la cookie cierra la sesión.
					auth: this.http.sessionMode === 'cookie' ? 'optional' : true,
					session: true
				});
		} catch {
			// Sin red o sesión ya vencida: igualmente se cierra aquí (el servidor revoca el dispositivo al caducar).
		} finally {
			this.http.clearSession();
		}
	}

	updateProfile(patch: { fullName: string }): Promise<User> {
		return this.http.request('PATCH', '/me', { body: patch });
	}

	requestEmailChange(newEmail: string, authKey: string): Promise<{ email: string }> {
		return this.http.request('POST', '/me/email-change', { body: { newEmail, authKey } });
	}

	confirmEmailChange(email: string, code: string): Promise<User> {
		return this.http.request('POST', '/me/email-change/confirm', { body: { email, code } });
	}

	async changePassword(input: PasswordChangeRequest): Promise<void> {
		await this.http.request('POST', '/me/password', { body: input });
	}

	async deleteAccount(authKey: string): Promise<void> {
		await this.http.request('POST', '/me/delete', { body: { authKey } });
		this.http.clearSession();
	}

	async currentSession(): Promise<Session | null> {
		if (!this.http.hasSession) return null;
		return session(await this.http.request<Session>('GET', '/auth/session'));
	}

	async requestPasswordReset(email: string): Promise<void> {
		await this.http.request('POST', '/auth/password/forgot', { auth: false, body: { email } });
	}

	passwordResetBundle(token: string): Promise<PasswordResetBundle> {
		return this.http.request('POST', '/auth/password/reset/bundle', {
			auth: false,
			body: { token }
		});
	}

	async resetPassword(input: PasswordResetRequest): Promise<void> {
		await this.http.request('POST', '/auth/password/reset', { auth: false, body: input });
		this.http.clearSession();
	}

	async rotateRecoveryKey(input: RecoveryKeyRotation): Promise<void> {
		await this.http.request('PUT', '/keys/recovery', { body: input });
	}
}

export class HttpDeviceRepository implements DeviceRepository {
	constructor(private http: HttpClient) {}
	list(): Promise<Device[]> {
		return this.http.request('GET', '/devices');
	}
	async remove(id: string): Promise<void> {
		await this.http.request('DELETE', `/devices/${encodeURIComponent(id)}`);
	}
}

export class HttpTrustedDeviceRepository implements TrustedDeviceRepository {
	constructor(private http: HttpClient) {}
	list(): Promise<TrustedDevice[]> {
		return this.http.request('GET', '/trusted-devices');
	}
	async add(input: TrustedDeviceInput): Promise<void> {
		await this.http.request('POST', '/trusted-devices', { body: input });
	}
	get(id: string): Promise<{ wrappedMasterKey: string }> {
		return this.http.request('GET', `/trusted-devices/${encodeURIComponent(id)}`);
	}
	async remove(id: string): Promise<void> {
		await this.http.request('DELETE', `/trusted-devices/${encodeURIComponent(id)}`);
	}
}

export class HttpShareRepository implements ShareRepository {
	constructor(private http: HttpClient) {}
	createLink(noteId: string, input: ShareInput): Promise<SharedNote> {
		return this.http.request('PUT', `/notes/${encodeURIComponent(noteId)}/share`, { body: input });
	}
	async updateLinkPayload(noteId: string, payload: string): Promise<void> {
		await this.http.request('PUT', `/notes/${encodeURIComponent(noteId)}/share/payload`, {
			body: { payload }
		});
	}
	async revokeLink(noteId: string): Promise<void> {
		await this.http.request('DELETE', `/notes/${encodeURIComponent(noteId)}/share`);
	}
	async getLink(noteId: string): Promise<SharedNote | null> {
		return (
			(await this.http.request<SharedNote | null>(
				'GET',
				`/notes/${encodeURIComponent(noteId)}/share`
			)) ?? null
		);
	}
	readPublic(slug: string): Promise<PublicNote> {
		return this.http.request('GET', `/public/notes/${encodeURIComponent(slug)}`, { auth: false });
	}
}

export class HttpStorageRepository implements StorageRepository {
	constructor(private http: HttpClient) {}
	usage(): Promise<StorageUsage> {
		return this.http.request('GET', '/storage/usage');
	}
}

export class HttpSyncTransport implements SyncTransport {
	constructor(private http: HttpClient) {}
	sync(request: EncryptedSyncRequest): Promise<EncryptedSyncResponse> {
		return this.http.request('POST', '/sync', { body: request });
	}
}
