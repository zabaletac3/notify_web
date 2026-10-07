import {
	fail,
	type AppSettings,
	type Conflict,
	type ConflictResolution,
	type Device,
	type Id,
	type Note,
	type ShareLink,
	type SyncSnapshot
} from '#lib/domain/index.js';
import type {
	DeviceRepository,
	SettingsRepository,
	ShareRepository,
	SyncRepository
} from '../contracts.js';
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

	async createLink(noteId: Id): Promise<ShareLink> {
		await this.db.remote();
		const note = this.db.notes.find((n) => n.id === noteId && !n.deletedAt);
		if (!note) throw fail.notFound('note');
		const existing = this.db.shareLinks.find((l) => l.noteId === noteId);
		if (existing) return structuredClone(existing);
		const id = this.db.nextId('s');
		const link: ShareLink = {
			id,
			noteId,
			url: `https://apunte.app/n/${id.replace('s_', '')}`,
			readOnly: true,
			createdAt: this.db.now().toISOString()
		};
		this.db.shareLinks.push(link);
		return structuredClone(link);
	}

	async revokeLink(noteId: Id): Promise<void> {
		await this.db.remote();
		this.db.shareLinks = this.db.shareLinks.filter((l) => l.noteId !== noteId);
	}

	async getLink(noteId: Id): Promise<ShareLink | null> {
		await this.db.local('write');
		const link = this.db.shareLinks.find((l) => l.noteId === noteId);
		return link ? structuredClone(link) : null;
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
