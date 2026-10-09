<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getApp } from '#lib/app/index.js';
	import { AppIcon, AuthCard, AuthField, StrengthMeter } from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { errorMessage, validationMessage } from '#lib/core/index.js';

	const { auth } = getApp();

	let password = $state('');
	let fullName = $state('');
	let newPassword = $state('');
	let confirmation = $state('');
	let acceptedTerms = $state(false);
	let mismatch = $state(false);
	// Evita que el efecto de guardia navegue mientras aún se muestra un formulario.
	let leaving = $state(false);

	// El fragmento (`#code=…` o `#error=…`) llega al cargar; se canjea una sola vez.
	onMount(() => {
		void auth.completeGoogle(page.url.hash);
	});

	// Al terminar el flujo se navega como en `verify`: a la clave de recuperación, a desbloquear o a notas.
	$effect(() => {
		if (leaving) return;
		if (auth.googleProcessing || auth.googleLink || auth.googleSignup) return;
		if (auth.googleError || auth.googleCallbackError) return;
		if (auth.mfaPending) {
			leaving = true;
			void goto('/two-factor');
			return;
		}
		if (auth.isAuthenticated) {
			leaving = true;
			const next = auth.pendingRecoveryKey ? '/recovery-key' : auth.isLocked ? '/unlock' : '/notes';
			void goto(next);
		}
	});

	// Precarga el nombre que devuelve Google al crear la cuenta.
	$effect(() => {
		if (auth.googleSignup && !fullName) fullName = auth.googleSignup.fullName;
	});

	const errorText = $derived.by(() => {
		if (auth.googleCallbackError) {
			if (auth.googleCallbackError === 'access_denied') return 'Cancelaste el acceso con Google.';
			if (auth.googleCallbackError === 'email-unverified')
				return 'El correo de tu cuenta de Google no está verificado.';
			return 'No pudimos completar el acceso con Google. Vuelve a intentarlo.';
		}
		return auth.googleError
			? errorMessage(auth.googleError)
			: 'No pudimos completar el acceso con Google. Vuelve a intentarlo.';
	});

	async function link(e: SubmitEvent) {
		e.preventDefault();
		await auth.linkGoogle(password);
	}

	async function create(e: SubmitEvent) {
		e.preventDefault();
		mismatch = newPassword !== confirmation;
		if (mismatch) return;
		await auth.registerWithGoogle({ fullName, password: newPassword, acceptedTerms });
	}
</script>

<svelte:head><title>Acceso con Google · AxoNote</title></svelte:head>

{#if auth.googleLink}
	<AuthCard
		title="Vincula tu cuenta"
		subtitle={`Ya tienes una cuenta con ${auth.googleLink.email}. Escribe tu contraseña de AxoNote para vincularla con Google.`}
	>
		{#snippet mark()}
			<span class="grid size-18 place-content-center rounded-full bg-accent text-accent-foreground">
				<AppIcon name="lock" size={30} />
			</span>
		{/snippet}

		<form class="flex flex-col gap-5" onsubmit={link} novalidate>
			<AuthField
				id="google-link-password"
				label="Contraseña"
				type="password"
				placeholder="Tu contraseña"
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

			<Button type="submit" size="lg" disabled={auth.busy}>
				{auth.busy ? 'Vinculando…' : 'Vincular con Google'}
			</Button>
			<a
				href="/forgot-password"
				class="text-center text-label font-semibold text-primary outline-none focus-visible:underline"
			>
				¿Olvidaste tu contraseña?
			</a>
		</form>
	</AuthCard>
{:else if auth.googleSignup}
	<AuthCard
		title="Crea tu contraseña de AxoNote"
		subtitle={`Tu cuenta de Google (${auth.googleSignup.email}) ya está verificada. Solo falta crear tu contraseña para cifrar tus notas.`}
	>
		{#snippet mark()}
			<span class="grid size-18 place-content-center rounded-full bg-accent text-accent-foreground">
				<AppIcon name="lock" size={30} />
			</span>
		{/snippet}

		<form class="flex flex-col gap-5" onsubmit={create} novalidate>
			<AuthField
				id="google-name"
				label="Nombre"
				placeholder="Cómo quieres que te llamemos"
				autocomplete="name"
				bind:value={fullName}
				error={validationMessage(auth.fieldErrors.fullName)}
			/>
			<AuthField
				id="google-new-password"
				label="Contraseña"
				type="password"
				placeholder="Mínimo 8 caracteres"
				autocomplete="new-password"
				bind:value={newPassword}
				error={validationMessage(auth.fieldErrors.password)}
			>
				<StrengthMeter password={newPassword} />
			</AuthField>
			<AuthField
				id="google-confirm-password"
				label="Confirmar contraseña"
				type="password"
				autocomplete="new-password"
				bind:value={confirmation}
				error={validationMessage(mismatch ? 'passwords-dont-match' : undefined)}
			/>

			<p class="rounded-xl bg-accent px-3.5 py-3 text-label text-foreground">
				Tu contraseña cifra tus notas. Google no la conoce y nosotros tampoco. La pedimos una vez en
				cada dispositivo nuevo.
			</p>

			<div class="flex flex-col gap-1.5">
				<div class="flex items-start gap-2.5">
					<Checkbox id="google-terms" bind:checked={acceptedTerms} class="mt-0.5" />
					<label for="google-terms" class="text-label text-muted-foreground">
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

			{#if auth.error && auth.error.kind !== 'validation'}
				<p
					class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive"
					role="alert"
				>
					{errorMessage(auth.error)}
				</p>
			{/if}

			<Button type="submit" size="lg" disabled={auth.busy}>
				{auth.busy ? 'Creando tu cuenta…' : 'Crear cuenta'}
			</Button>
		</form>
	</AuthCard>
{:else if auth.googleError || auth.googleCallbackError}
	<AuthCard title="No pudimos completar el acceso" subtitle={errorText}>
		<Button size="lg" onclick={() => goto('/login')}>Volver a iniciar sesión</Button>
	</AuthCard>
{:else}
	<AuthCard
		title="Conectando con Google"
		subtitle="Estamos terminando de iniciar sesión. Un momento…"
	>
		<span
			class="mx-auto size-8 animate-spin rounded-full border-2 border-border border-t-primary"
			role="status"
			aria-label="Procesando el acceso con Google"
		></span>
	</AuthCard>
{/if}
