<script lang="ts">
	import { icons, type IconName } from './icons.js';

	type Props = {
		name: IconName;
		/** Tamaño en px. Por defecto 20 (el de los botones y filas). */
		size?: number;
		class?: string;
		/** Si el icono transmite significado por sí solo, pasa una etiqueta accesible. */
		label?: string;
	};

	let { name, size = 20, class: className, label }: Props = $props();

	const Icon = $derived(icons[name]);
</script>

<Icon
	{size}
	strokeWidth={1.75}
	class={className}
	aria-hidden={label ? undefined : 'true'}
	aria-label={label}
	role={label ? 'img' : undefined}
/>
