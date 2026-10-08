<script lang="ts">
	import { goto } from '$app/navigation';
	import { getApp } from '#lib/app/index.js';
	import { AuthCard, AuthField, GoogleButton } from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { errorMessage, validationMessage } from '#lib/core/index.js';

	const { auth } = getApp();

	let email = $state('');
	let password = $state('');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const result = await auth.login({ email, password });
		if (result.ok)
			return void goto(auth.pendingRecoveryKey ? '/recovery-key?next=/notes' : '/notes');
		if (result.error.kind === 'forbidden' && result.error.code === 'email-not-verified')
			await goto('/verify');
	}
</script>

<svelte:head><title>Iniciar sesión · Apunte</title></svelte:head>

<AuthCard title="Bienvenido de vuelta">
	<GoogleButton label="Continuar con Google" />

	<div class="flex items-center gap-3 text-micro font-semibold text-tertiary" aria-hidden="true">
		<span class="h-px flex-1 bg-border"></span>O<span class="h-px flex-1 bg-border"></span>
	</div>

	<form class="flex flex-col gap-5" onsubmit={submit} novalidate>
		<div class="flex flex-col gap-3.5">
			<AuthField
				id="email"
				label="Correo electrónico"
				type="email"
				placeholder="nombre@correo.com"
				autocomplete="email"
				bind:value={email}
				error={validationMessage(auth.fieldErrors.email)}
			/>
			<AuthField
				id="password"
				label="Contraseña"
				type="password"
				placeholder="Tu contraseña"
				autocomplete="current-password"
				bind:value={password}
				error={validationMessage(auth.fieldErrors.password)}
			/>
		</div>

		{#if auth.notice}
			<p class="rounded-xl bg-accent px-3.5 py-3 text-label text-foreground" role="status">
				{auth.notice === 'device-revoked'
					? errorMessage({ kind: 'device-revoked' })
					: 'Cerraste sesión en otra pestaña.'}
			</p>
		{/if}

		{#if auth.error && auth.error.kind !== 'validation'}
			<p
				class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive"
				role="alert"
			>
				{errorMessage(auth.error)}
			</p>
		{/if}

		<Button type="submit" size="lg" disabled={auth.busy}>
			{auth.busy ? 'Desbloqueando…' : 'Iniciar sesión'}
		</Button>
		<a
			href="/forgot-password"
			class="text-center text-label font-semibold text-primary outline-none focus-visible:underline"
		>
			¿Olvidaste tu contraseña?
		</a>
	</form>

	{#snippet footer()}
		¿Eres nuevo?
		<a href="/register" class="font-semibold text-primary outline-none focus-visible:underline">
			Crea una cuenta
		</a>
	{/snippet}
</AuthCard>
