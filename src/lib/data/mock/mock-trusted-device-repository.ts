import { fail, type Id, type TrustedDevice, type TrustedDeviceInput } from '#lib/domain/index.js';
import type { TrustedDeviceRepository } from '../contracts.js';
import type { MockDatabase } from './mock-database.js';

/** Máximo de dispositivos de confianza vigentes por cuenta (S6). */
export const MAX_TRUSTED_DEVICES = 10;

/**
 * Dispositivos de confianza del servidor simulado. Guarda la clave maestra tal cual llega (cifrada con
 * la clave del navegador): sin esa clave local no se puede descifrar, igual que en el backend real.
 */
export class MockTrustedDeviceRepository implements TrustedDeviceRepository {
	constructor(private db: MockDatabase) {}

	private requireUser() {
		const current = this.db.session;
		const stored = current && this.db.users.find((u) => u.user.id === current.user.id);
		if (!stored) throw fail.sessionExpired();
		return stored;
	}

	private vigentes(userId: string) {
		return this.db.trustedDevices.filter((d) => d.userId === userId && !d.revokedAt);
	}

	async list(): Promise<TrustedDevice[]> {
		await this.db.remote();
		const stored = this.requireUser();
		return this.vigentes(stored.user.id).map((d) => ({
			id: d.id,
			name: d.name,
			platform: d.platform,
			createdAt: d.createdAt,
			lastUsedAt: d.lastUsedAt
		}));
	}

	async add(input: TrustedDeviceInput): Promise<void> {
		await this.db.remote();
		const stored = this.requireUser();
		if (!stored.user.hasGoogle) throw fail.forbidden('google-not-linked');
		const existing = this.db.trustedDevices.find((d) => d.id === input.id);
		if (existing && existing.userId !== stored.user.id) throw fail.validation({ id: 'invalid-id' });
		if (!existing && this.vigentes(stored.user.id).length >= MAX_TRUSTED_DEVICES)
			throw fail.forbidden('limit-reached');
		const now = this.db.now().toISOString();
		if (existing) {
			// Alta repetida del mismo id: se sustituye la clave envuelta.
			existing.wrappedMasterKey = input.wrappedMasterKey;
			existing.name = input.name;
			existing.platform = input.platform;
			existing.lastUsedAt = now;
			existing.revokedAt = null;
			return;
		}
		this.db.trustedDevices.push({
			id: input.id,
			userId: stored.user.id,
			name: input.name,
			platform: input.platform,
			wrappedMasterKey: input.wrappedMasterKey,
			createdAt: now,
			lastUsedAt: now,
			revokedAt: null
		});
	}

	async get(id: Id): Promise<{ wrappedMasterKey: string }> {
		await this.db.remote();
		const stored = this.requireUser();
		const device = this.vigentes(stored.user.id).find((d) => d.id === id);
		if (!device) throw fail.notFound('trusted-device');
		device.lastUsedAt = this.db.now().toISOString();
		return { wrappedMasterKey: device.wrappedMasterKey };
	}

	async remove(id: Id): Promise<void> {
		await this.db.remote();
		const stored = this.requireUser();
		const device = this.vigentes(stored.user.id).find((d) => d.id === id);
		if (!device) throw fail.notFound('trusted-device');
		device.revokedAt = this.db.now().toISOString();
	}
}
