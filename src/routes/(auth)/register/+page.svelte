<script lang="ts">
	import { goto } from '$app/navigation';
	import { getApp } from '#lib/app/index.js';
	import { AuthCard, AuthField, GoogleButton, StrengthMeter } from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { errorMessage, validationMessage } from '#lib/core/index.js';

	const { auth } = getApp();

	let fullName = $state('');
	let email = $state('');
	let password = $state('');
	let acceptedTerms = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const result = await auth.register({ fullName, email, password, acceptedTerms });
		if (result.ok) await goto('/verify');
	}
</script>

<svelte:head><title>Crear cuenta · AxoNote</title></svelte:head>

<AuthCard
	title="Crea tu cuenta"
	subtitle="Guarda tus notas y sincronízalas en todos tus dispositivos."
>
	<GoogleButton label="Registrarse con Google" />

	<div class="flex items-center gap-3 text-micro font-semibold text-tertiary" aria-hidden="true">
		<span class="h-px flex-1 bg-border"></span>O<span class="h-px flex-1 bg-border"></span>
	</div>

	<form class="flex flex-col gap-5" onsubmit={submit} novalidate>
		<div class="flex flex-col gap-3.5">
			<AuthField
				id="fullName"
				label="Nombre"
				placeholder="Cómo quieres que te llamemos"
				autocomplete="name"
				bind:value={fullName}
				error={validationMessage(auth.fieldErrors.fullName)}
			/>
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
				placeholder="Mínimo 8 caracteres"
				autocomplete="new-password"
				bind:value={password}
				error={validationMessage(auth.fieldErrors.password)}
			>
				<StrengthMeter {password} />
				<p class="text-caption text-muted-foreground">
					Usa letras, números y un símbolo para mayor seguridad.
				</p>
			</AuthField>

			<div class="flex flex-col gap-1.5">
				<div class="flex items-start gap-2.5">
					<Checkbox id="terms" bind:checked={acceptedTerms} class="mt-0.5" />
					<label for="terms" class="text-label text-muted-foreground">
						Acepto los
						<a
							href="/terms"
							target="_blank"
							rel="noopener"
							onclick={(e) => e.stopPropagation()}
							class="font-semibold text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
							>Términos de uso</a
						>
						y la
						<a
							href="/privacy"
							target="_blank"
							rel="noopener"
							onclick={(e) => e.stopPropagation()}
							class="font-semibold text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
							>Política de privacidad</a
						>
						de AxoNote.
					</label>
				</div>
				{#if auth.fieldErrors.acceptedTerms}
					<p class="text-caption text-destructive">
						{validationMessage(auth.fieldErrors.acceptedTerms)}
					</p>
				{/if}
			</div>
		</div>

		{#if auth.error && auth.error.kind !== 'validation'}
			<p
				class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive"
				role="alert"
			>
				{errorMessage(auth.error)}
			</p>
		{/if}

		<Button type="submit" size="lg" disabled={auth.busy}>Crear cuenta</Button>
	</form>

	{#snippet footer()}
		¿Ya tienes cuenta?
		<a href="/login" class="font-semibold text-primary outline-none focus-visible:underline">
			Inicia sesión
		</a>
	{/snippet}
</AuthCard>
