<script lang="ts">
	import { getApp } from '#lib/app/index.js';
	import { AppIcon, AuthCard, AuthField } from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { errorMessage, validationMessage } from '#lib/core/index.js';

	const { auth } = getApp();

	let email = $state('');
	// Cada visita empieza en el formulario, aunque ya se haya pedido un enlace antes.
	let sent = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const result = await auth.forgotPassword(email);
		if (result.ok) sent = true;
	}
</script>

<svelte:head><title>Recuperar contraseña · Apunte</title></svelte:head>

{#if sent}
	<AuthCard title="Revisa tu correo">
		{#snippet mark()}
			<span class="grid size-24 place-content-center rounded-full bg-accent text-accent-foreground">
				<AppIcon name="mail" size={34} />
			</span>
		{/snippet}
		<p class="text-center text-sm leading-[22px] text-muted-foreground">
			Si existe una cuenta con {email.trim()}, recibirás un enlace para restablecer tu contraseña en
			unos minutos.
		</p>
		<Button size="lg" href="/login">Volver a iniciar sesión</Button>
		<p class="flex justify-center gap-1 text-sm">
			<span class="text-muted-foreground">¿No lo recibiste?</span>
			<button
				type="button"
				class="font-semibold text-primary"
				onclick={() => auth.forgotPassword(email)}
				disabled={auth.busy}
			>
				Reenviar enlace
			</button>
		</p>
	</AuthCard>
{:else}
	<AuthCard
		title="¿Olvidaste tu contraseña?"
		subtitle="Escribe el correo de tu cuenta y te enviaremos un enlace para crear una nueva."
	>
		<form class="flex flex-col gap-5" onsubmit={submit} novalidate>
			<AuthField
				id="email"
				label="Correo electrónico"
				type="email"
				placeholder="nombre@correo.com"
				autocomplete="email"
				bind:value={email}
				error={validationMessage(auth.fieldErrors.email)}
			/>
			{#if auth.error && auth.error.kind !== 'validation'}
				<p
					class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive"
					role="alert"
				>
					{errorMessage(auth.error)}
				</p>
			{/if}
			<Button type="submit" size="lg" disabled={auth.busy}>Enviar enlace</Button>
			<a href="/login" class="text-center text-sm font-semibold text-primary">
				Volver a iniciar sesión
			</a>
		</form>
	</AuthCard>
{/if}
