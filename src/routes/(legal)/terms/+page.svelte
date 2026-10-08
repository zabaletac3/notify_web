<script lang="ts">
	import { LegalDocumentView } from '#lib/components/app/index.js';
	import { terms } from '#lib/legal/terms.js';
</script>

<svelte:head>
	<title>Términos de uso · Apunte</title>
	<meta
		name="description"
		content="Condiciones de uso de Apunte: tu cuenta, el cifrado, tu contenido, el uso aceptable y la responsabilidad."
	/>
</svelte:head>

<LegalDocumentView doc={terms} />
