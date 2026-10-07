import type { AppError, ValidationCode } from '#lib/domain/index.js';

/**
 * Textos de interfaz en español para códigos de validación y errores.
 * Punto único para traducir después (la lógica trabaja con códigos, no con frases).
 */
export const validationMessages: Record<ValidationCode, string> = {
	required: 'Este campo es obligatorio.',
	'invalid-email': 'Ingresa un correo válido.',
	'password-too-short': 'Usa al menos 8 caracteres.',
	'passwords-dont-match': 'Las contraseñas no coinciden.',
	'terms-required': 'Debes aceptar los términos para continuar.',
	'name-too-short': 'Escribe tu nombre.',
	'name-too-long': 'El nombre es demasiado largo (máximo 30 caracteres).',
	'name-taken': 'Ya existe una carpeta con ese nombre.',
	'invalid-code': 'El código debe tener 6 dígitos.',
	'invalid-token': 'El enlace no es válido o ya venció.',
	'email-taken': 'Ya existe una cuenta con ese correo.',
	'wrong-password': 'La contraseña actual no es correcta.',
	'same-password': 'La nueva contraseña debe ser distinta de la actual.'
};

export function validationMessage(code: string | undefined): string | undefined {
	return code ? (validationMessages[code as ValidationCode] ?? code) : undefined;
}

/** Mensaje corto para mostrar en un aviso (toast) según el error. */
export function errorMessage(error: AppError): string {
	switch (error.kind) {
		case 'network':
			return 'Sin conexión. Tus cambios se guardarán y se sincronizarán al volver.';
		case 'server':
			return 'No pudimos conectar con el servidor. Inténtalo de nuevo en unos minutos.';
		case 'unauthorized':
			return 'Correo o contraseña incorrectos.';
		case 'forbidden':
			return error.code === 'email-not-verified'
				? 'Verifica tu correo para poder iniciar sesión.'
				: 'No tienes permiso para hacer esto.';
		case 'session-expired':
			return 'Tu sesión expiró. Inicia sesión de nuevo.';
		case 'device-revoked':
			return 'Se cerró la sesión en este dispositivo.';
		case 'not-found':
			return 'No encontramos lo que buscabas.';
		case 'validation':
			return 'Revisa los datos ingresados.';
		case 'conflict':
			return 'Esta nota se editó en otro dispositivo.';
		case 'rate-limited':
			return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
		default:
			return 'Algo salió mal. Inténtalo de nuevo.';
	}
}
