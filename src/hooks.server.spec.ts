import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { handle, SECURITY_HEADERS } from './hooks.server.js';

const run = async (headers: HeadersInit = {}) =>
	handle({
		event: {} as RequestEvent,
		resolve: async () => new Response('ok', { headers })
	});

describe('cabeceras de seguridad', () => {
	it('se añaden a todas las respuestas', async () => {
		const response = await run();
		for (const [name, value] of Object.entries(SECURITY_HEADERS))
			expect(response.headers.get(name)).toBe(value);
		expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});

	it('no pisan las que ya trae la respuesta de otras partes (como la CSP)', async () => {
		const response = await run({ 'Content-Security-Policy': "default-src 'self'" });
		expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'self'");
	});

	it('no se pide cámara, micrófono ni ubicación', () => {
		expect(SECURITY_HEADERS['Permissions-Policy']).toContain('camera=()');
		expect(SECURITY_HEADERS['Permissions-Policy']).toContain('microphone=()');
		expect(SECURITY_HEADERS['Permissions-Policy']).toContain('geolocation=()');
	});
});
