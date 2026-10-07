import { fail, newId, validateFolderName, type Folder, type Id } from '#lib/domain/index.js';
import type { FolderRepository } from '../contracts.js';
import type { FolderRow } from './apunte-db.js';
import { noGate, type LocalDeps } from './gate.js';
import { enqueue, folderFields, noteFields } from './outbox.js';

const strip = (row: FolderRow): Folder => {
	const folder: Partial<FolderRow> = { ...row };
	delete folder.revision;
	return folder as Folder;
};

export class LocalFolderRepository implements FolderRepository {
	constructor(private d: LocalDeps) {}

	private get gate() {
		return this.d.gate ?? noGate;
	}
	private iso() {
		return this.d.now().toISOString();
	}

	private async find(id: Id): Promise<FolderRow> {
		const folder = await this.d.db.folders.get(id);
		if (!folder) throw fail.notFound('folder');
		return folder;
	}

	private queue(folder: FolderRow) {
		return enqueue(
			this.d.db,
			{
				entity: 'folder',
				entityId: folder.id,
				op: 'upsert',
				baseRevision: folder.revision,
				data: folderFields(folder)
			},
			this.iso()
		);
	}

	async list(): Promise<Folder[]> {
		await this.gate.read();
		const rows = await this.d.db.folders.toArray();
		return rows
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, 'es'))
			.map(strip);
	}

	async create(name: string): Promise<Folder> {
		await this.gate.write();
		const { db } = this.d;
		return db.transaction('rw', db.folders, db.outbox, async () => {
			const existing = await db.folders.toArray();
			const check = validateFolderName(
				name,
				existing.map((f) => f.name)
			);
			if (!check.valid) throw fail.validation(check.errors);
			const now = this.iso();
			const folder: FolderRow = {
				id: newId(this.d.now().getTime()),
				name: name.trim(),
				createdAt: now,
				updatedAt: now,
				revision: 0
			};
			await db.folders.put(folder);
			await this.queue(folder);
			return strip(folder);
		});
	}

	async rename(id: Id, name: string): Promise<Folder> {
		await this.gate.write();
		const { db } = this.d;
		return db.transaction('rw', db.folders, db.outbox, async () => {
			const folder = await this.find(id);
			const others = (await db.folders.toArray()).filter((f) => f.id !== id);
			const check = validateFolderName(
				name,
				others.map((f) => f.name)
			);
			if (!check.valid) throw fail.validation(check.errors);
			const next: FolderRow = { ...folder, name: name.trim(), updatedAt: this.iso() };
			await db.folders.put(next);
			await this.queue(next);
			return strip(next);
		});
	}

	async delete(id: Id): Promise<void> {
		await this.gate.write();
		const { db } = this.d;
		await db.transaction('rw', db.folders, db.notes, db.outbox, async () => {
			const folder = await this.find(id);
			await db.folders.delete(id);
			await enqueue(
				db,
				{ entity: 'folder', entityId: id, op: 'delete', baseRevision: folder.revision },
				this.iso()
			);
			// Sus notas pasan a "sin carpeta".
			const affected = await db.notes.where('folderId').equals(id).toArray();
			for (const note of affected) {
				const next = {
					...note,
					folderId: null,
					updatedAt: this.iso(),
					syncStatus: note.syncStatus === 'conflict' ? ('conflict' as const) : ('pending' as const),
					lastEditedDeviceId: this.d.deviceId
				};
				await db.notes.put(next);
				await enqueue(
					db,
					{
						entity: 'note',
						entityId: note.id,
						op: 'upsert',
						baseRevision: note.revision,
						data: noteFields(next)
					},
					this.iso()
				);
			}
		});
	}
}
