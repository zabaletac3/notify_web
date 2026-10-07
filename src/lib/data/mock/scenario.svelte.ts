/** Conjunto de datos con el que arranca el mock. */
export type Dataset =
	/** 48 notas en 5 carpetas, 3 fijadas, etiquetas y 3 en la papelera (el contenido del diseño). */
	| 'normal'
	/** Cuenta nueva: sin notas ni carpetas (vista "primera vez"). */
	| 'first-time'
	/** 2.000 notas, para probar rendimiento y virtualización. */
	| 'large';

/**
 * Simulador de escenarios. Es reactivo ($state) para poder enlazarlo a un panel de desarrollo,
 * y los repositorios mock lo consultan en cada llamada.
 *
 * Cada interruptor existe para poder ver una o más pantallas del diseño sin backend:
 *  - `offline`          → banner "sin conexión"; sincronización y cuentas fallan, las notas se guardan localmente
 *  - `serverError`      → pantalla "error de servidor" (falla la carga de listas y las llamadas remotas)
 *  - `sessionExpired`   → diálogo "sesión expirada" al hacer una llamada remota
 *  - `injectConflict`   → el próximo "sincronizar" deja un conflicto de edición
 *  - `latencyMs` alto   → skeletons de carga
 */
export class Scenario {
	latencyMs = $state(0);
	offline = $state(false);
	serverError = $state(false);
	sessionExpired = $state(false);
	injectConflict = $state(false);
	dataset = $state<Dataset>('normal');

	/** Restablece todos los interruptores (no cambia el dataset). */
	clear() {
		this.latencyMs = 0;
		this.offline = false;
		this.serverError = false;
		this.sessionExpired = false;
		this.injectConflict = false;
	}
}

/** Valores por defecto en desarrollo: una pequeña latencia para que se vean los estados de carga. */
export const DEV_LATENCY_MS = 250;
