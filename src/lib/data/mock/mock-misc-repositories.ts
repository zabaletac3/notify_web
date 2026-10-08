import { isSealed } from '#lib/core/crypto/index.js';
import {
	fail,
	type AppSettings,
	type Conflict,
	type ConflictResolution,
	type Device,
	type Id,
	type Note,
	type PublicNote,
	type ShareInput,
	type SharedNote,
	type StorageUsage,
	type SyncSnapshot,
	STORAGE_QUOTA_BYTES
} from '#lib/domain/index.js';
import type {
	DeviceRepository,
	SettingsRepository,
	ShareRepository,
	StorageRepository,
	SyncRepository
} from '../contracts.js';
import { isValidSlug } from '../crypto/share-codec.js';
import { DEMO_DEVICE_ID } from './fixtures/index.js';
import type { MockDatabase } from './mock-database.js';

export class MockDeviceRepository implements DeviceRepository {
	constructor(private db: MockDatabase) {}

	async list(): Promise<Device[]> {
		await this.db.remote();
		return structuredClone(this.db.devices);
	}

	async remove(id: Id): Promise<void> {
		await this.db.remote();
		const device = this.db.devices.find((d) => d.id === id);
		if (!device) throw fail.notFound('device');
		if (device.current) throw fail.validation({ device: 'is-current' });
		this.db.devices = this.db.devices.filter((d) => d.id !== id);
	}
}

export class MockSettingsRepository implements SettingsRepository {
	constructor(private db: MockDatabase) {}

	async get(): Promise<AppSettings> {
		await this.db.local('write');
		return { ...this.db.settings };
	}

	async update(patch: Partial<AppSettings>): Promise<AppSettings> {
		await this.db.local('write');
		this.db.settings = { ...this.db.settings, ...patch };
		return { ...this.db.settings };
	}
}

export class MockShareRepository implements ShareRepository {
	constructor(private db: MockDatabase) {}

	/** ¿Existe la nota (sin estar en la papelera) en el servidor? Mira lo cifrado si ya hay, o lo de ejemplo. */
	private noteExists(noteId: Id): boolean {
		const account = this.db.session && this.db.accounts.get(this.db.session.user.id);
		const notes = account?.seeded ? account.notes : this.db.notes;
		return notes.some((n) => n.id === noteId && !n.deletedAt);
	}

	async createLink(noteId: Id, input: ShareInput): Promise<SharedNote> {
		await this.db.remote();
		if (!this.noteExists(noteId)) throw fail.notFound('note');
		const existing = this.db.shareLinks.find((l) => l.noteId === noteId);
		if (existing) return structuredClone(existing);
		// El servidor no descifra, pero comprueba que lo que guarda tiene la forma esperada.
		if (!isValidSlug(input.slug)) throw fail.validation({ slug: 'invalid-slug' });
		if (!isSealed(input.payload) || !isSealed(input.wrappedShareKey))
			throw fail.validation({ payload: 'invalid-payload' });
		if (this.db.shareLinks.some((l) => l.slug === input.slug))
			throw fail.validation({ slug: 'slug-taken' });
		const now = this.db.now().toISOString();
		const link: SharedNote = {
			id: this.db.nextId('s'),
			noteId,
			slug: input.slug,
			wrappedShareKey: input.wrappedShareKey,
			payload: input.payload,
			createdAt: now,
			updatedAt: now
		};
		this.db.shareLinks.push(link);
		return structuredClone(link);
	}

	async updateLinkPayload(noteId: Id, payload: string): Promise<void> {
		await this.db.remote();
		const link = this.db.shareLinks.find((l) => l.noteId === noteId);
		if (!link) throw fail.notFound('share');
		if (!isSealed(payload)) throw fail.validation({ payload: 'invalid-payload' });
		link.payload = payload;
		link.updatedAt = this.db.now().toISOString();
	}

	async revokeLink(noteId: Id): Promise<void> {
		await this.db.remote();
		this.db.shareLinks = this.db.shareLinks.filter((l) => l.noteId !== noteId);
	}

	async getLink(noteId: Id): Promise<SharedNote | null> {
		await this.db.local('write');
		const link = this.db.shareLinks.find((l) => l.noteId === noteId);
		return link ? structuredClone(link) : null;
	}

	async readPublic(slug: string): Promise<PublicNote> {
		// Quien abre el enlace no tiene sesión: una sesión vencida no cuenta.
		await this.db.remote({ ignoreExpired: true });
		const link = this.db.shareLinks.find((l) => l.slug === slug);
		if (!link) throw fail.notFound('share');
		return { payload: link.payload, updatedAt: link.updatedAt };
	}
}

export class MockSyncRepository implements SyncRepository {
	constructor(private db: MockDatabase) {}

	private build(): SyncSnapshot {
		const s = this.db.scenario;
		return {
			phase: s.offline ? 'offline' : s.serverError ? 'error' : 'idle',
			lastSyncedAt: this.db.lastSyncedAt,
			pendingCount: this.db.notes.filter((n) => n.syncStatus === 'pending').length,
			conflicts: structuredClone(this.db.conflicts)
		};
	}

	async snapshot(): Promise<SyncSnapshot> {
		await this.db.local('write');
		return this.build();
	}

	async syncNow(): Promise<SyncSnapshot> {
		await this.db.remote();
		for (const note of this.db.notes) {
			if (note.syncStatus === 'pending') {
				note.syncStatus = 'synced';
				note.revision += 1;
			}
		}
		this.db.lastSyncedAt = this.db.now().toISOString();

		// Un solo conflicto por activación del interruptor.
		if (this.db.scenario.injectConflict) {
			this.db.scenario.injectConflict = false;
			const target = this.db.notes.find((n) => !n.deletedAt && n.syncStatus === 'synced');
			if (target) {
				target.syncStatus = 'conflict';
				this.db.conflicts.push(this.makeConflict(target));
			}
		}
		return this.build();
	}

	private makeConflict(note: Note): Conflict {
		const now = this.db.now();
		const deviceName = (id: Id) =>
			this.db.devices.find((d) => d.id === id)?.name ?? 'Otro dispositivo';
		return {
			noteId: note.id,
			local: {
				title: note.title,
				content: note.content,
				editedAt: note.updatedAt,
				deviceName: deviceName(DEMO_DEVICE_ID)
			},
			remote: {
				title: note.title,
				content: `${note.content}\n\n- [ ] Revisar ejercicios del parcial`,
				editedAt: new Date(now.getTime() - 2 * 60000).toISOString(),
				deviceName: 'Pixel 8'
			}
		};
	}

	async resolveConflict(noteId: Id, resolution: ConflictResolution): Promise<SyncSnapshot> {
		await this.db.remote();
		const conflict = this.db.conflicts.find((c) => c.noteId === noteId);
		const note = this.db.notes.find((n) => n.id === noteId);
		if (!conflict || !note) throw fail.notFound('conflict');
		const now = this.db.now().toISOString();

		if (resolution === 'remote') {
			note.title = conflict.remote.title;
			note.content = conflict.remote.content;
			note.updatedAt = conflict.remote.editedAt;
			note.syncStatus = 'synced';
		} else {
			if (resolution === 'both') {
				this.db.notes.unshift({
					...structuredClone(note),
					id: this.db.nextId('n'),
					title: `${conflict.remote.title} (conflicto)`,
					content: conflict.remote.content,
					pinned: false,
					createdAt: now,
					updatedAt: conflict.remote.editedAt,
					revision: 0,
					syncStatus: 'pending'
				});
			}
			note.syncStatus = 'pending';
		}
		note.revision += 1;
		this.db.conflicts = this.db.conflicts.filter((c) => c.noteId !== noteId);
		return this.build();
	}
}

export class MockStorageRepository implements StorageRepository {
	constructor(private db: MockDatabase) {}

	async usage(): Promise<StorageUsage> {
		await this.db.remote();
		// Con datos cifrados en el servidor, el espacio es el de los textos cifrados; si no, el del texto.
		const account = this.db.session && this.db.accounts.get(this.db.session.user.id);
		const encoder = new TextEncoder();
		const sizes: { deleted: boolean; bytes: number }[] = account?.seeded
			? account.notes.map((n) => ({
					deleted: n.deletedAt !== null,
					bytes: n.payload.length + n.wrappedKey.length
				}))
			: this.db.notes.map((n: Note) => ({
					deleted: n.deletedAt !== null,
					bytes: encoder.encode(n.title + n.content).length
				}));
		const total = (deleted: boolean) =>
			sizes.filter((s) => s.deleted === deleted).reduce((t, s) => t + s.bytes, 0);
		const notesBytes = total(false);
		const trashBytes = total(true);
		// Aún no se pueden adjuntar imágenes: 0 bytes.
		const imagesBytes = 0;
		return {
			usedBytes: notesBytes + trashBytes + imagesBytes,
			quotaBytes: STORAGE_QUOTA_BYTES,
			notesBytes,
			imagesBytes,
			trashBytes
		};
	}
}
