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
	/** Cifra y descifra las filas (usa la clave de la sesión). */
	codec: import('./local-codec.js').LocalCodec;
	lock: Mutex;
	now: () => Date;
	/** Identificador de este dispositivo (se envía al servidor y queda en `lastEditedDeviceId`). */
	deviceId: string;
	gate?: DataGate;
}

/**
 * Cola para que las escrituras locales (y aplicar lo que llega del servidor) no se pisen entre sí.
 * Cifrar es asíncrono y no puede ir dentro de una transacción de IndexedDB, así que cada operación
 * lee, cifra y escribe de principio a fin antes de que empiece la siguiente.
 */
export class Mutex {
	private tail: Promise<unknown> = Promise.resolve();

	run<T>(task: () => Promise<T>): Promise<T> {
		const result = this.tail.then(() => task());
		this.tail = result.catch(() => {});
		return result;
	}
}
