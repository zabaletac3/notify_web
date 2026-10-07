import { attempt, type LoadStatus } from '#lib/core/index.js';
import type { DeviceRepository, SettingsRepository } from '#lib/data/index.js';
import {
	DEFAULT_SETTINGS,
	succeed,
	type ActionResult,
	type AppError,
	type AppSettings,
	type Device,
	type Id
} from '#lib/domain/index.js';

/** Preferencias de la app. Los cambios se ven al instante y se revierten si el guardado falla. */
export class SettingsState {
	values = $state<AppSettings>({ ...DEFAULT_SETTINGS });
	status = $state<LoadStatus>('idle');
	lastError = $state<AppError | null>(null);

	private readonly repo: SettingsRepository;

	constructor(repo: SettingsRepository) {
		this.repo = repo;
	}

	async load(): Promise<ActionResult> {
		this.status = 'loading';
		const result = await attempt(() => this.repo.get());
		if (!result.ok) {
			this.status = 'error';
			return result;
		}
		this.values = result.value;
		this.status = 'ready';
		return succeed();
	}

	async update(patch: Partial<AppSettings>): Promise<ActionResult> {
		const before = this.values;
		this.values = { ...this.values, ...patch };
		this.lastError = null;
		const result = await attempt(() => this.repo.update(patch));
		if (!result.ok) {
			this.values = before;
			this.lastError = result.error;
			return result;
		}
		this.values = result.value;
		return succeed();
	}
}

/** Dispositivos con sesión iniciada ("Sincronización y dispositivos"). */
export class DevicesState {
	list = $state<Device[]>([]);
	status = $state<LoadStatus>('idle');
	error = $state<AppError | null>(null);

	private readonly repo: DeviceRepository;
	private readonly onSessionExpired: () => void;

	constructor(repo: DeviceRepository, onSessionExpired: () => void = () => {}) {
		this.repo = repo;
		this.onSessionExpired = onSessionExpired;
	}

	current = $derived.by(() => this.list.find((d) => d.current) ?? null);
	others = $derived.by(() => this.list.filter((d) => !d.current));

	async load(): Promise<ActionResult> {
		this.status = 'loading';
		this.error = null;
		const result = await attempt(() => this.repo.list());
		if (!result.ok) return this.fail(result.error, result);
		this.list = result.value;
		this.status = 'ready';
		return succeed();
	}

	async remove(id: Id): Promise<ActionResult> {
		const result = await attempt(() => this.repo.remove(id));
		if (!result.ok) return this.fail(result.error, result);
		this.list = this.list.filter((d) => d.id !== id);
		return succeed();
	}

	private fail<R extends { ok: false; error: AppError }>(error: AppError, result: R): R {
		this.error = error;
		this.status = 'error';
		if (error.kind === 'session-expired') this.onSessionExpired();
		return result;
	}
}
