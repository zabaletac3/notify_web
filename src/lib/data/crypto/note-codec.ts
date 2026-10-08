import { DecryptError, open, pad, seal, unpadJson, utf8 } from '#lib/core/crypto/index.js';
import type {
	EncryptedFolder,
	EncryptedNote,
	Folder,
	Id,
	Note,
	NoteSyncStatus,
	Sealed
} from '#lib/domain/index.js';
import type { Vault } from './vault.js';

/** Lo que va dentro del texto cifrado de una nota. */
export interface NotePayload {
	title: string;
	content: string;
	tags: string[];
	pinned: boolean;
}

export interface FolderPayload {
	name: string;
}

const isStringArray = (v: unknown): v is string[] =>
	Array.isArray(v) && v.every((x) => typeof x === 'string');

function parseNotePayload(json: string): NotePayload {
	let value: unknown;
	try {
		value = JSON.parse(json);
	} catch {
		throw new DecryptError();
	}
	const p = value as Partial<NotePayload> | null;
	if (
		!p ||
		typeof p.title !== 'string' ||
		typeof p.content !== 'string' ||
		!isStringArray(p.tags) ||
		typeof p.pinned !== 'boolean'
	)
		throw new DecryptError();
	return { title: p.title, content: p.content, tags: p.tags, pinned: p.pinned };
}

function parseFolderPayload(json: string): FolderPayload {
	let value: unknown;
	try {
		value = JSON.parse(json);
	} catch {
		throw new DecryptError();
	}
	const p = value as Partial<FolderPayload> | null;
	if (!p || typeof p.name !== 'string') throw new DecryptError();
	return { name: p.name };
}

/**
 * Serializa y rellena el contenido de una nota tal y como se cifra. Es la forma canónica del
 * `payload`: JSON `{ title, content, tags, pinned }` (en ese orden) rellenado a múltiplos de 256.
 * Lo usan `encryptNote` y el generador de vectores (`docs/api/vectors`).
 */
export const encodeNotePayload = (payload: NotePayload): Uint8Array<ArrayBuffer> =>
	pad(utf8(JSON.stringify(payload)));

/** Serializa y rellena el nombre de una carpeta: JSON `{ name }` rellenado a múltiplos de 256. */
export const encodeFolderPayload = (payload: FolderPayload): Uint8Array<ArrayBuffer> =>
	pad(utf8(JSON.stringify(payload)));

/**
 * Cifra una nota. Si llega `wrapped` (la clave que ya tenía) se reutiliza; si no, se crea una nueva.
 * El servidor solo verá los metadatos y los dos textos cifrados.
 */
export async function encryptNote(
	vault: Vault,
	note: Note,
	wrapped?: Sealed
): Promise<EncryptedNote> {
	const item = wrapped
		? { key: await vault.itemKey('note', note.id, wrapped), wrapped }
		: await vault.newItemKey('note', note.id);
	const payload: NotePayload = {
		title: note.title,
		content: note.content,
		tags: note.tags,
		pinned: note.pinned
	};
	return {
		id: note.id,
		folderId: note.folderId,
		createdAt: note.createdAt,
		updatedAt: note.updatedAt,
		deletedAt: note.deletedAt,
		revision: note.revision,
		lastEditedDeviceId: note.lastEditedDeviceId,
		wrappedKey: item.wrapped,
		payload: await seal(item.key, encodeNotePayload(payload), vault.dataAad('note', note.id))
	};
}

/** Lanza `DecryptError` o `CryptoFormatError` si la clave o el texto no son válidos. */
export async function decryptNote(
	vault: Vault,
	encrypted: EncryptedNote,
	syncStatus: NoteSyncStatus
): Promise<Note> {
	const key = await vault.itemKey('note', encrypted.id, encrypted.wrappedKey);
	const bytes = await open(key, encrypted.payload, vault.dataAad('note', encrypted.id));
	const payload = parseNotePayload(unpadJson(bytes));
	return {
		id: encrypted.id,
		folderId: encrypted.folderId,
		title: payload.title,
		content: payload.content,
		tags: payload.tags,
		pinned: payload.pinned,
		createdAt: encrypted.createdAt,
		updatedAt: encrypted.updatedAt,
		deletedAt: encrypted.deletedAt,
		revision: encrypted.revision,
		syncStatus,
		lastEditedDeviceId: encrypted.lastEditedDeviceId
	};
}

/** Lo que se muestra de una nota que no se pudo descifrar, para no romper la lista. */
export function unreadableNote(encrypted: EncryptedNote, syncStatus: NoteSyncStatus): Note {
	return {
		id: encrypted.id,
		folderId: encrypted.folderId,
		title: 'Nota ilegible',
		content: '',
		tags: [],
		pinned: false,
		unreadable: true,
		createdAt: encrypted.createdAt,
		updatedAt: encrypted.updatedAt,
		deletedAt: encrypted.deletedAt,
		revision: encrypted.revision,
		syncStatus,
		lastEditedDeviceId: encrypted.lastEditedDeviceId
	};
}

export async function encryptFolder(
	vault: Vault,
	folder: Folder,
	revision: number,
	wrapped?: Sealed
): Promise<EncryptedFolder> {
	const item = wrapped
		? { key: await vault.itemKey('folder', folder.id, wrapped), wrapped }
		: await vault.newItemKey('folder', folder.id);
	return {
		id: folder.id,
		createdAt: folder.createdAt,
		updatedAt: folder.updatedAt,
		revision,
		wrappedKey: item.wrapped,
		payload: await seal(
			item.key,
			encodeFolderPayload({ name: folder.name }),
			vault.dataAad('folder', folder.id)
		)
	};
}

export async function decryptFolder(vault: Vault, encrypted: EncryptedFolder): Promise<Folder> {
	const key = await vault.itemKey('folder', encrypted.id, encrypted.wrappedKey);
	const bytes = await open(key, encrypted.payload, vault.dataAad('folder', encrypted.id));
	const payload = parseFolderPayload(unpadJson(bytes));
	return {
		id: encrypted.id,
		name: payload.name,
		createdAt: encrypted.createdAt,
		updatedAt: encrypted.updatedAt
	};
}

export function unreadableFolder(encrypted: EncryptedFolder): Folder {
	return {
		id: encrypted.id,
		name: 'Carpeta ilegible',
		createdAt: encrypted.createdAt,
		updatedAt: encrypted.updatedAt
	};
}

/**
 * Recuerda lo ya descifrado mientras el texto cifrado no cambie, para no descifrar toda la lista
 * en cada lectura.
 */
export class DecryptCache<T> {
	private entries = new Map<Id, { payload: Sealed; wrappedKey: Sealed; value: T }>();

	get(id: Id, payload: Sealed, wrappedKey: Sealed): T | undefined {
		const entry = this.entries.get(id);
		return entry && entry.payload === payload && entry.wrappedKey === wrappedKey
			? entry.value
			: undefined;
	}

	set(id: Id, payload: Sealed, wrappedKey: Sealed, value: T): void {
		this.entries.set(id, { payload, wrappedKey, value });
	}

	delete(id: Id): void {
		this.entries.delete(id);
	}

	clear(): void {
		this.entries.clear();
	}
}
