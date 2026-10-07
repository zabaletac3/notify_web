import { attempt, type LoadStatus } from '#lib/core/index.js';
import type { FolderRepository } from '#lib/data/index.js';
import {
	succeed,
	validateFolderName,
	type ActionResult,
	type AppError,
	type Folder,
	type Id
} from '#lib/domain/index.js';

export class FoldersState {
	list = $state<Folder[]>([]);
	status = $state<LoadStatus>('idle');
	error = $state<AppError | null>(null);
	lastError = $state<AppError | null>(null);

	private readonly repo: FolderRepository;
	private readonly onNotesAffected: () => Promise<void>;

	/** `onNotesAffected`: se llama al borrar una carpeta, porque sus notas cambian de carpeta. */
	constructor(repo: FolderRepository, onNotesAffected: () => Promise<void> = async () => {}) {
		this.repo = repo;
		this.onNotesAffected = onNotesAffected;
	}

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- índice temporal dentro de un derivado, no se muta
	byId = $derived.by(() => new Map(this.list.map((f) => [f.id, f])));

	name(id: Id | null): string {
		return id ? (this.byId.get(id)?.name ?? '') : 'Sin carpeta';
	}

	async load(): Promise<ActionResult> {
		this.status = 'loading';
		this.error = null;
		const result = await attempt(() => this.repo.list());
		if (!result.ok) {
			this.status = 'error';
			this.error = result.error;
			return result;
		}
		this.list = result.value;
		this.status = 'ready';
		return succeed();
	}

	/** Valida el nombre en el cliente (mismo criterio que el servidor) y crea la carpeta. */
	async create(name: string): Promise<ActionResult<Folder>> {
		const check = validateFolderName(
			name,
			this.list.map((f) => f.name)
		);
		if (!check.valid) return { ok: false, error: { kind: 'validation', fields: check.errors } };
		return this.run(async () => {
			const folder = await this.repo.create(name);
			this.list = [...this.list, folder];
			return folder;
		});
	}

	async rename(id: Id, name: string): Promise<ActionResult<Folder>> {
		const check = validateFolderName(
			name,
			this.list.filter((f) => f.id !== id).map((f) => f.name)
		);
		if (!check.valid) return { ok: false, error: { kind: 'validation', fields: check.errors } };
		return this.run(async () => {
			const folder = await this.repo.rename(id, name);
			this.list = this.list.map((f) => (f.id === id ? folder : f));
			return folder;
		});
	}

	async remove(id: Id): Promise<ActionResult> {
		const result = await this.run(async () => {
			await this.repo.delete(id);
			this.list = this.list.filter((f) => f.id !== id);
		});
		if (result.ok) await this.onNotesAffected();
		return result;
	}

	private async run<T>(action: () => Promise<T>): Promise<ActionResult<T>> {
		this.lastError = null;
		const result = await attempt(action);
		if (!result.ok) this.lastError = result.error;
		return result;
	}
}
