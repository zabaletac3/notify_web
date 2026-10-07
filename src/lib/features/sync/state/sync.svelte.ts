import { attempt } from '#lib/core/index.js';
import type { SyncRepository } from '#lib/data/index.js';
import {
	succeed,
	type ActionResult,
	type AppError,
	type Conflict,
	type ConflictResolution,
	type Id,
	type SyncPhase,
	type SyncSnapshot
} from '#lib/domain/index.js';

const EMPTY: SyncSnapshot = { phase: 'idle', lastSyncedAt: null, pendingCount: 0, conflicts: [] };

/**
 * Estado de la sincronización: fase (idle · syncing · offline · error), cambios pendientes y conflictos.
 * De aquí salen el banner "sin conexión", el estado de la barra y el diálogo de conflicto.
 */
export class SyncState {
	snapshot = $state<SyncSnapshot>({ ...EMPTY });
	syncing = $state(false);
	/** Error de la última sincronización. Se limpia al lograr una. */
	lastError = $state<AppError | null>(null);

	private readonly repo: SyncRepository;
	private readonly onSynced: () => Promise<void>;
	private readonly onSessionExpired: () => void;

	/**
	 * @param onSynced se llama tras sincronizar o resolver un conflicto (para recargar las notas)
	 * @param onSessionExpired se llama cuando el servidor dice que la sesión venció
	 */
	constructor(
		repo: SyncRepository,
		hooks: { onSynced?: () => Promise<void>; onSessionExpired?: () => void } = {}
	) {
		this.repo = repo;
		this.onSynced = hooks.onSynced ?? (async () => {});
		this.onSessionExpired = hooks.onSessionExpired ?? (() => {});
	}

	phase: SyncPhase = $derived.by(() => {
		if (this.syncing) return 'syncing';
		if (this.lastError?.kind === 'network') return 'offline';
		if (this.lastError?.kind === 'server') return 'error';
		return this.snapshot.phase;
	});

	pendingCount = $derived.by(() => this.snapshot.pendingCount);
	conflicts: Conflict[] = $derived.by(() => this.snapshot.conflicts);
	/** Primer conflicto sin resolver (el diálogo resuelve de a uno). */
	firstConflict: Conflict | null = $derived.by(() => this.snapshot.conflicts[0] ?? null);
	lastSyncedAt = $derived.by(() => this.snapshot.lastSyncedAt);
	isOffline = $derived.by(() => this.phase === 'offline');

	/** Lee el estado local (sin ir al servidor). Úsalo al arrancar y al cambiar la conectividad. */
	async refresh(): Promise<void> {
		const result = await attempt(() => this.repo.snapshot());
		if (!result.ok) return;
		this.snapshot = result.value;
		// Si la conectividad volvió, el error anterior ya no aplica.
		if (result.value.phase === 'idle') this.lastError = null;
	}

	async syncNow(): Promise<ActionResult> {
		if (this.syncing) return succeed();
		this.syncing = true;
		const result = await attempt(() => this.repo.syncNow());
		this.syncing = false;
		if (!result.ok) return this.handleFailure(result);
		this.lastError = null;
		this.snapshot = result.value;
		await this.onSynced();
		return succeed();
	}

	async resolve(noteId: Id, resolution: ConflictResolution): Promise<ActionResult> {
		const result = await attempt(() => this.repo.resolveConflict(noteId, resolution));
		if (!result.ok) return this.handleFailure(result);
		this.snapshot = result.value;
		await this.onSynced();
		return succeed();
	}

	private handleFailure<R extends { ok: false; error: AppError }>(result: R): R {
		this.lastError = result.error;
		if (result.error.kind === 'session-expired') {
			this.lastError = null;
			this.onSessionExpired();
		}
		return result;
	}
}
