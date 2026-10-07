/**
 * Punto de enganche para simular latencia y fallos en las operaciones locales (lo usa el simulador
 * de escenarios). En producción no se pasa y las operaciones no esperan nada.
 */
export interface DataGate {
	read(): Promise<void>;
	write(): Promise<void>;
}

export const noGate: DataGate = { read: async () => {}, write: async () => {} };

export interface LocalDeps {
	db: import('./apunte-db.js').ApunteDb;
	now: () => Date;
	/** Identificador de este dispositivo (se envía al servidor y queda en `lastEditedDeviceId`). */
	deviceId: string;
	gate?: DataGate;
}
