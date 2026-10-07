import { attempt } from '#lib/core/index.js';
import type { ShareRepository } from '#lib/data/index.js';
import type { ActionResult, AppError, Id, ShareLink } from '#lib/domain/index.js';

/** Enlaces públicos de solo lectura ("Compartir nota"). */
export class ShareState {
	links = $state<Record<Id, ShareLink>>({});
	busy = $state(false);
	error = $state<AppError | null>(null);

	private readonly repo: ShareRepository;
	private readonly onSessionExpired: () => void;

	constructor(repo: ShareRepository, onSessionExpired: () => void = () => {}) {
		this.repo = repo;
		this.onSessionExpired = onSessionExpired;
	}

	linkFor(noteId: Id): ShareLink | null {
		return this.links[noteId] ?? null;
	}

	/** Crea el enlace (o devuelve el que ya existe). */
	async create(noteId: Id): Promise<ActionResult<ShareLink>> {
		return this.run(async () => {
			const link = await this.repo.createLink(noteId);
			this.links = { ...this.links, [noteId]: link };
			return link;
		});
	}

	async revoke(noteId: Id): Promise<ActionResult> {
		return this.run(async () => {
			await this.repo.revokeLink(noteId);
			this.links = Object.fromEntries(Object.entries(this.links).filter(([id]) => id !== noteId));
		});
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
