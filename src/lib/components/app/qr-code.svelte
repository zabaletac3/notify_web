<script lang="ts">
	import { renderSVG } from 'uqr';

	type Props = {
		/** Texto que se codifica (la URI `otpauth://`). */
		value: string;
		/** Tamaño en píxeles del lado del QR. */
		size?: number;
		alt?: string;
	};

	let { value, size = 220, alt = 'Código QR para configurar el autenticador' }: Props = $props();

	// El QR se genera en el cliente como SVG y se incrusta como imagen `data:`. Nunca se envía el
	// secreto a ningún servicio ni se carga una imagen remota (lo impediría la CSP).
	const src = $derived(
		`data:image/svg+xml;charset=utf-8,${encodeURIComponent(
			renderSVG(value, { border: 2, pixelSize: 8 })
		)}`
	);
</script>

<img {src} {alt} width={size} height={size} class="rounded-lg" />
