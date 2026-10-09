import { CryptoFormatError, DecryptError } from '#lib/core/crypto/index.js';
import {
	DecryptCache,
	decryptFolder,
	decryptNote,
	encryptFolder,
	encryptNote,
	unreadableFolder,
	unreadableNote
} from '../crypto/index.js';
import type { Vault } from '../crypto/index.js';
import type { Folder, Note, Sealed } from '#lib/domain/index.js';
import type { FolderRow, NoteRow } from './axonote-db.js';

const isUnreadable = (e: unknown) => e instanceof DecryptError || e instanceof CryptoFormatError;

/**
 * Convierte entre lo que se guarda en IndexedDB (cifrado) y lo que ve la app (en claro).
 * Recuerda lo ya descifrado mientras el texto cifrado no cambie. Si el cofre está bloqueado, lanza
 * `locked`; si una fila está corrupta, la devuelve como «ilegible» para no romper la lista.
 */
export class LocalCodec {
	private notes = new DecryptCache<Note>();
	private folders = new DecryptCache<Folder>();

	constructor(private vault: () => Vault) {}

	/** Olvida lo descifrado (al bloquear o cerrar sesión). */
	clear() {
		this.notes.clear();
		this.folders.clear();
	}

	async note(row: NoteRow): Promise<Note> {
		let plain = this.notes.get(row.id, row.payload, row.wrappedKey);
		if (!plain) {
			try {
				plain = await decryptNote(this.vault(), row, row.syncStatus);
			} catch (e) {
				if (!isUnreadable(e)) throw e;
				return unreadableNote(row, row.syncStatus);
			}
			this.notes.set(row.id, row.payload, row.wrappedKey, plain);
		}
		// Los metadatos (carpeta, fechas, papelera, revisión) pueden cambiar sin tocar el texto cifrado.
		return {
			...plain,
			tags: [...plain.tags],
			folderId: row.folderId,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			deletedAt: row.deletedAt,
			revision: row.revision,
			syncStatus: row.syncStatus,
			lastEditedDeviceId: row.lastEditedDeviceId
		};
	}

	/** Cifra una nota. Con `wrappedKey` conserva su clave; sin ella crea una nueva. */
	async encryptNote(note: Note, wrappedKey?: Sealed): Promise<NoteRow> {
		const encrypted = await encryptNote(this.vault(), note, wrappedKey);
		this.notes.set(note.id, encrypted.payload, encrypted.wrappedKey, note);
		return { ...encrypted, syncStatus: note.syncStatus };
	}

	async folder(row: FolderRow): Promise<Folder> {
		let plain = this.folders.get(row.id, row.payload, row.wrappedKey);
		if (!plain) {
			try {
				plain = await decryptFolder(this.vault(), row);
			} catch (e) {
				if (!isUnreadable(e)) throw e;
				return unreadableFolder(row);
			}
			this.folders.set(row.id, row.payload, row.wrappedKey, plain);
		}
		return {
			...plain,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt
		};
	}

	async encryptFolder(folder: Folder, revision: number, wrappedKey?: Sealed): Promise<FolderRow> {
		const encrypted = await encryptFolder(this.vault(), folder, revision, wrappedKey);
		this.folders.set(folder.id, encrypted.payload, encrypted.wrappedKey, folder);
		return encrypted;
	}
}
