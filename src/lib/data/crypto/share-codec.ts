import {
	DecryptError,
	exportRawForShare,
	generateItemKey,
	importRawForShare,
	open,
	pad,
	randomBytes,
	seal,
	toB64u,
	unpadJson,
	unwrap,
	utf8,
	wrap,
	type Sealed
} from '#lib/core/crypto/index.js';
import type { Id, Note, ShareInput, SharedNote, SharedNoteContent } from '#lib/domain/index.js';
import type { Vault } from './vault.js';

/**
 * Cifrado de los enlaces públicos. La copia de la nota se cifra con una clave del enlace; esa clave
 * va en el fragmento de la URL (que no llega al servidor) y, cifrada con la clave maestra, en el
 * servidor para que el dueño pueda reconstruir el enlace.
 */

export const SLUG_BYTES = 16;
const SLUG_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export const isValidSlug = (slug: string) => SLUG_PATTERN.test(slug);
export const newSlug = () => toB64u(randomBytes(SLUG_BYTES));

/** Datos asociados de la copia: la ligan a la parte pública de la URL que se comparte. */
const contentAad = (slug: string) => `apunte/v1/share/${slug}`;
/** Datos asociados de la clave del enlace, ligada a la cuenta y a la nota. */
const keyAad = (userId: Id, noteId: Id) => `apunte/v1/sharekey/${userId}/${noteId}`;

/** Cifra la copia compartida (solo título y texto; ni etiquetas ni carpeta). */
export async function sealSharedNote(
	shareKey: CryptoKey,
	slug: string,
	note: Pick<Note, 'title' | 'content'>
): Promise<Sealed> {
	const json = JSON.stringify({ title: note.title, content: note.content });
	return seal(shareKey, pad(utf8(json)), contentAad(slug));
}

/** Prepara un enlace nuevo: clave propia, copia cifrada y la clave cifrada con la clave maestra. */
export async function createShare(
	vault: Vault,
	note: Pick<Note, 'id' | 'title' | 'content'>
): Promise<ShareInput> {
	const slug = newSlug();
	const shareKey = await generateItemKey();
	return {
		slug,
		payload: await sealSharedNote(shareKey, slug, note),
		wrappedShareKey: await wrap(vault.requireKey(), shareKey, keyAad(vault.userId, note.id))
	};
}

/** La clave de un enlace ya creado (para actualizar la copia o reconstruir la URL). */
export function openShareKey(vault: Vault, shared: SharedNote): Promise<CryptoKey> {
	return unwrap(vault.requireKey(), shared.wrappedShareKey, keyAad(vault.userId, shared.noteId));
}

const SHARE_ORIGIN = 'https://apunte.app';

/** La URL que se comparte: la clave va en el fragmento, que el navegador no envía al servidor. */
export async function shareUrl(shared: SharedNote, shareKey: CryptoKey): Promise<string> {
	return `${SHARE_ORIGIN}/n/${shared.slug}#k=${await exportRawForShare(shareKey)}`;
}

/** Saca la clave del fragmento de una URL (`#k=…`), o `null` si no hay o está mal formada. */
export function keyFromFragment(fragment: string): string | null {
	const match = /^#?k=([A-Za-z0-9_-]{43})$/.exec(fragment);
	return match ? match[1] : null;
}

/**
 * Lee una nota compartida con la clave del fragmento. Lanza `DecryptError` o `CryptoFormatError`
 * si la clave no corresponde al enlace o el contenido no es válido.
 */
export async function openSharedNote(
	slug: string,
	keyFragment: string,
	payload: Sealed,
	updatedAt: string
): Promise<SharedNoteContent> {
	const key = await importRawForShare(keyFragment);
	const bytes = await open(key, payload, contentAad(slug));
	let value: unknown;
	try {
		value = JSON.parse(unpadJson(bytes));
	} catch {
		throw new DecryptError();
	}
	const v = value as { title?: unknown; content?: unknown } | null;
	if (!v || typeof v.title !== 'string' || typeof v.content !== 'string') throw new DecryptError();
	return { title: v.title, content: v.content, updatedAt };
}
