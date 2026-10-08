import { APP_VERSION } from './version.js';

/** Una versión publicada y los cambios que trae. */
export interface ChangelogEntry {
	version: string;
	/** Fecha de publicación en formato ISO (`YYYY-MM-DD`). */
	date: string;
	changes: string[];
}

/**
 * Historial de cambios, del más reciente al más antiguo. La entrada más nueva usa la versión actual
 * (package.json). Solo se describen funciones que existen (ver docs/roadmap.md).
 */
export const changelog: ChangelogEntry[] = [
	{
		version: APP_VERSION,
		date: '2026-10-08',
		changes: [
			'Notas en Markdown con editor y organización en carpetas.',
			'Búsqueda instantánea en todas tus notas.',
			'Papelera con recuperación durante 30 días.',
			'Enlaces públicos de solo lectura para compartir una nota.',
			'Sincronización entre varios dispositivos y uso sin conexión.',
			'Cifrado de extremo a extremo: las notas se cifran en tu dispositivo.',
			'Eliminar la cuenta ahora exige tu contraseña.'
		]
	}
];
