import { attempt, type LoadStatus } from '#lib/core/index.js';
import type { StorageRepository } from '#lib/data/index.js';
import { succeed, type ActionResult, type AppError, type StorageUsage } from '#lib/domain/index.js';

/** Uso de almacenamiento de la cuenta (pantalla "Almacenamiento y exportación"). */
export class StorageState {
	usage = $state<StorageUsage | null>(null);
	status = $state<LoadStatus>('idle');
	error = $state<AppError | null>(null);

	private readonly repo: StorageRepository;

	constructor(repo: StorageRepository) {
		this.repo = repo;
	}

	/** Porcentaje de la cuota usado (0–100). */
	percentUsed = $derived(
		this.usage && this.usage.quotaBytes > 0
			? Math.min(100, (this.usage.usedBytes / this.usage.quotaBytes) * 100)
			: 0
	);

	availableBytes = $derived(
		this.usage ? Math.max(0, this.usage.quotaBytes - this.usage.usedBytes) : 0
	);

	async load(): Promise<ActionResult> {
		this.status = 'loading';
		this.error = null;
		const result = await attempt(() => this.repo.usage());
		if (!result.ok) {
			this.status = 'error';
			this.error = result.error;
			return result;
		}
		this.usage = result.value;
		this.status = 'ready';
		return succeed();
	}
}
