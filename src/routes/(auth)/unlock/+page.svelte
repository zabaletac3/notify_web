<script lang="ts">
	import { goto } from '$app/navigation';
	import { getApp } from '#lib/app/index.js';
	import { AppIcon, AuthCard, AuthField } from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { errorMessage, validationMessage } from '#lib/core/index.js';
	import { MAX_UNLOCK_ATTEMPTS } from '#lib/features/auth/index.js';

	const { auth } = getApp();

	let password = $state('');

	// Sin sesión no hay nada que desbloquear; ya desbloqueada, a las notas.
	$effect(() => {
		if (auth.status === 'anonymous') void goto('/login');
		else if (auth.isAuthenticated && !auth.isLocked) void goto('/notes');
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const result = await auth.unlock(password);
		if (result.ok) password = '';
	}

	async function logout() {
		const result = await auth.logout();
		if (result.ok) await goto('/welcome');
	}

	const remaining = $derived(MAX_UNLOCK_ATTEMPTS - auth.unlockFailures);
</script>

<svelte:head><title>Desbloquear · AxoNote</title></svelte:head>

<AuthCard
	title="Desbloquea AxoNote"
	subtitle={auth.user
		? `Ingresa tu contraseña para leer tus notas, ${auth.user.fullName}.`
		: 'Ingresa tu contraseña para leer tus notas.'}
>
	{#snippet mark()}
		<span class="grid size-18 place-content-center rounded-full bg-accent text-accent-foreground">
			<AppIcon name="lock" size={30} />
		</span>
	{/snippet}

	<form class="flex flex-col gap-5" onsubmit={submit} novalidate>
		<AuthField
			id="password"
			label="Contraseña"
			type="password"
			placeholder="Tu contraseña"
			autocomplete="current-password"
			bind:value={password}
			error={validationMessage(auth.fieldErrors.password)}
		>
			{#if auth.unlockFailures > 0}
				<p class="text-caption text-muted-foreground">
					{remaining === 1 ? 'Te queda 1 intento.' : `Te quedan ${remaining} intentos.`}
				</p>
			{/if}
		</AuthField>

		{#if auth.error && auth.error.kind !== 'validation'}
			<p
				class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive"
				role="alert"
			>
				{errorMessage(auth.error)}
			</p>
		{/if}

		<Button type="submit" size="lg" disabled={auth.busy}>
			{auth.busy ? 'Desbloqueando…' : 'Desbloquear'}
		</Button>
		<button
			type="button"
			onclick={logout}
			class="text-center text-label font-semibold text-primary outline-none focus-visible:underline"
		>
			Cerrar sesión
		</button>
	</form>
</AuthCard>
