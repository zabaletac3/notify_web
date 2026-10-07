<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { getApp } from '#lib/app/index.js';
	import { AuthCard, AuthField, StrengthMeter } from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { errorMessage, validationMessage } from '#lib/core/index.js';

	const { auth } = getApp();

	const token = $derived(page.url.searchParams.get('token') ?? '');
	let password = $state('');
	let confirmation = $state('');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const result = await auth.resetPassword(token, password, confirmation);
		if (!result.ok) return;
		toast.success('Contraseña actualizada. Ya puedes iniciar sesión.');
		await goto('/login');
	}
</script>

<svelte:head><title>Nueva contraseña · Apunte</title></svelte:head>

<AuthCard
	title="Crea una nueva contraseña"
	subtitle="Elige una contraseña segura que no uses en otros sitios."
>
	{#if !token}
		<p class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive" role="alert">
			El enlace no es válido o venció. Pide uno nuevo para continuar.
		</p>
		<Button size="lg" href="/forgot-password">Pedir un enlace nuevo</Button>
	{:else}
		<form class="flex flex-col gap-5" onsubmit={submit} novalidate>
			<div class="flex flex-col gap-4">
				<AuthField
					id="password"
					label="Nueva contraseña"
					type="password"
					placeholder="Mínimo 8 caracteres"
					autocomplete="new-password"
					bind:value={password}
					error={validationMessage(auth.fieldErrors.password)}
				>
					<StrengthMeter {password} variant="segments" />
					<p class="text-caption text-muted-foreground">
						Usa letras, números y un símbolo para mayor seguridad.
					</p>
				</AuthField>
				<AuthField
					id="confirmation"
					label="Confirmar contraseña"
					type="password"
					placeholder="Repite la contraseña"
					autocomplete="new-password"
					bind:value={confirmation}
					error={validationMessage(auth.fieldErrors.confirmation)}
				/>
			</div>
			{#if auth.fieldErrors.token}
				<p
					class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive"
					role="alert"
				>
					{validationMessage(auth.fieldErrors.token)}
				</p>
			{:else if auth.error && auth.error.kind !== 'validation'}
				<p
					class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive"
					role="alert"
				>
					{errorMessage(auth.error)}
				</p>
			{/if}
			<Button type="submit" size="lg" disabled={auth.busy}>Guardar contraseña</Button>
		</form>
	{/if}
</AuthCard>
