import { DEFAULT_SETTINGS, type AppSettings } from '#lib/domain/index.js';
import type { SettingsRepository } from '../contracts.js';
import { noGate, type LocalDeps } from './gate.js';

/** Preferencias guardadas en este dispositivo. (Todavía no se sincronizan entre dispositivos.) */
export class LocalSettingsRepository implements SettingsRepository {
	constructor(private d: LocalDeps) {}

	private get gate() {
		return this.d.gate ?? noGate;
	}

	async get(): Promise<AppSettings> {
		await this.gate.write();
		const stored = await this.d.db.getMeta<Partial<AppSettings>>('settings');
		return { ...DEFAULT_SETTINGS, ...stored };
	}

	async update(patch: Partial<AppSettings>): Promise<AppSettings> {
		await this.gate.write();
		const next = { ...(await this.get()), ...patch };
		await this.d.db.setMeta('settings', next);
		return next;
	}
}
