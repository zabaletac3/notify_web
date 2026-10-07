<script lang="ts">
	import { goto } from '$app/navigation';
	import { getApp } from '#lib/app/index.js';
	import { AppIcon, AuthCard } from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as InputOTP from '#lib/components/ui/input-otp/index.js';
	import { errorMessage, validationMessage } from '#lib/core/index.js';
	import { VERIFICATION_CODE_LENGTH } from '#lib/domain/index.js';

	const { auth } = getApp();

	let code = $state('');
	let remaining = $state(auth.resendRemaining());

	// Cuenta atrás para poder reenviar el código.
	$effect(() => {
		const timer = setInterval(() => (remaining = auth.resendRemaining()), 1000);
		return () => clearInterval(timer);
	});

	const clock = $derived(
		`${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
	);

	async function verify() {
		const result = await auth.verify(code);
		if (result.ok) await goto('/onboarding');
	}

	async function resend() {
		await auth.resendCode();
		remaining = auth.resendRemaining();
	}
</script>

<svelte:head><title>Verifica tu correo · Apunte</title></svelte:head>

<AuthCard
	title="Verifica tu correo"
	subtitle={auth.pendingEmail
		? `Enviamos un código de ${VERIFICATION_CODE_LENGTH} dígitos a ${auth.pendingEmail}. Ingrésalo para continuar.`
		: 'Primero crea tu cuenta para recibir un código.'}
>
	{#snippet mark()}
		<span class="grid size-18 place-content-center rounded-full bg-accent text-accent-foreground">
			<AppIcon name="mail" size={30} />
		</span>
	{/snippet}

	<form
		class="flex flex-col gap-5"
		onsubmit={(e) => {
			e.preventDefault();
			void verify();
		}}
	>
		<InputOTP.Root
			maxlength={VERIFICATION_CODE_LENGTH}
			bind:value={code}
			onComplete={verify}
			aria-label="Código de verificación"
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
		{:else if auth.error && auth.error.kind !== 'validation'}
			<p
				class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive"
				role="alert"
			>
				{errorMessage(auth.error)}
			</p>
		{/if}

		<p class="flex gap-1 text-sm">
			<span class="text-muted-foreground">¿No llegó?</span>
			{#if remaining > 0}
				<span class="font-medium text-tertiary">Reenviar código en {clock}</span>
			{:else}
				<button type="button" class="font-semibold text-primary" onclick={resend}>
					Reenviar código
				</button>
			{/if}
		</p>

		<Button type="submit" size="lg" disabled={auth.busy || !auth.pendingEmail}>Verificar</Button>
		<a href="/register" class="text-center text-sm font-semibold text-primary">Cambiar correo</a>
	</form>
</AuthCard>
