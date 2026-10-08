import { LEGAL_DRAFT, RESPONSIBLE as R } from './meta.js';
import type { LegalDocument } from './types.js';

/** Términos de uso. BORRADOR: los revisa un abogado antes de publicarse. */
export const terms: LegalDocument = {
	title: 'Términos de uso',
	version: 'borrador-1',
	effectiveDate: null,
	status: LEGAL_DRAFT ? 'borrador' : 'vigente',
	intro: `Estos términos regulan el uso de Apunte, un servicio de notas con cifrado de extremo a extremo ofrecido por ${R.name} (NIT ${R.nit}), de ${R.city}, ${R.country}. Al crear una cuenta o usar Apunte aceptas estos términos y la Política de privacidad.`,
	sections: [
		{
			id: 'servicio',
			title: '1. El servicio',
			blocks: [
				{
					p: 'Apunte te permite escribir notas en Markdown, organizarlas en carpetas, buscarlas, sincronizarlas entre tus dispositivos, compartirlas mediante enlaces públicos de solo lectura y recuperarlas desde la papelera. Funciona sin conexión y sincroniza cuando hay red.'
				}
			]
		},
		{
			id: 'cuenta',
			title: '2. Tu cuenta',
			blocks: [
				{
					ul: [
						'Debes ser mayor de 18 años y darnos un correo que controles y datos veraces.',
						'Eres responsable de mantener segura tu contraseña, tu clave de recuperación y tus dispositivos, y de lo que ocurra con tu cuenta.',
						'Avísanos de inmediato si crees que alguien accedió a tu cuenta. Puedes cerrar sesiones desde Ajustes → Dispositivos.',
						'Una persona puede tener una cuenta; no puedes cederla ni venderla.'
					]
				}
			]
		},
		{
			id: 'no-recuperacion',
			title: '3. Cifrado y pérdida de la contraseña',
			blocks: [
				{
					p: 'Tus notas se cifran en tu dispositivo con una clave derivada de tu contraseña. AXONOTE no tiene esa clave.'
				},
				{
					callout:
						'Si pierdes tu contraseña y tu clave de recuperación, no podremos recuperar tus notas ni restablecer el acceso a ellas. Restablecer la contraseña sin la clave de recuperación elimina las notas guardadas en el servidor. Aceptas este riesgo al usar el servicio.'
				}
			]
		},
		{
			id: 'contenido',
			title: '4. Tu contenido',
			blocks: [
				{
					ul: [
						'Tus notas son tuyas. No adquirimos ningún derecho sobre ellas más allá de almacenarlas y sincronizarlas para prestarte el servicio.',
						'Como no podemos ver su contenido, tú eres el único responsable de lo que escribes y compartes.',
						'Cuando creas un enlace público, cualquiera que tenga el enlace completo puede leer esa nota. Puedes desactivar el enlace en cualquier momento; copias que otras personas ya hayan guardado no podemos retirarlas.'
					]
				}
			]
		},
		{
			id: 'uso-aceptable',
			title: '5. Uso aceptable',
			blocks: [
				{ p: 'No puedes usar Apunte para:' },
				{
					ul: [
						'Actividades ilegales o que vulneren derechos de terceros, incluido compartir contenido ilícito mediante enlaces públicos.',
						'Intentar acceder a cuentas o datos ajenos, eludir los límites o medidas de seguridad, o sobrecargar el servicio.',
						'Automatizar el registro de cuentas o abusar de los envíos de correo.',
						'Hacer ingeniería inversa del servicio salvo lo que la ley permita.'
					]
				},
				{
					p: 'Si incumples estos términos podemos limitar o suspender la cuenta. Dado que no vemos el contenido cifrado, actuaremos sobre los enlaces públicos y los datos de uso que sí conocemos.'
				}
			]
		},
		{
			id: 'almacenamiento',
			title: '6. Almacenamiento y límites',
			blocks: [
				{
					p: 'Cada cuenta tiene un límite de almacenamiento, visible en Ajustes → Almacenamiento. Al alcanzarlo no podrás subir cambios nuevos hasta liberar espacio. Las notas en la papelera se eliminan definitivamente a los 30 días.'
				}
			]
		},
		{
			id: 'disponibilidad',
			title: '7. Disponibilidad y cambios',
			blocks: [
				{
					p: 'Hacemos lo razonable por mantener el servicio disponible, pero puede haber interrupciones por mantenimiento o fallos. Puedes seguir usando tu copia local sin conexión. Podemos mejorar, cambiar o retirar funciones; si retiramos el servicio te avisaremos con antelación razonable para que exportes tus notas.'
				}
			]
		},
		{
			id: 'eliminacion',
			title: '8. Eliminar tu cuenta',
			blocks: [
				{
					p: 'Puedes eliminar tu cuenta en Ajustes → Eliminar cuenta, confirmando con tu contraseña. Se cerrarán todas tus sesiones y tus datos se conservarán 30 días por si cambias de opinión; después se borran definitivamente.'
				}
			]
		},
		{
			id: 'responsabilidad',
			title: '9. Responsabilidad',
			blocks: [
				{
					p: 'El servicio se ofrece «tal cual», sin garantías que la ley no obligue a dar. En la medida permitida por la ley, AXONOTE no responde por pérdidas indirectas ni por la pérdida de notas causada por olvidar la contraseña y la clave de recuperación, por fallos de tus dispositivos o por el uso indebido de tus credenciales. [[REVISAR: límites de responsabilidad conforme al Estatuto del Consumidor (Ley 1480 de 2011) y demás normas aplicables.]]'
				}
			]
		},
		{
			id: 'datos-personales',
			title: '10. Datos personales',
			blocks: [
				{
					p: 'El tratamiento de tus datos personales se rige por la Política de privacidad, que forma parte de estos términos.'
				}
			]
		},
		{
			id: 'cambios',
			title: '11. Cambios a los términos',
			blocks: [
				{
					p: 'Podemos actualizar estos términos. Si el cambio es sustancial te avisaremos en la app o por correo antes de que aplique; si sigues usando Apunte después, se entiende que lo aceptas. La versión vigente y su fecha aparecen al inicio de esta página.'
				}
			]
		},
		{
			id: 'ley',
			title: '12. Ley aplicable y jurisdicción',
			blocks: [
				{
					p: `Estos términos se rigen por las leyes de la República de Colombia. Las controversias se someterán a los jueces competentes de ${R.city}, sin perjuicio de los derechos que la ley otorgue a los consumidores. [[REVISAR]]`
				}
			]
		},
		{
			id: 'contacto',
			title: '13. Contacto',
			blocks: [{ p: `Para dudas sobre estos términos escribe a ${R.email}.` }]
		}
	]
};
