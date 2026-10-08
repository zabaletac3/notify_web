import { attempt } from '#lib/core/index.js';
import {
	createShare,
	openShareKey,
	openSharedNote,
	sealSharedNote,
	shareUrl,
	type ShareRepository
} from '#lib/data/index.js';
import { CryptoFormatError, DecryptError } from '#lib/core/crypto/index.js';
import {
	fail,
	type ActionResult,
	type AppError,
	type Id,
	type Note,
	type ShareLink,
	type SharedNote,
	type SharedNoteContent
} from '#lib/domain/index.js';
import type { VaultState } from '#lib/features/vault/index.js';

/** Espera tras editar una nota compartida antes de actualizar su copia pública (agrupa teclazos). */
export const REPUBLISH_DELAY_MS = 1500;

/**
 * Enlaces públicos de solo lectura ("Compartir nota"), con cifrado de extremo a extremo: la nota se
 * copia cifrada con una clave propia del enlace, y esa clave viaja solo en el fragmento de la URL.
 */
export class ShareState {
	links = $state<Record<Id, ShareLink>>({});
	busy = $state(false);
	error = $state<AppError | null>(null);

	private readonly repo: ShareRepository;
	private readonly vault: VaultState;
	private readonly getNote: (id: Id) => Note | undefined;
	private readonly beforeCreate: () => Promise<void>;
	private readonly onSessionExpired: () => void;
	private readonly republishDelayMs: number;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- temporizadores internos, no son estado
	private timers = new Map<Id, ReturnType<typeof setTimeout>>();

	/**
	 * @param vault cofre de claves (la copia se cifra con claves de la sesión)
	 * @param hooks.getNote la nota en claro (el estado de notas la tiene)
	 * @param hooks.beforeCreate se llama antes de crear un enlace (p. ej. para subir la nota al servidor)
	 */
	constructor(
		repo: ShareRepository,
		vault: VaultState,
		hooks: {
			getNote?: (id: Id) => Note | undefined;
			beforeCreate?: () => Promise<void>;
			onSessionExpired?: () => void;
			republishDelayMs?: number;
		} = {}
	) {
		this.repo = repo;
		this.vault = vault;
		this.getNote = hooks.getNote ?? (() => undefined);
		this.beforeCreate = hooks.beforeCreate ?? (async () => {});
		this.onSessionExpired = hooks.onSessionExpired ?? (() => {});
		this.republishDelayMs = hooks.republishDelayMs ?? REPUBLISH_DELAY_MS;
	}

	linkFor(noteId: Id): ShareLink | null {
		return this.links[noteId] ?? null;
	}

	/** Crea el enlace (o devuelve el que ya existe). */
	async create(noteId: Id): Promise<ActionResult<ShareLink>> {
		return this.run(async () => {
			const note = this.getNote(noteId);
			if (!note) throw fail.notFound('note');
			const vault = this.vault.current;
			await this.beforeCreate();
			const stored = await this.repo.createLink(noteId, await createShare(vault, note));
			return this.remember(stored);
		});
	}

	/** Trae el enlace que ya tiene la nota (p. ej. al abrir "Compartir" tras recargar la página). */
	async load(noteId: Id): Promise<ActionResult<ShareLink | null>> {
		return this.run(async () => {
			const stored = await this.repo.getLink(noteId);
			if (!stored) return this.forget(noteId);
			return this.remember(stored);
		});
	}

	async revoke(noteId: Id): Promise<ActionResult> {
		return this.run(async () => {
			clearTimeout(this.timers.get(noteId));
			this.timers.delete(noteId);
			await this.repo.revokeLink(noteId);
			this.forget(noteId);
		});
	}

	/**
	 * La nota compartida cambió: se actualiza su copia pública poco después. No hace nada si la nota
	 * no tiene enlace. Los fallos (sin red…) se ignoran: se reintenta con la siguiente edición.
	 */
	republish(note: Note) {
		if (!this.links[note.id]) return;
		clearTimeout(this.timers.get(note.id));
		this.timers.set(
			note.id,
			setTimeout(() => {
				this.timers.delete(note.id);
				void attempt(() => this.publishNow(note.id));
			}, this.republishDelayMs)
		);
	}

	private async publishNow(noteId: Id) {
		const note = this.getNote(noteId);
		const stored = await this.repo.getLink(noteId);
		if (!note || !stored) return;
		const vault = this.vault.current;
		const key = await openShareKey(vault, stored);
		await this.repo.updateLinkPayload(noteId, await sealSharedNote(key, stored.slug, note));
	}

	/**
	 * Lee una nota compartida desde su URL: `slug` es la parte pública y `keyFragment` la clave del
	 * fragmento (`#k=…`). No necesita sesión. Un enlace revocado, inexistente o con la clave equivocada
	 * da el mismo resultado: `not-found`.
	 */
	async open(slug: string, keyFragment: string): Promise<ActionResult<SharedNoteContent>> {
		return this.run(async () => {
			const pub = await this.repo.readPublic(slug);
			try {
				return await openSharedNote(slug, keyFragment, pub.payload, pub.updatedAt);
			} catch (e) {
				if (e instanceof DecryptError || e instanceof CryptoFormatError)
					throw fail.notFound('share');
				throw e;
			}
		});
	}

	/** Libera los temporizadores pendientes. */
	dispose() {
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
	}

	/** Guarda el enlace en memoria con su URL completa (la clave sale de la copia que guarda el servidor). */
	private async remember(stored: SharedNote): Promise<ShareLink> {
		const key = await openShareKey(this.vault.current, stored);
		const link: ShareLink = {
			id: stored.id,
			noteId: stored.noteId,
			url: await shareUrl(stored, key),
			readOnly: true,
			createdAt: stored.createdAt
		};
		this.links = { ...this.links, [stored.noteId]: link };
		return link;
	}

	private forget(noteId: Id): null {
		this.links = Object.fromEntries(Object.entries(this.links).filter(([id]) => id !== noteId));
		return null;
	}

	private async run<T>(action: () => Promise<T>): Promise<ActionResult<T>> {
		this.busy = true;
		this.error = null;
		const result = await attempt(action);
		this.busy = false;
		if (!result.ok) {
			this.error = result.error;
			if (result.error.kind === 'session-expired') this.onSessionExpired();
		}
		return result;
	}
}
