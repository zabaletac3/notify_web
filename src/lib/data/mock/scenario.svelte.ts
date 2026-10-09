/** Conjunto de datos con el que arranca el mock. */
export type Dataset =
	/** 48 notas en 5 carpetas, 3 fijadas, etiquetas y 3 en la papelera (el contenido del diseño). */
	| 'normal'
	/** Cuenta nueva: sin notas ni carpetas (vista "primera vez"). */
	| 'first-time'
	/** 2.000 notas, para probar rendimiento y virtualización. */
	| 'large';

/**
 * Qué identidad devuelve Google en el simulador (se elige en `/dev/simulator`). Reproduce las cuatro
 * respuestas de `POST /auth/google/exchange` sin salir de la web.
 */
export type GoogleScenario =
	/** El acceso con Google está apagado. */
	| 'off'
	/** Cuenta nueva: hay que crear la contraseña de AxoNote. */
	| 'new'
	/** Ya existe una cuenta con ese correo: hay que escribir la contraseña para vincularla. */
	| 'unlinked'
	/** Cuenta ya vinculada: entra con la sesión bloqueada. */
	| 'linked'
	/** Cuenta vinculada con verificación en dos pasos: Google → código. */
	| 'with-mfa';

const GOOGLE_SCENARIOS: readonly GoogleScenario[] = [
	'off',
	'new',
	'unlinked',
	'linked',
	'with-mfa'
];

export function isGoogleScenario(value: unknown): value is GoogleScenario {
	return typeof value === 'string' && (GOOGLE_SCENARIOS as readonly string[]).includes(value);
}

/**
 * Permite fijar el escenario de Google desde el almacenamiento local (solo para las pruebas e2e, que
 * corren contra el build de producción sin acceso a `/dev/simulator`). En la app normal no hay clave.
 */
function storedGoogleScenario(): GoogleScenario | null {
	try {
		if (typeof localStorage === 'undefined') return null;
		const value = localStorage.getItem('apunte-google-scenario');
		return isGoogleScenario(value) ? value : null;
	} catch {
		return null;
	}
}

/**
 * Simulador de escenarios. Es reactivo ($state) para poder enlazarlo a un panel de desarrollo,
 * y los repositorios mock lo consultan en cada llamada.
 *
 * Cada interruptor existe para poder ver una o más pantallas del diseño sin backend:
 *  - `offline`          → banner "sin conexión"; sincronización y cuentas fallan, las notas se guardan localmente
 *  - `serverError`      → pantalla "error de servidor" (falla la carga de listas y las llamadas remotas)
 *  - `sessionExpired`   → diálogo "sesión expirada" al hacer una llamada remota
 *  - `deviceRevoked`    → este dispositivo fue eliminado desde otro: se cierra la sesión y se borra la copia local
 *  - `injectConflict`   → el próximo "sincronizar" deja un conflicto de edición
 *  - `mfaEnabled`       → la cuenta de ejemplo tiene activada la verificación en dos pasos (login en dos pasos)
 *  - `latencyMs` alto   → skeletons de carga
 */
export class Scenario {
	latencyMs = $state(0);
	offline = $state(false);
	serverError = $state(false);
	sessionExpired = $state(false);
	deviceRevoked = $state(false);
	injectConflict = $state(false);
	mfaEnabled = $state(false);
	/** Identidad que devuelve el Google simulado (ver `GoogleScenario`). */
	googleScenario = $state<GoogleScenario>('off');
	dataset = $state<Dataset>('normal');

	constructor() {
		this.googleScenario = storedGoogleScenario() ?? 'off';
	}

	/** Restablece todos los interruptores (no cambia el dataset). */
	clear() {
		this.latencyMs = 0;
		this.offline = false;
		this.serverError = false;
		this.sessionExpired = false;
		this.deviceRevoked = false;
		this.injectConflict = false;
		this.mfaEnabled = false;
		this.googleScenario = 'off';
	}
}

/** Valores por defecto en desarrollo: una pequeña latencia para que se vean los estados de carga. */
export const DEV_LATENCY_MS = 250;
