<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { getApp } from '#lib/app/index.js';
	import { AuthField } from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { errorMessage, validationMessage } from '#lib/core/index.js';

	const { auth } = getApp();

	let password = $state('');

	async function remove() {
		const result = await auth.deleteAccount(password);
		if (result.ok) await goto('/');
		else if (auth.error && auth.error.kind !== 'validation')
			toast.error(
				auth.error.kind === 'rate-limited'
					? errorMessage(auth.error)
					: 'No se pudo eliminar la cuenta'
			);
	}
</script>

<svelte:head><title>Eliminar cuenta · AxoNote</title></svelte:head>

<h1 class="text-page font-bold max-md:sr-only">Eliminar cuenta</h1>

<section
	class="flex flex-col gap-2.5 rounded-[14px] border border-destructive bg-destructive-soft p-4"
	role="alert"
>
	<p class="text-body font-semibold text-destructive">Esta acción no se puede deshacer</p>
	<ul class="flex flex-col text-sm leading-[22px]">
		<li>• Se borrarán todas tus notas y carpetas.</li>
		<li>• Se cerrará tu sesión en todos los dispositivos.</li>
		<li>• No podremos recuperar tus datos después de 30 días.</li>
	</ul>
</section>

<AuthField
	id="password"
	label="Escribe tu contraseña para confirmar"
	type="password"
	autocomplete="current-password"
	bind:value={password}
	error={validationMessage(auth.fieldErrors.password)}
/>

<div class="flex flex-col gap-3">
	<Button variant="destructive" size="lg" disabled={!password || auth.busy} onclick={remove}>
		{auth.busy ? 'Eliminando…' : 'Eliminar mi cuenta'}
	</Button>
	<Button variant="outline" size="lg" onclick={() => goto('/settings')}>Cancelar</Button>
</div>
