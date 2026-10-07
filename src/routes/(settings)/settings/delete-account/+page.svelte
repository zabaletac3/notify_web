<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { getApp } from '#lib/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	const { auth } = getApp();

	const CONFIRM_WORD = 'ELIMINAR';
	let typed = $state('');
	const confirmed = $derived(typed.trim() === CONFIRM_WORD);

	async function remove() {
		const result = await auth.deleteAccount();
		if (result.ok) await goto('/');
		else toast.error('No se pudo eliminar la cuenta');
	}
</script>

<svelte:head><title>Eliminar cuenta · Apunte</title></svelte:head>

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

<div class="flex flex-col gap-1.5">
	<label for="confirm" class="text-label font-medium">Escribe {CONFIRM_WORD} para confirmar</label>
	<Input id="confirm" bind:value={typed} placeholder={CONFIRM_WORD} autocomplete="off" />
</div>

<div class="flex flex-col gap-3">
	<Button variant="destructive" size="lg" disabled={!confirmed || auth.busy} onclick={remove}>
		Eliminar mi cuenta
	</Button>
	<Button variant="outline" size="lg" onclick={() => goto('/settings')}>Cancelar</Button>
</div>
