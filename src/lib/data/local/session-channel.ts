/** Avisos entre pestañas de la misma app (mismo navegador). */
export type SessionMessage = { type: 'signed-out'; userId: string | null };

export interface SessionChannel {
	post(message: SessionMessage): void;
	close(): void;
}

const CHANNEL_NAME = 'apunte-session';

/**
 * Canal para que, al cerrar sesión en una pestaña, las demás descarten lo que tienen en memoria.
 * Sin `BroadcastChannel` (entornos sin navegador) no hace nada.
 */
export function createSessionChannel(onMessage: (message: SessionMessage) => void): SessionChannel {
	if (typeof BroadcastChannel === 'undefined') return { post() {}, close() {} };
	const channel = new BroadcastChannel(CHANNEL_NAME);
	channel.onmessage = (event: MessageEvent<SessionMessage>) => onMessage(event.data);
	return {
		post: (message) => channel.postMessage(message),
		close: () => channel.close()
	};
}
