/** Secciones de ajustes: `label` para el menú y `title` para la barra superior móvil. */
export const settingsSections = [
	{ href: '/settings/general', label: 'Generales', title: 'Ajustes generales' },
	{ href: '/settings/account', label: 'Mi cuenta', title: 'Mi cuenta' },
	{ href: '/settings/sync', label: 'Sincronización', title: 'Sincronización y dispositivos' },
	{ href: '/settings/privacy', label: 'Privacidad y seguridad', title: 'Privacidad y seguridad' },
	{ href: '/settings/storage', label: 'Almacenamiento', title: 'Almacenamiento y exportación' },
	{ href: '/settings/delete-account', label: 'Eliminar cuenta', title: 'Eliminar cuenta' },
	{ href: '/settings/about', label: 'Acerca de', title: 'Acerca de' }
] as const;
