<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { getApp } from '#lib/app/index.js';
	import { AuthCard, AuthField, StrengthMeter } from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { cn } from '#lib/utils.js';
	import { errorMessage, validationMessage } from '#lib/core/index.js';

	const { auth } = getApp();

	const token = $derived(page.url.searchParams.get('token') ?? '');
	let password = $state('');
	let confirmation = $state('');
	let recoveryKey = $state('');
	// ¿Tiene la clave de recuperación? Con ella se conservan las notas; sin ella se empieza de cero.
	let choice = $state<'keep' | 'wipe'>('keep');
	let confirmedWipe = $state(false);
	// Verificación en dos pasos: `wipe` exige el código; `keep` permite desactivarla.
	let mfaEnabled = $state(false);
	let mfaCode = $state('');
	let disableMfa = $state(false);

	// El enlace dice si la cuenta tiene MFA para pedir el código solo cuando hace falta.
	onMount(async () => {
		if (!token) return;
		const result = await auth.loadPasswordResetBundle(token);
		if (result.ok) mfaEnabled = result.value.mfaEnabled;
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const result = await auth.resetPassword(
			token,
			password,
			confirmation,
			choice === 'keep'
				? { mode: 'keep', recoveryKey, ...(mfaEnabled ? { disableMfa } : {}) }
				: { mode: 'wipe', confirmed: confirmedWipe, ...(mfaEnabled ? { mfaCode } : {}) }
		);
		if (!result.ok) return;
		toast.success('Contraseña actualizada. Ya puedes iniciar sesión.');
		await goto('/login');
	}
</script>

<svelte:head><title>Nueva contraseña · AxoNote</title></svelte:head>

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
			<div class="flex flex-col gap-3" role="radiogroup" aria-label="Clave de recuperación">
				<p class="text-label font-medium">¿Tienes tu clave de recuperación?</p>
				{#each [['keep', 'Sí, la tengo', 'Conservas todas tus notas.'], ['wipe', 'No la tengo', 'Empiezas de cero: se borran tus notas.']] as const as [id, label, hint] (id)}
					<button
						type="button"
						role="radio"
						aria-checked={choice === id}
						onclick={() => (choice = id)}
						class={cn(
							'flex flex-col gap-0.5 rounded-xl px-3.5 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
							choice === id ? 'border-2 border-primary bg-accent' : 'border bg-card'
						)}
					>
						<span class="text-body font-semibold">{label}</span>
						<span class="text-caption text-muted-foreground">{hint}</span>
					</button>
				{/each}
			</div>

			{#if choice === 'keep'}
				<AuthField
					id="recovery-key"
					label="Clave de recuperación"
					placeholder="XXXX-XXXX-XXXX-…"
					autocomplete="off"
					autocapitalize="characters"
					spellcheck={false}
					bind:value={recoveryKey}
					error={validationMessage(auth.fieldErrors.recoveryKey)}
				/>
				{#if mfaEnabled}
					<div class="flex items-start gap-2.5">
						<Checkbox id="disable-mfa" bind:checked={disableMfa} class="mt-0.5" />
						<label for="disable-mfa" class="text-label text-muted-foreground">
							También perdí mi app de autenticación: desactivar la verificación en dos pasos.
						</label>
					</div>
				{/if}
			{:else}
				<div
					class="flex flex-col gap-2.5 rounded-xl border border-destructive bg-destructive-soft p-3.5"
					role="alert"
				>
					<p class="text-label font-semibold text-destructive">
						Se borrarán todas tus notas y carpetas. No se pueden recuperar.
					</p>
					<div class="flex items-start gap-2.5">
						<Checkbox id="confirm-wipe" bind:checked={confirmedWipe} class="mt-0.5" />
						<label for="confirm-wipe" class="text-label">
							Entiendo que se borrarán mis notas.
						</label>
					</div>
					{#if auth.fieldErrors.wipe}
						<p class="text-caption text-destructive">{validationMessage(auth.fieldErrors.wipe)}</p>
					{/if}
				</div>
				{#if mfaEnabled}
					<AuthField
						id="mfa-code"
						label="Código de verificación en dos pasos"
						placeholder="123456 o XXXXX-XXXXX"
						autocomplete="one-time-code"
						bind:value={mfaCode}
						error={validationMessage(auth.fieldErrors.mfaCode)}
					/>
				{/if}
			{/if}

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
