<script lang="ts">
	import { LegalDocumentView } from '#lib/components/app/index.js';
	import { privacy } from '#lib/legal/privacy.js';
</script>

<svelte:head>
	<title>Política de privacidad · Apunte</title>
	<meta
		name="description"
		content="Qué datos personales trata Apunte, para qué, cuánto tiempo los conserva y cómo ejercer tus derechos."
	/>
</svelte:head>

<LegalDocumentView doc={privacy} />
