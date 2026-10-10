import { isSealed } from '#lib/core/crypto/index.js';
import {
	fail,
	type EncryptedFolder,
	type EncryptedFolderFields,
	type EncryptedNote,
	type EncryptedNoteFields,
	type EncryptedSyncChange,
	type EncryptedSyncConflictReport,
	type EncryptedSyncRemoteChange,
	type EncryptedSyncRequest,
	type EncryptedSyncResponse,
	type Id,
	type SyncApplied
} from '#lib/domain/index.js';
import { decryptNote, encryptFolder, encryptNote } from '../crypto/note-codec.js';
import type { Vault } from '../crypto/vault.js';
import type { SyncTransport } from '../contracts.js';
import { createDemoVault } from './demo-vault.js';
import { DEMO_USER_ID, type MockDatabase, type ServerAccount } from './mock-database.js';

const clone = <T>(v: T): T => structuredClone(v);

/**
 * Servidor de sincronización en memoria. Implementa el protocolo de `domain/sync-protocol.ts`.
 * **Solo ve metadatos y textos cifrados**: nunca descifra lo que le llega (la única excepción es el
 * simulador, que cifra los datos de ejemplo y simula la edición de otro dispositivo de la cuenta de ejemplo).
 * Varios clientes pueden compartir un mismo servidor (así se prueba con dos dispositivos).
 */
export class MockSyncServer implements SyncTransport {
	private demoVault: Promise<Vault> | null = null;

	constructor(private db: MockDatabase) {}

	/** Cofre de la cuenta de ejemplo: solo para sembrar sus datos y simular ediciones de otro dispositivo. */
	private vault() {
		return (this.demoVault ??= createDemoVault());
	}

	async sync(req: EncryptedSyncRequest): Promise<EncryptedSyncResponse> {
		await this.db.remote();
		const userId = this.db.session?.user.id;
		if (!userId) throw fail.sessionExpired();
		this.db.deviceNames.set(req.deviceId, req.deviceName);
		const account = await this.account(userId);

		const applied: SyncApplied[] = [];
		const conflicts: EncryptedSyncConflictReport[] = [];
		const touched = new Set<string>();
		// Revisión de cada nota justo antes de que, en esta misma petición, el borrado de su carpeta se
		// la subiera de rebote (ver applyFolder/applyNote): así el upsert de esa nota que llegue con esa
		// revisión anterior no choca contra un cambio que, en los hechos, él mismo provocó.
		const folderBump = new Map<Id, number>();
		for (const change of req.changes) {
			if (change.op === 'upsert') this.validate(change);
			if (change.entity === 'folder') this.applyFolder(account, change, applied, touched, folderBump);
			else this.applyNote(account, change, req, applied, conflicts, touched, folderBump);
		}

		return {
			cursor: String(account.seq),
			applied,
			remoteChanges: this.changesSince(account, req.cursor, touched),
			conflicts
		};
	}

	/** Simula que otro dispositivo (Pixel 8) editó esta nota: sube su revisión y cambia el texto. */
	async simulateRemoteEdit(noteId: Id): Promise<boolean> {
		const account = await this.account(DEMO_USER_ID);
		const note = account.notes.find((n) => n.id === noteId && !n.deletedAt);
		if (!note) return false;
		const vault = await this.vault();
		const plain = await decryptNote(vault, note, 'synced');
		const edited = {
			...plain,
			content: `${plain.content}\n\n- [ ] Revisar ejercicios del parcial`,
			updatedAt: new Date(this.db.now().getTime() - 2 * 60000).toISOString(),
			revision: note.revision + 1,
			lastEditedDeviceId: 'd_pixel'
		};
		Object.assign(note, await encryptNote(vault, edited, note.wrappedKey));
		this.bump(account, 'note', note.id);
		return true;
	}

	// ── Datos de la cuenta ────────────────────────────────────────────

	/** Datos de una cuenta; los de la cuenta de ejemplo se cifran la primera vez que se piden. */
	private async account(userId: string): Promise<ServerAccount> {
		const account = this.db.account(userId);
		if (!account.seeded) {
			account.seeding ??= this.seed(account).then(() => {
				account.seeded = true;
			});
			await account.seeding;
		}
		return account;
	}

	private async seed(account: ServerAccount) {
		const vault = await this.vault();
		for (const f of this.db.folders) {
			account.folders.push(await encryptFolder(vault, f, 1));
			this.bump(account, 'folder', f.id);
		}
		for (const n of this.db.notes) {
			account.notes.push(await encryptNote(vault, n));
			this.bump(account, 'note', n.id);
		}
	}

	/** El servidor no descifra, pero sí comprueba que lo que guarda tiene la forma de un texto cifrado. */
	private validate(change: EncryptedSyncChange) {
		const data = change.data as Partial<EncryptedNoteFields> | undefined;
		if (!data || !isSealed(data.wrappedKey) || !isSealed(data.payload))
			throw fail.validation({ payload: 'invalid-payload' });
	}

	// ── Aplicar cambios del cliente ───────────────────────────────────

	private applyNote(
		account: ServerAccount,
		change: EncryptedSyncChange,
		req: EncryptedSyncRequest,
		applied: SyncApplied[],
		conflicts: EncryptedSyncConflictReport[],
		touched: Set<string>,
		folderBump: Map<Id, number>
	) {
		const existing = account.notes.find((n) => n.id === change.id);
		const key = `note:${change.id}`;

		if (change.op === 'delete') {
			if (existing) {
				account.notes = account.notes.filter((n) => n.id !== change.id);
				this.tombstone(account, 'note', change.id, existing.revision);
			}
			applied.push({ entity: 'note', id: change.id, revision: existing?.revision ?? 0 });
			touched.add(key);
			return;
		}

		const data = change.data as EncryptedNoteFields;
		if (!existing) {
			const note: EncryptedNote = {
				id: change.id,
				...clone(data),
				revision: 1,
				lastEditedDeviceId: req.deviceId
			};
			account.notes.unshift(note);
			account.tombstones = account.tombstones.filter(
				(t) => !(t.entity === 'note' && t.id === note.id)
			);
			this.bump(account, 'note', note.id);
			applied.push({ entity: 'note', id: note.id, revision: 1 });
			touched.add(key);
			return;
		}

		const bumpedFrom = folderBump.get(existing.id);
		const exemptFromOwnFolderDelete = bumpedFrom !== undefined && bumpedFrom === change.baseRevision;
		if (existing.revision !== change.baseRevision && !exemptFromOwnFolderDelete) {
			// El servidor no pisa: devuelve su versión y el cliente decide.
			conflicts.push({
				noteId: existing.id,
				remote: clone(existing),
				remoteDeviceName: this.deviceName(existing.lastEditedDeviceId)
			});
			return;
		}

		Object.assign(existing, clone(data), {
			revision: existing.revision + 1,
			lastEditedDeviceId: req.deviceId
		});
		this.bump(account, 'note', existing.id);
		applied.push({ entity: 'note', id: existing.id, revision: existing.revision });
		touched.add(key);
	}

	/** Las carpetas no tienen conflictos: gana el último cambio. */
	private applyFolder(
		account: ServerAccount,
		change: EncryptedSyncChange,
		applied: SyncApplied[],
		touched: Set<string>,
		folderBump: Map<Id, number>
	) {
		const existing = account.folders.find((f) => f.id === change.id);
		const revision = (existing?.revision ?? 0) + 1;
		touched.add(`folder:${change.id}`);

		if (change.op === 'delete') {
			if (existing) {
				account.folders = account.folders.filter((f) => f.id !== change.id);
				this.tombstone(account, 'folder', change.id, revision);
				// Sus notas pasan a "sin carpeta" también en el servidor (es un metadato, no hace falta descifrar).
				for (const note of account.notes) {
					if (note.folderId === change.id) {
						// Guarda la revisión que tenía antes de esta subida de rebote: un upsert de esta
						// misma petición con esa baseRevision no es un conflicto real (ver applyNote).
						folderBump.set(note.id, note.revision);
						note.folderId = null;
						note.revision += 1;
						this.bump(account, 'note', note.id);
					}
				}
			}
			applied.push({ entity: 'folder', id: change.id, revision });
			return;
		}

		const data = clone(change.data as EncryptedFolderFields);
		if (existing) Object.assign(existing, data, { revision });
		else account.folders.push({ id: change.id, ...data, revision });
		account.tombstones = account.tombstones.filter(
			(t) => !(t.entity === 'folder' && t.id === change.id)
		);
		this.bump(account, 'folder', change.id);
		applied.push({ entity: 'folder', id: change.id, revision });
	}

	// ── Cambios para el cliente ───────────────────────────────────────

	private changesSince(
		account: ServerAccount,
		cursor: string | null,
		touched: Set<string>
	): EncryptedSyncRemoteChange[] {
		const since = cursor ? Number(cursor) : 0;
		const seqOf = (key: string) => account.entitySeq.get(key) ?? 0;
		const out: { seq: number; change: EncryptedSyncRemoteChange }[] = [];

		for (const f of account.folders as EncryptedFolder[]) {
			const key = `folder:${f.id}`;
			if (seqOf(key) > since && !touched.has(key))
				out.push({
					seq: seqOf(key),
					change: {
						entity: 'folder',
						id: f.id,
						deleted: false,
						revision: f.revision,
						folder: clone(f)
					}
				});
		}
		for (const n of account.notes) {
			const key = `note:${n.id}`;
			if (seqOf(key) > since && !touched.has(key))
				out.push({
					seq: seqOf(key),
					change: {
						entity: 'note',
						id: n.id,
						deleted: false,
						revision: n.revision,
						note: clone(n)
					}
				});
		}
		for (const t of account.tombstones) {
			const key = `${t.entity}:${t.id}`;
			if (t.seq > since && !touched.has(key))
				out.push({
					seq: t.seq,
					change: { entity: t.entity, id: t.id, deleted: true, revision: t.revision }
				});
		}
		// Carpetas antes que notas, y cada grupo por orden de cambio.
		const rank = (c: EncryptedSyncRemoteChange) => (c.entity === 'folder' ? 0 : 1);
		return out
			.sort((a, b) => rank(a.change) - rank(b.change) || a.seq - b.seq)
			.map((x) => x.change);
	}

	// ── Internos ──────────────────────────────────────────────────────

	private bump(account: ServerAccount, entity: 'note' | 'folder', id: Id) {
		account.entitySeq.set(`${entity}:${id}`, ++account.seq);
	}

	private tombstone(account: ServerAccount, entity: 'note' | 'folder', id: Id, revision: number) {
		account.tombstones.push({ entity, id, seq: ++account.seq, revision });
	}

	private deviceName(deviceId: Id): string {
		return (
			this.db.deviceNames.get(deviceId) ??
			this.db.devices.find((d) => d.id === deviceId)?.name ??
			'Otro dispositivo'
		);
	}
}
