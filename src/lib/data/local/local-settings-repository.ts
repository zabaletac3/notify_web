import { DEFAULT_SETTINGS, normalizeSettings, type AppSettings } from '#lib/domain/index.js';
import type { SettingsRepository } from '../contracts.js';
import { noGate, type LocalDeps } from './gate.js';
import { DevicePrefs } from './device-prefs.js';

/**
 * Preferencias guardadas en este dispositivo (no se sincronizan entre dispositivos). Viven en
 * `localStorage` con una clave por cuenta (`apunte-prefs-<userId>`), fuera de la base local: cerrar
 * sesión no las borra, solo eliminarlas al borrar la cuenta.
 */
export class LocalSettingsRepository implements SettingsRepository {
	constructor(
		private d: LocalDeps,
		private prefs: DevicePrefs
	) {}

	private get gate() {
		return this.d.gate ?? noGate;
	}

	async get(userId?: string): Promise<AppSettings> {
		await this.gate.read();
		// Sin cuenta no hay preferencias que devolver (la base local no está abierta).
		if (!userId) return { ...DEFAULT_SETTINGS };
		const stored = this.prefs.read(userId);
		if (stored) return normalizeSettings(stored);
		// Migración: si venían de la base local (ajustes antiguos), se copian una sola vez.
		const legacy = await this.readLegacy();
		if (legacy) {
			const migrated = normalizeSettings(legacy);
			this.prefs.write(userId, migrated);
			return migrated;
		}
		return { ...DEFAULT_SETTINGS };
	}

	async update(patch: Partial<AppSettings>, userId?: string): Promise<AppSettings> {
		await this.gate.write();
		if (!userId) return normalizeSettings({ ...DEFAULT_SETTINGS, ...patch });
		const next = normalizeSettings({ ...(await this.get(userId)), ...patch });
		this.prefs.write(userId, next);
		return next;
	}

	/** Ajustes guardados en la base local por versiones anteriores. Devuelve `null` si no hay o no se puede leer. */
	private async readLegacy(): Promise<Partial<AppSettings> | null> {
		try {
			return (await this.d.db.getMeta<Partial<AppSettings>>('settings')) ?? null;
		} catch {
			// La base no está abierta (p. ej. antes de desbloquear): se intentará en la siguiente carga.
			return null;
		}
	}
}
