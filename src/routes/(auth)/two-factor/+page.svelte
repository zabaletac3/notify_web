<script lang="ts">
	import { goto } from '$app/navigation';
	import { getApp } from '#lib/app/index.js';
	import { AppIcon, AuthCard, AuthField } from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as InputOTP from '#lib/components/ui/input-otp/index.js';
	import { errorMessage, validationMessage } from '#lib/core/index.js';
	import { MFA_CODE_LENGTH } from '#lib/domain/index.js';

	const { auth } = getApp();

	let code = $state('');
	let useRecovery = $state(false);
	// Evita que el efecto de guardia saque de la pantalla mientras se navega tras acertar.
	let leaving = $state(false);

	// Sin un login a medias no hay nada que verificar.
	$effect(() => {
		if (!auth.mfaPending && !leaving) void goto('/login');
	});

	async function verify() {
		const result = await auth.verifyMfa(code);
		if (!result.ok) {
			// El ticket venció o se agotó: hay que volver a iniciar sesión.
			if (auth.notice === 'mfa-expired' && !auth.mfaPending) {
				leaving = true;
				await goto('/login');
			}
			return;
		}
		leaving = true;
		await goto(auth.pendingRecoveryKey ? '/recovery-key?next=/notes' : '/notes');
	}

	function switchToRecovery() {
		useRecovery = true;
		code = '';
		auth.clearErrors();
	}

	function switchToTotp() {
		useRecovery = false;
		code = '';
		auth.clearErrors();
	}
</script>

<svelte:head><title>Verificación en dos pasos · AxoNote</title></svelte:head>

<AuthCard
	title="Verificación en dos pasos"
	subtitle="Ingresa el código de tu app de autenticación para terminar de iniciar sesión."
>
	{#snippet mark()}
		<span class="grid size-18 place-content-center rounded-full bg-accent text-accent-foreground">
			<AppIcon name="lock" size={30} />
		</span>
	{/snippet}

	<form
		class="flex flex-col gap-5"
		onsubmit={(e) => {
			e.preventDefault();
			void verify();
		}}
	>
		{#if useRecovery}
			<AuthField
				id="recovery-code"
				label="Código de respaldo"
				placeholder="XXXXX-XXXXX"
				autocomplete="one-time-code"
				autocapitalize="characters"
				spellcheck={false}
				bind:value={code}
				error={validationMessage(auth.fieldErrors.code)}
			/>
		{:else}
			<InputOTP.Root
				maxlength={MFA_CODE_LENGTH}
				bind:value={code}
				onComplete={verify}
				aria-label="Código de verificación en dos pasos"
			>
				{#snippet children({ cells })}
					{#each cells as cell, i (i)}
						<InputOTP.Slot {cell} aria-invalid={auth.fieldErrors.code ? true : undefined} />
					{/each}
				{/snippet}
			</InputOTP.Root>
			{#if auth.fieldErrors.code}
				<p class="text-caption text-destructive" role="alert">
					{validationMessage(auth.fieldErrors.code)}
				</p>
			{/if}
		{/if}

		{#if useRecovery && auth.fieldErrors.code}
			<p class="text-caption text-destructive" role="alert">
				{validationMessage(auth.fieldErrors.code)}
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

		<Button type="submit" size="lg" disabled={auth.busy || !code}>
			{auth.busy ? 'Verificando…' : 'Verificar'}
		</Button>

		{#if useRecovery}
			<button
				type="button"
				class="text-center text-label font-semibold text-primary outline-none focus-visible:underline"
				onclick={switchToTotp}
			>
				Usar la app de autenticación
			</button>
		{:else}
			<button
				type="button"
				class="text-center text-label font-semibold text-primary outline-none focus-visible:underline"
				onclick={switchToRecovery}
			>
				Usar un código de respaldo
			</button>
		{/if}
	</form>

	{#snippet footer()}
		<a
			href="/login"
			class="font-semibold text-primary outline-none focus-visible:underline"
			onclick={() => auth.logout()}
		>
			Volver a iniciar sesión
		</a>
	{/snippet}
</AuthCard>
