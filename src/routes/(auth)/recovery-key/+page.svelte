<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getApp } from '#lib/app/index.js';
	import { AppIcon, AuthCard, AuthField, RecoveryKeyPanel } from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { errorMessage, validationMessage } from '#lib/core/index.js';

	const { auth } = getApp();

	let password = $state('');
	const next = $derived(page.url.searchParams.get('next') ?? '/onboarding');

	// Esta pantalla es de quien ya tiene sesión.
	$effect(() => {
		if (auth.status === 'anonymous') void goto('/login');
	});

	async function generate(e: SubmitEvent) {
		e.preventDefault();
		const result = await auth.rotateRecoveryKey(password);
		if (result.ok) password = '';
	}

	function done() {
		auth.acknowledgeRecoveryKey();
		void goto(next);
	}
</script>

<svelte:head><title>Clave de recuperación · Apunte</title></svelte:head>

{#if auth.pendingRecoveryKey}
	<AuthCard
		title="Guarda tu clave de recuperación"
		subtitle="Si olvidas tu contraseña, es la única forma de recuperar tus notas. Nadie más la tiene, ni siquiera Apunte."
	>
		{#snippet mark()}
			<span class="grid size-18 place-content-center rounded-full bg-accent text-accent-foreground">
				<AppIcon name="lock" size={30} />
			</span>
		{/snippet}
		<RecoveryKeyPanel
			recoveryKey={auth.pendingRecoveryKey}
			email={auth.user?.email}
			oncontinue={done}
		/>
	</AuthCard>
{:else}
	<AuthCard
		title="Crea una clave de recuperación"
		subtitle="Ya no tenemos tu clave a la vista. Crea una nueva para poder recuperar tus notas si olvidas la contraseña. La anterior dejará de servir."
	>
		{#snippet mark()}
			<span class="grid size-18 place-content-center rounded-full bg-accent text-accent-foreground">
				<AppIcon name="lock" size={30} />
			</span>
		{/snippet}
		<form class="flex flex-col gap-5" onsubmit={generate} novalidate>
			<AuthField
				id="password"
				label="Contraseña"
				type="password"
				autocomplete="current-password"
				bind:value={password}
				error={validationMessage(auth.fieldErrors.password)}
			/>
			{#if auth.error && auth.error.kind !== 'validation'}
				<p
					class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive"
					role="alert"
				>
					{errorMessage(auth.error)}
				</p>
			{/if}
			<Button type="submit" size="lg" disabled={auth.busy}>Crear clave nueva</Button>
			<a
				href={next}
				class="text-center text-label font-semibold text-primary outline-none focus-visible:underline"
			>
				Ahora no
			</a>
		</form>
	</AuthCard>
{/if}
