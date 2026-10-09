<script lang="ts">
	import AppIcon from './app-icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';

	type Props = {
		/** Los 10 códigos de respaldo, ya formateados (`XXXXX-XXXXX`). */
		codes: string[];
		/** Se incluye en el archivo descargado. */
		email?: string;
		/** Texto del botón final. */
		continueLabel?: string;
		oncontinue: () => void;
	};

	let { codes, email, continueLabel = 'Continuar', oncontinue }: Props = $props();

	let saved = $state(false);
	let copied = $state(false);

	const asText = () => codes.join('\n');

	async function copy() {
		try {
			await navigator.clipboard.writeText(asText());
			copied = true;
		} catch {
			copied = false;
		}
	}

	function download() {
		const lines = [
			'Códigos de respaldo de AxoNote',
			email ? `Cuenta: ${email}` : '',
			'',
			asText(),
			'',
			'Cada código sirve una sola vez, si pierdes el acceso a tu app de autenticación.',
			'Guárdalos en un lugar seguro y separado de este dispositivo.',
			'Nadie más los tiene, ni siquiera AxoNote.'
		];
		const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = 'axonote-codigos-de-respaldo.txt';
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="flex flex-col gap-5">
	<ul
		class="grid grid-cols-1 gap-2 rounded-xl bg-accent px-4 py-3.5 font-mono text-body font-semibold tracking-wide sm:grid-cols-2"
		aria-label="Códigos de respaldo"
	>
		{#each codes as code (code)}
			<li class="select-all">{code}</li>
		{/each}
	</ul>

	<div class="flex gap-3 *:flex-1">
		<Button type="button" variant="outline" onclick={copy}>
			<AppIcon name={copied ? 'check' : 'copy'} size={16} />
			{copied ? 'Copiados' : 'Copiar'}
		</Button>
		<Button type="button" variant="outline" onclick={download}>
			<AppIcon name="download" size={16} />
			Descargar
		</Button>
	</div>
	<span class="sr-only" role="status" aria-live="polite">{copied ? 'Códigos copiados' : ''}</span>

	<div class="flex items-start gap-2.5">
		<Checkbox id="codes-saved" bind:checked={saved} class="mt-0.5" />
		<label for="codes-saved" class="text-label text-muted-foreground">
			Guardé los códigos en un lugar seguro.
		</label>
	</div>

	<Button type="button" size="lg" disabled={!saved} onclick={oncontinue}>{continueLabel}</Button>
</div>
