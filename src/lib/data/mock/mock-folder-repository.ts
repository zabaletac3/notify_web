import { fail, validateFolderName, type Folder, type Id } from '#lib/domain/index.js';
import type { FolderRepository } from '../contracts.js';
import type { MockDatabase } from './mock-database.js';

export class MockFolderRepository implements FolderRepository {
	constructor(private db: MockDatabase) {}

	private find(id: Id): Folder {
		const f = this.db.folders.find((x) => x.id === id);
		if (!f) throw fail.notFound('folder');
		return f;
	}

	async list(): Promise<Folder[]> {
		await this.db.local('read');
		return structuredClone(this.db.folders);
	}

	async create(name: string): Promise<Folder> {
		await this.db.local('write');
		const check = validateFolderName(
			name,
			this.db.folders.map((f) => f.name)
		);
		if (!check.valid) throw fail.validation(check.errors);
		const now = this.db.now().toISOString();
		const folder: Folder = {
			id: this.db.nextId('f'),
			name: name.trim(),
			createdAt: now,
			updatedAt: now
		};
		this.db.folders.push(folder);
		return structuredClone(folder);
	}

	async rename(id: Id, name: string): Promise<Folder> {
		await this.db.local('write');
		const folder = this.find(id);
		const check = validateFolderName(
			name,
			this.db.folders.filter((f) => f.id !== id).map((f) => f.name)
		);
		if (!check.valid) throw fail.validation(check.errors);
		folder.name = name.trim();
		folder.updatedAt = this.db.now().toISOString();
		return structuredClone(folder);
	}

	async delete(id: Id): Promise<void> {
		await this.db.local('write');
		this.find(id);
		this.db.folders = this.db.folders.filter((f) => f.id !== id);
		for (const note of this.db.notes) {
			if (note.folderId === id) {
				note.folderId = null;
				note.syncStatus = 'pending';
			}
		}
	}
}
