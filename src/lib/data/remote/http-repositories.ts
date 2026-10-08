import type {
	AuthRepository,
	DeviceRepository,
	ShareRepository,
	StorageRepository,
	SyncTransport
} from '../contracts.js';
import type {
	Device,
	EncryptedSyncRequest,
	EncryptedSyncResponse,
	KdfParams,
	KeyBundle,
	LoginResult,
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
	User
} from '#lib/domain/index.js';
import type { HttpClient } from './http-client.js';

interface WireSession extends Session {
	accessToken?: string;
	refreshToken?: string;
}

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

	async login(input: { email: string; authKey: string }): Promise<LoginResult> {
		const s = await this.http.request<WireSession & { keys: KeyBundle }>('POST', '/auth/login', {
			auth: false,
			body: { ...input, device: { name: this.deviceName(), platform: 'web' } }
		});
		this.http.saveTokens({
			accessToken: s.accessToken,
			refreshToken: s.refreshToken,
			expiresAt: s.expiresAt
		});
		return { ...session(s), keys: s.keys };
	}

	keys(): Promise<KeyBundle> {
		return this.http.request('GET', '/keys');
	}

	async logout(): Promise<void> {
		try {
			if (this.http.hasSession) await this.http.request('POST', '/auth/logout');
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
