<script lang="ts">
	import { onMount } from 'svelte';
	import { getApp } from '#lib/app/index.js';
	import {
		AuthField,
		QrCode,
		RecoveryCodesPanel,
		ResponsiveDialog,
		SettingsGroup
	} from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import {
		errorMessage,
		formatCount,
		formatNoteDateLong,
		validationMessage
	} from '#lib/core/index.js';

	const { mfa, auth } = getApp();

	// Carga el estado real al entrar (el backend lo calcula; no se guarda en los ajustes locales).
	onMount(() => void mfa.load());

	// ── Diálogos ──────────────────────────────────────────────────────
	let password = $state('');
	let code = $state('');
	let activateOpen = $state(false);
	let manage = $state<'regenerate' | 'disable' | null>(null);

	function openActivate() {
		mfa.clearErrors();
		password = '';
		activateOpen = true;
	}

	function openManage(kind: 'regenerate' | 'disable') {
		mfa.clearErrors();
		password = '';
		code = '';
		manage = kind;
	}

	function closeDialogs() {
		activateOpen = false;
		manage = null;
		mfa.clearErrors();
	}

	async function startSetup(e: SubmitEvent) {
		e.preventDefault();
		if ((await mfa.setup(password)).ok) {
			activateOpen = false;
			password = '';
		}
	}

	async function confirmEnable(e: SubmitEvent) {
		e.preventDefault();
		if ((await mfa.enable(code)).ok) code = '';
	}

	async function saveManage(e: SubmitEvent) {
		e.preventDefault();
		const result =
			manage === 'regenerate'
				? await mfa.regenerate(password, code)
				: await mfa.disable(password, code);
		if (result.ok) closeDialogs();
	}

	const generalError = $derived(
		mfa.error && mfa.error.kind !== 'validation' ? errorMessage(mfa.error) : undefined
	);
</script>

<svelte:head><title>Verificación en dos pasos · AxoNote</title></svelte:head>

<h1 class="text-page font-bold max-md:sr-only">Verificación en dos pasos</h1>

{#if mfa.recoveryCodes.length > 0}
	<SettingsGroup title="Guarda tus códigos de respaldo">
		<div class="px-4 py-4">
			<p class="mb-4 text-label text-muted-foreground">
				Cada código sirve una sola vez. Guárdalos en un lugar seguro y separado de este dispositivo.
				Esta es la única vez que se muestran.
			</p>
			<RecoveryCodesPanel
				codes={mfa.recoveryCodes}
				email={auth.user?.email}
				continueLabel="Los guardé"
				oncontinue={() => mfa.acknowledgeCodes()}
			/>
		</div>
	</SettingsGroup>
{:else if mfa.pendingSetup}
	<SettingsGroup title="Escanea el código QR">
		<div class="flex flex-col items-center gap-5 px-4 py-4">
			<p class="text-label text-muted-foreground">
				Abre tu app de autenticación (Google Authenticator, Authy…) y escanea este código. Si no
				puedes escanearlo, escribe la clave de abajo.
			</p>
			<QrCode value={mfa.pendingSetup.otpauthUri} />
			<output
				class="block w-full rounded-xl bg-accent px-4 py-3 text-center font-mono text-body font-semibold tracking-wide break-all select-all"
				aria-label="Clave secreta"
			>
				{mfa.pendingSetup.secret}
			</output>
			<form class="flex w-full flex-col gap-4" onsubmit={confirmEnable} novalidate>
				<AuthField
					id="totp-code"
					label="Código de 6 dígitos"
					placeholder="123456"
					autocomplete="one-time-code"
					bind:value={code}
					error={validationMessage(mfa.fieldErrors.code)}
				/>
				{#if generalError}
					<p
						class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive"
						role="alert"
					>
						{generalError}
					</p>
				{/if}
				<div class="flex gap-3 *:flex-1">
					<Button type="button" variant="outline" onclick={() => mfa.cancelSetup()}>
						Cancelar
					</Button>
					<Button type="submit" disabled={mfa.loading}>Activar</Button>
				</div>
			</form>
		</div>
	</SettingsGroup>
{:else if mfa.enabled}
	<SettingsGroup title="Estado">
		<div class="flex flex-col gap-3 px-4 py-4">
			<p class="text-body">
				La verificación en dos pasos está <strong>activada</strong>.
			</p>
			<p class="text-label text-muted-foreground">
				{#if mfa.enabledAt}
					Activada el {formatNoteDateLong(mfa.enabledAt)}.
				{/if}
				Te quedan {formatCount(mfa.recoveryCodesLeft, 'código', 'códigos')} de respaldo.
			</p>
			<p class="text-label text-muted-foreground">
				Protege tu cuenta y tus datos cifrados (descarga, borrado y dispositivos). Tus notas siguen
				protegidas por tu contraseña.
			</p>
		</div>
	</SettingsGroup>

	<SettingsGroup>
		<div class="flex flex-col gap-2 px-4 py-4 md:flex-row">
			<Button variant="outline" onclick={() => openManage('regenerate')}
				>Generar códigos nuevos</Button
			>
			<Button variant="destructive" onclick={() => openManage('disable')}>Desactivar</Button>
		</div>
	</SettingsGroup>
{:else}
	<SettingsGroup title="Verificación en dos pasos">
		<div class="flex flex-col gap-4 px-4 py-4">
			<p class="text-body text-muted-foreground">
				Añade un código temporal además de tu contraseña al iniciar sesión. Protege tu cuenta y tus
				datos cifrados (descarga, borrado y dispositivos); las notas siguen protegidas por tu
				contraseña.
			</p>
			<div>
				<Button onclick={openActivate}>Activar</Button>
			</div>
		</div>
	</SettingsGroup>
{/if}

<ResponsiveDialog open={activateOpen} onOpenChange={(open) => (activateOpen = open)}>
	<Dialog.Title class="text-xl">Confirma tu contraseña</Dialog.Title>
	<p class="text-sm leading-5 text-muted-foreground">
		Para empezar a configurar la verificación en dos pasos necesitamos comprobar que eres tú.
	</p>
	<form class="flex flex-col gap-4" onsubmit={startSetup} novalidate>
		<AuthField
			id="mfa-password"
			label="Contraseña"
			type="password"
			autocomplete="current-password"
			bind:value={password}
			error={validationMessage(mfa.fieldErrors.password)}
		/>
		{#if generalError}
			<p
				class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive"
				role="alert"
			>
				{generalError}
			</p>
		{/if}
		<div class="flex gap-3 *:flex-1 md:justify-end md:*:flex-none">
			<Button type="button" variant="outline" onclick={closeDialogs}>Cancelar</Button>
			<Button type="submit" disabled={mfa.loading}>Continuar</Button>
		</div>
	</form>
</ResponsiveDialog>

<ResponsiveDialog open={manage !== null} onOpenChange={(open) => (open ? null : closeDialogs())}>
	<Dialog.Title class="text-xl">
		{manage === 'regenerate' ? 'Generar códigos nuevos' : 'Desactivar la verificación'}
	</Dialog.Title>
	<p class="text-sm leading-5 text-muted-foreground">
		{manage === 'regenerate'
			? 'Los códigos anteriores dejarán de servir. Confirma con tu contraseña y un código vigente.'
			: 'Confirma con tu contraseña y un código vigente.'}
	</p>
	<form class="flex flex-col gap-4" onsubmit={saveManage} novalidate>
		<AuthField
			id="manage-password"
			label="Contraseña"
			type="password"
			autocomplete="current-password"
			bind:value={password}
			error={validationMessage(mfa.fieldErrors.password)}
		/>
		<AuthField
			id="manage-code"
			label="Código (o código de respaldo)"
			placeholder="123456"
			autocomplete="one-time-code"
			bind:value={code}
			error={validationMessage(mfa.fieldErrors.code)}
		/>
		{#if generalError}
			<p
				class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive"
				role="alert"
			>
				{generalError}
			</p>
		{/if}
		<div class="flex gap-3 *:flex-1 md:justify-end md:*:flex-none">
			<Button type="button" variant="outline" onclick={closeDialogs}>Cancelar</Button>
			<Button
				type="submit"
				variant={manage === 'disable' ? 'destructive' : 'default'}
				disabled={mfa.loading}
			>
				{manage === 'disable' ? 'Desactivar' : 'Generar'}
			</Button>
		</div>
	</form>
</ResponsiveDialog>
