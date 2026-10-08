<script lang="ts">
	import AppIcon from './app-icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';

	type Props = {
		/** La clave de recuperación ya formateada (grupos de 4 separados por «-»). */
		recoveryKey: string;
		/** Se incluye en el archivo descargado. */
		email?: string;
		/** Texto del botón final. */
		continueLabel?: string;
		oncontinue: () => void;
	};

	let { recoveryKey, email, continueLabel = 'Continuar', oncontinue }: Props = $props();

	let saved = $state(false);
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(recoveryKey);
			copied = true;
		} catch {
			copied = false;
		}
	}

	function download() {
		const lines = [
			'Clave de recuperación de Apunte',
			email ? `Cuenta: ${email}` : '',
			'',
			recoveryKey,
			'',
			'Guarda este archivo en un lugar seguro (no en la nube sin cifrar).',
			'Si olvidas tu contraseña, es la única forma de recuperar tus notas.',
			'Nadie más la tiene, ni siquiera Apunte.'
		];
		const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = 'apunte-clave-de-recuperacion.txt';
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="flex flex-col gap-5">
	<output
		class="block rounded-xl bg-accent px-4 py-3.5 text-center font-mono text-body leading-7 font-semibold tracking-wide break-all select-all"
		aria-label="Clave de recuperación"
	>
		{recoveryKey}
	</output>

	<div class="flex gap-3 *:flex-1">
		<Button type="button" variant="outline" onclick={copy}>
			<AppIcon name={copied ? 'check' : 'copy'} size={16} />
			{copied ? 'Copiada' : 'Copiar'}
		</Button>
		<Button type="button" variant="outline" onclick={download}>
			<AppIcon name="download" size={16} />
			Descargar
		</Button>
	</div>
	<span class="sr-only" role="status" aria-live="polite">{copied ? 'Clave copiada' : ''}</span>

	<div class="flex items-start gap-2.5">
		<Checkbox id="recovery-saved" bind:checked={saved} class="mt-0.5" />
		<label for="recovery-saved" class="text-label text-muted-foreground">
			La guardé en un lugar seguro.
		</label>
	</div>

	<Button type="button" size="lg" disabled={!saved} onclick={oncontinue}>{continueLabel}</Button>
</div>
