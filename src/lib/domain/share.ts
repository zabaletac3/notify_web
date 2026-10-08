import type { Sealed } from './crypto.js';
import type { Id, IsoDate } from './ids.js';

/** Enlace público de solo lectura a una nota. */
export interface ShareLink {
	id: Id;
	noteId: Id;
	url: string;
	readOnly: true;
	createdAt: IsoDate;
}

// ── Enlaces con cifrado de extremo a extremo ────────────────────────────────
//
// Compartir crea una copia cifrada de la nota con una clave propia del enlace. La clave viaja en el
// fragmento de la URL (`#k=…`), que el navegador no envía al servidor. El servidor guarda la copia
// cifrada y la clave del enlace cifrada con la clave maestra (para que el dueño pueda reconstruir el
// enlace en otro dispositivo y actualizar la copia al editar la nota).

/** Lo que guarda el servidor de un enlace. */
export interface SharedNote {
	id: Id;
	noteId: Id;
	/** Parte pública de la URL. La elige el cliente (aleatoria, 16 bytes en base64url). */
	slug: string;
	/** Clave del enlace, cifrada con la clave maestra del dueño. */
	wrappedShareKey: Sealed;
	/** `{ title, content }` rellenado y cifrado con la clave del enlace. */
	payload: Sealed;
	createdAt: IsoDate;
	updatedAt: IsoDate;
}

/** Lo que manda el cliente al crear un enlace. */
export interface ShareInput {
	slug: string;
	wrappedShareKey: Sealed;
	payload: Sealed;
}

/** Lo que devuelve el servidor a quien abre el enlace (sin sesión). */
export interface PublicNote {
	payload: Sealed;
	updatedAt: IsoDate;
}

/** La nota compartida, ya descifrada, para la página pública. */
export interface SharedNoteContent {
	title: string;
	content: string;
	updatedAt: IsoDate;
}
