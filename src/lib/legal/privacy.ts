import { LEGAL_DRAFT, RESPONSIBLE as R } from './meta.js';
import type { LegalDocument } from './types.js';

/**
 * Política de tratamiento de datos personales. BORRADOR: la revisa un abogado antes de publicarse.
 * Lo que afirma sobre los datos sale del esquema de la base (`notify_backend/migrations`) y de la purga
 * (`internal/jobs/purge`); si cambian, hay que actualizar este texto y su versión.
 */
export const privacy: LegalDocument = {
	title: 'Política de privacidad',
	version: 'borrador-1',
	effectiveDate: null,
	status: LEGAL_DRAFT ? 'borrador' : 'vigente',
	intro:
		'Esta política explica qué datos personales trata AxoNote, para qué, por cuánto tiempo y cómo puedes ejercer tus derechos conforme a la Ley 1581 de 2012 y sus normas reglamentarias (Colombia).',
	sections: [
		{
			id: 'responsable',
			title: '1. Responsable del tratamiento',
			blocks: [
				{
					ul: [
						`Razón social: ${R.name}`,
						`NIT: ${R.nit}`,
						`Domicilio: ${R.address}, ${R.city}, ${R.country}`,
						`Correo para consultas, reclamos y solicitudes sobre tus datos: ${R.email}`
					]
				}
			]
		},
		{
			id: 'resumen',
			title: '2. En pocas palabras',
			blocks: [
				{
					ul: [
						'El contenido de tus notas y carpetas se cifra en tu dispositivo antes de salir de él. Nosotros no tenemos la clave y no podemos leerlo.',
						'No recibimos tu contraseña: tu dispositivo envía una prueba derivada de ella que no permite reconstruirla.',
						'Sí tratamos tu correo, tu nombre y algunos datos técnicos (por ejemplo, fechas y dispositivos) para que el servicio funcione y sea seguro.',
						'No vendemos tus datos ni los usamos para publicidad.'
					]
				}
			]
		},
		{
			id: 'datos',
			title: '3. Datos que tratamos',
			blocks: [
				{ p: 'Datos de la cuenta:' },
				{
					ul: [
						'Correo electrónico (en minúsculas) y nombre que indicas al registrarte.',
						'Fecha de creación de la cuenta y de verificación del correo.',
						'Un resumen irreversible (hash) de la prueba de tu contraseña y, si existe, de la prueba de tu clave de recuperación. No guardamos tu contraseña ni tu clave de recuperación.',
						'Los parámetros de derivación de claves y las claves de tu cuenta ya cifradas con tu contraseña. Sin tu contraseña no sirven para leer tus notas.',
						'Tus preferencias (tema, tamaño del texto, orden de las notas, idioma, sincronización y bloqueo de la app).'
					]
				},
				{ p: 'Datos de tus notas y carpetas:' },
				{
					ul: [
						'Identificadores, fechas de creación y modificación, número de revisión, carpeta a la que pertenecen, si están en la papelera y cuándo, y el dispositivo que hizo la última edición.',
						'El título, el texto y demás contenido, siempre cifrado (formato «a1.…»). Nosotros no vemos su contenido, pero sí su tamaño aproximado.',
						'Si compartes una nota con un enlace público: el identificador del enlace y una copia cifrada con una clave propia. Esa clave va en la parte «#» del enlace, que no llega a nuestros servidores.'
					]
				},
				{ p: 'Datos de sesión, dispositivos y seguridad:' },
				{
					ul: [
						'Por cada dispositivo: un nombre, su plataforma (web, escritorio, iOS o Android) y las fechas de alta, último uso y revocación.',
						'Fichas de sesión y códigos de verificación, guardados solo como hash, con su fecha de vencimiento.',
						'Contadores contra abusos (intentos de acceso, reenvíos de códigos, etc.), identificados con una huella criptográfica del correo o de la dirección IP; no almacenamos la IP en claro en la base de datos.',
						'Un registro de eventos sensibles (por ejemplo, cambio de contraseña o eliminación de cuenta) con fecha y una huella de la IP que cambia cada día, sin contenido de tus notas.'
					]
				},
				{
					p: '[[REVISAR: confirmar si los registros técnicos del servidor y de los proveedores de infraestructura (Cloudflare, servidor) conservan direcciones IP y por cuánto tiempo.]]'
				},
				{ p: 'Datos de comunicaciones:' },
				{
					ul: [
						'Te enviamos correos transaccionales: código de verificación, restablecimiento de contraseña, avisos de cambios de seguridad y de eliminación de cuenta. No enviamos publicidad.',
						'Si nos escribes a soporte, tratamos tu mensaje y tu correo para responderte.'
					]
				}
			]
		},
		{
			id: 'cifrado',
			title: '4. Cifrado de extremo a extremo',
			blocks: [
				{
					p: 'Tus notas se cifran en tu dispositivo con una clave que se deriva de tu contraseña. Por eso AXONOTE no puede leer, recuperar ni descifrar el contenido de tus notas, ni siquiera por orden interna o de una autoridad: solo podríamos entregar los datos cifrados y los metadatos descritos arriba.'
				},
				{
					callout:
						'Si pierdes tu contraseña y tu clave de recuperación, nadie podrá recuperar tus notas, tampoco nosotros. Restablecer la contraseña sin la clave de recuperación borra las notas guardadas. Guarda tu clave de recuperación en un lugar seguro.'
				}
			]
		},
		{
			id: 'finalidades',
			title: '5. Para qué usamos tus datos',
			blocks: [
				{
					ul: [
						'Crear y administrar tu cuenta, verificar tu correo y autenticarte.',
						'Guardar y sincronizar tus notas entre tus dispositivos, y aplicar el límite de almacenamiento.',
						'Mostrar y gestionar tus dispositivos y permitirte cerrar sesiones.',
						'Proteger el servicio y tu cuenta frente a abusos y accesos no autorizados.',
						'Enviarte los correos necesarios para operar la cuenta.',
						'Atender tus consultas y reclamos, y cumplir obligaciones legales.'
					]
				},
				{
					p: 'El tratamiento se hace con tu autorización previa, expresa e informada, que otorgas al aceptar los términos y esta política al registrarte. Puedes revocarla eliminando tu cuenta o escribiéndonos, salvo que exista un deber legal o contractual que nos obligue a conservar algún dato.'
				}
			]
		},
		{
			id: 'terceros',
			title: '6. Encargados y terceros',
			blocks: [
				{
					p: 'Para prestar el servicio usamos proveedores que tratan datos por nuestra cuenta (encargados): envío de correo transaccional, red y protección de tráfico, alojamiento del servidor y almacenamiento de copias de seguridad cifradas. No les permitimos usar tus datos para fines propios.'
				},
				{
					p: '[[REVISAR: nombrar a cada proveedor definitivo (p. ej. Resend, Cloudflare, el proveedor del servidor y del almacenamiento de copias), su país y la base legal de la transmisión o transferencia internacional.]]'
				},
				{
					p: 'Algunos proveedores pueden estar fuera de Colombia. Cuando sea así, la transmisión o transferencia internacional se hará conforme al artículo 26 de la Ley 1581 de 2012 y sus normas reglamentarias.'
				},
				{
					p: 'Solo compartiremos datos con autoridades cuando una norma o una orden válida nos lo exija.'
				}
			]
		},
		{
			id: 'conservacion',
			title: '7. Cuánto tiempo conservamos tus datos',
			blocks: [
				{
					ul: [
						'Notas en la papelera: se borran definitivamente a los 30 días.',
						'Cuenta eliminada: tus datos se conservan 30 días por si cambias de opinión y luego se borran.',
						'Registro de elementos borrados (para mantener sincronizados tus dispositivos): 90 días.',
						'Dispositivos revocados: 30 días.',
						'Registro de eventos sensibles: 365 días.',
						'Contadores contra abusos: se limpian automáticamente, normalmente en menos de 48 horas.',
						'Códigos de verificación y fichas de sesión: hasta su vencimiento o uso.',
						'Copias de seguridad: [[REVISAR: indicar el período de retención de las copias]]. Contienen únicamente los datos cifrados y metadatos descritos arriba.'
					]
				}
			]
		},
		{
			id: 'derechos',
			title: '8. Tus derechos',
			blocks: [
				{ p: 'Como titular de los datos tienes derecho a:' },
				{
					ul: [
						'Conocer, actualizar y rectificar tus datos.',
						'Solicitar prueba de la autorización que nos diste.',
						'Ser informado del uso que damos a tus datos.',
						'Presentar quejas ante la Superintendencia de Industria y Comercio (SIC) por infracciones a la ley.',
						'Revocar la autorización y solicitar la supresión de tus datos cuando no se respeten los principios y garantías legales.',
						'Acceder de forma gratuita a tus datos personales.'
					]
				},
				{
					p: 'Dentro de la app puedes cambiar tu nombre y tu correo, cerrar sesión en tus dispositivos y eliminar tu cuenta con tu contraseña (Ajustes → Eliminar cuenta).'
				}
			]
		},
		{
			id: 'consultas',
			title: '9. Consultas y reclamos',
			blocks: [
				{
					p: `Escríbenos a ${R.email} indicando tu nombre, el correo de tu cuenta y qué necesitas. Podemos pedirte verificar tu identidad.`
				},
				{
					ul: [
						'Consultas: las respondemos en máximo 10 días hábiles. Si no es posible, te avisaremos el motivo y la nueva fecha, que no superará 5 días hábiles adicionales.',
						'Reclamos (rectificación, actualización o supresión): los atendemos en máximo 15 días hábiles. Si no es posible, te avisaremos el motivo y la nueva fecha, que no superará 8 días hábiles adicionales.'
					]
				},
				{
					p: 'Antes de acudir a la SIC debes haber agotado este trámite con nosotros.'
				}
			]
		},
		{
			id: 'seguridad',
			title: '10. Seguridad',
			blocks: [
				{
					p: 'Aplicamos medidas técnicas y organizativas razonables: cifrado de extremo a extremo del contenido, derivación de claves con Argon2id, cifrado en tránsito (HTTPS), aislamiento de los datos de cada cuenta en la base de datos, límites de intentos y revocación de sesiones. Ningún sistema es infalible; si ocurre un incidente que afecte tus datos, te informaremos y a la autoridad competente conforme a la ley.'
				}
			]
		},
		{
			id: 'almacenamiento-local',
			title: '11. Almacenamiento en tu dispositivo y cookies',
			blocks: [
				{
					p: 'AxoNote guarda en tu navegador o dispositivo una copia local cifrada de tus notas, tu sesión y tus preferencias (tema, tamaño del texto). Esto es necesario para funcionar sin conexión. No usamos cookies de publicidad ni de seguimiento. [[REVISAR: confirmar que no se añadirá analítica de terceros; si se añade, declararla aquí.]]'
				}
			]
		},
		{
			id: 'menores',
			title: '12. Menores de edad',
			blocks: [
				{
					p: 'AxoNote está dirigido a personas mayores de 18 años. No tratamos conscientemente datos de menores de edad; si detectamos una cuenta de un menor sin autorización de su representante legal, la eliminaremos. [[REVISAR: confirmar la edad mínima.]]'
				}
			]
		},
		{
			id: 'cambios',
			title: '13. Cambios a esta política',
			blocks: [
				{
					p: 'Si cambiamos esta política de forma sustancial te lo avisaremos en la app o por correo antes de que aplique. La versión vigente y su fecha aparecen al inicio de esta página.'
				}
			]
		}
	]
};
