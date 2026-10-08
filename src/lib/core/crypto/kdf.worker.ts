import { argon2id } from 'hash-wasm';

/** Argon2id en un hilo aparte para no bloquear la interfaz mientras deriva (~1 s). */
self.onmessage = async (
	event: MessageEvent<{
		password: Uint8Array;
		salt: Uint8Array;
		memoryKiB: number;
		iterations: number;
		parallelism: number;
	}>
) => {
	const { password, salt, memoryKiB, iterations, parallelism } = event.data;
	const hash = await argon2id({
		password,
		salt,
		memorySize: memoryKiB,
		iterations,
		parallelism,
		hashLength: 32,
		outputType: 'binary'
	});
	self.postMessage(hash);
};
