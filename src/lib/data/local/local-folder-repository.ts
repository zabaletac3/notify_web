import { fail, newId, validateFolderName, type Folder, type Id } from '#lib/domain/index.js';
import type { FolderRepository } from '../contracts.js';
import type { FolderRow } from './axonote-db.js';
import { noGate, type LocalDeps } from './gate.js';
import { enqueue, folderFields, noteFields } from './outbox.js';

/** Carpetas guardadas en IndexedDB, con el nombre cifrado. */
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

	/** Los nombres de las carpetas (descifrados), para comprobar que no se repiten. */
	private async decryptAll(rows: FolderRow[]): Promise<Folder[]> {
		const folders: Folder[] = [];
		for (const row of rows) folders.push(await this.d.codec.folder(row));
		return folders;
	}

	/** Guarda la fila y apunta el cambio. */
	private async save(row: FolderRow) {
		const { db } = this.d;
		await db.transaction('rw', db.folders, db.outbox, async () => {
			await db.folders.put(row);
			await enqueue(
				db,
				{
					entity: 'folder',
					entityId: row.id,
					op: 'upsert',
					baseRevision: row.revision,
					data: folderFields(row)
				},
				this.iso()
			);
		});
	}

	async list(): Promise<Folder[]> {
		await this.gate.read();
		const folders = await this.decryptAll(await this.d.db.folders.toArray());
		return folders.sort(
			(a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, 'es')
		);
	}

	create(name: string): Promise<Folder> {
		return this.write(async () => {
			const existing = await this.decryptAll(await this.d.db.folders.toArray());
			const check = validateFolderName(
				name,
				existing.map((f) => f.name)
			);
			if (!check.valid) throw fail.validation(check.errors);
			const now = this.iso();
			const folder: Folder = {
				id: newId(this.d.now().getTime()),
				name: name.trim(),
				createdAt: now,
				updatedAt: now
			};
			await this.save(await this.d.codec.encryptFolder(folder, 0));
			return folder;
		});
	}

	rename(id: Id, name: string): Promise<Folder> {
		return this.write(async () => {
			const row = await this.find(id);
			const others = (await this.decryptAll(await this.d.db.folders.toArray())).filter(
				(f) => f.id !== id
			);
			const check = validateFolderName(
				name,
				others.map((f) => f.name)
			);
			if (!check.valid) throw fail.validation(check.errors);
			const current = await this.d.codec.folder(row);
			const next: Folder = { ...current, name: name.trim(), updatedAt: this.iso() };
			await this.save(await this.d.codec.encryptFolder(next, row.revision, row.wrappedKey));
			return next;
		});
	}

	delete(id: Id): Promise<void> {
		return this.write(async () => {
			const { db } = this.d;
			await db.transaction('rw', db.folders, db.notes, db.outbox, async () => {
				const folder = await this.find(id);
				await db.folders.delete(id);
				await enqueue(
					db,
					{ entity: 'folder', entityId: id, op: 'delete', baseRevision: folder.revision },
					this.iso()
				);
				// Sus notas pasan a "sin carpeta". Es un metadato, no hace falta descifrar nada.
				const affected = await db.notes.where('folderId').equals(id).toArray();
				for (const note of affected) {
					const next = {
						...note,
						folderId: null,
						updatedAt: this.iso(),
						syncStatus:
							note.syncStatus === 'conflict' ? ('conflict' as const) : ('pending' as const),
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
		});
	}

	/** Se pone en cola al momento (en el orden en que se pide); la espera simulada va dentro. */
	private write<T>(task: () => Promise<T>): Promise<T> {
		return this.d.lock.run(async () => {
			await this.gate.write();
			return task();
		});
	}
}
