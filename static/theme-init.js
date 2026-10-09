// Pone la clase del tema (claro u oscuro) antes de que la página se pinte, para que no haya un
// parpadeo (también el tamaño del texto). Usa las mismas claves de almacenamiento que `mode-watcher`; el resto lo hace él al cargar.
(function () {
	try {
		var mode = localStorage.getItem('mode-watcher-mode') || 'system';
		var light =
			mode === 'light' ||
			(mode === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
		var root = document.documentElement;
		root.classList[light ? 'remove' : 'add']('dark');
		root.style.colorScheme = light ? 'light' : 'dark';
		var size = localStorage.getItem('apunte-text-size');
		if (size === 'small' || size === 'large') root.dataset.textSize = size;
		// Barra lateral recogida (solo pantallas grandes): evita que se pinte abierta al recargar.
		if (
			localStorage.getItem('axonote-sidebar-collapsed') === '1' &&
			window.matchMedia('(min-width: 1024px)').matches
		)
			root.dataset.sidebar = 'collapsed';
	} catch {
		// Sin almacenamiento disponible: queda el tema por defecto.
	}
})();
