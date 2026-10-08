import { dev } from '$app/env';
import type { Handle } from '@sveltejs/kit/hooks';

/**
 * Cabeceras de seguridad de todas las respuestas del servidor de la web. (La política de contenido,
 * CSP, la añade SvelteKit desde `vite.config.ts`.) Si la web se sirve como archivos estáticos, el
 * alojamiento debe poner estas mismas cabeceras: ver docs/architecture.md → «Seguridad».
 */
export const SECURITY_HEADERS: Record<string, string> = {
	// Las URLs de enlaces compartidos llevan la clave en el fragmento, pero aun así no se filtra el origen.
	'Referrer-Policy': 'no-referrer',
	'X-Content-Type-Options': 'nosniff',
	// Apunte no usa cámara, micrófono ni ubicación; el portapapeles (copiar enlaces y claves) sí.
	'Permissions-Policy':
		'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
	// Permite ventanas emergentes (el acceso con Google las usará) pero aísla el resto.
	'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
};

/** Solo tiene sentido por HTTPS: en desarrollo (http://localhost) se omite. */
export const HSTS = 'max-age=63072000; includeSubDomains';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
	if (!dev) response.headers.set('Strict-Transport-Security', HSTS);
	return response;
};
