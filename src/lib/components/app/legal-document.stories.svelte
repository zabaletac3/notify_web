<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import LegalDocumentView from './legal-document.svelte';
	import { terms } from '#lib/legal/terms.js';
	import type { LegalDocument } from '#lib/legal/types.js';

	const vigente: LegalDocument = {
		...terms,
		status: 'vigente',
		version: '1.0',
		effectiveDate: '2026-01-01'
	};

	const { Story } = defineMeta({
		title: 'App/LegalDocumentView',
		component: LegalDocumentView,
		tags: ['autodocs'],
		args: { doc: terms }
	});
</script>

<Story name="Borrador (Términos de uso)" />

<Story name="Vigente" args={{ doc: vigente }}>
	{#snippet template(args)}
		<LegalDocumentView {...args} />
	{/snippet}
</Story>
