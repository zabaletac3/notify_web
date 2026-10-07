<script lang="ts">
	import { goto } from '$app/navigation';
	import { viewport } from '#lib/components/app/index.js';

	// /settings no tiene contenido propio: lleva a Generales (≥ 768 px) o al menú de secciones (móvil).
	$effect(() => {
		void goto(viewport.split.current ? '/settings/general' : '/settings/menu', {
			replaceState: true
		});
	});
</script>
