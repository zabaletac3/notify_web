<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { getApp } from '#lib/app/index.js';
	import {
		AuthField,
		ResponsiveDialog,
		SettingRow,
		SettingsGroup,
		StrengthMeter
	} from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { errorMessage, validationMessage } from '#lib/core/index.js';

	const { auth } = getApp();

	const user = $derived(auth.user);
	const initials = $derived(
		(user?.fullName ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase())
			.join('')
	);

	async function logout() {
		const result = await auth.logout();
		if (result.ok) await goto('/welcome');
	}

	// ── Diálogos de edición ───────────────────────────────────────────
	type Kind = 'name' | 'email' | 'password';
	let dialog = $state<Kind | null>(null);
	let name = $state('');
	let newEmail = $state('');
	let emailPassword = $state('');
	let code = $state('');
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmation = $state('');

	function open(kind: Kind) {
		auth.clearErrors();
		auth.pendingEmailChange = null;
		name = user?.fullName ?? '';
		newEmail = emailPassword = code = currentPassword = newPassword = confirmation = '';
		dialog = kind;
	}

	const close = () => {
		dialog = null;
		auth.clearErrors();
	};
	const closing = (kind: Kind) => (isOpen: boolean) => {
		if (!isOpen && dialog === kind) close();
	};

	async function saveName(e: SubmitEvent) {
		e.preventDefault();
		if ((await auth.updateProfile(name)).ok) {
			close();
			toast.success('Nombre actualizado');
		}
	}

	async function requestEmail(e: SubmitEvent) {
		e.preventDefault();
		await auth.requestEmailChange(newEmail, emailPassword);
	}

	async function confirmEmail(e: SubmitEvent) {
		e.preventDefault();
		if ((await auth.confirmEmailChange(code)).ok) {
			close();
			toast.success('Correo actualizado');
		}
	}

	async function savePassword(e: SubmitEvent) {
		e.preventDefault();
		if ((await auth.changePassword(currentPassword, newPassword, confirmation)).ok) {
			close();
			toast.success('Contraseña actualizada');
		}
	}

	const buttons = 'flex gap-3 *:flex-1 md:justify-end md:*:flex-none';
	const generalError = $derived(
		auth.error && auth.error.kind !== 'validation' ? errorMessage(auth.error) : undefined
	);
</script>

<svelte:head><title>Mi cuenta · Apunte</title></svelte:head>

<h1 class="text-page font-bold max-md:sr-only">Mi cuenta</h1>

<section class="flex items-center gap-4 rounded-[14px] border bg-card p-4">
	<span
		class="grid size-14 place-content-center rounded-full bg-accent text-xl font-bold text-accent-foreground"
		aria-hidden="true">{initials}</span
	>
	<div class="flex flex-col gap-0.5">
		<p class="text-[17px] font-semibold">{user?.fullName ?? ''}</p>
		<p class="text-sm text-muted-foreground">{user?.email ?? ''}</p>
	</div>
</section>

<SettingsGroup title="Datos">
	<SettingRow label="Nombre" value={user?.fullName} chevron onclick={() => open('name')} />
	<SettingRow
		label="Correo electrónico"
		value={user?.email}
		chevron
		onclick={() => open('email')}
	/>
	<SettingRow label="Contraseña" action="Cambiar" onclick={() => open('password')} />
</SettingsGroup>

<SettingsGroup>
	<SettingRow label="Cerrar sesión" danger onclick={logout} />
</SettingsGroup>

{#snippet failure()}
	{#if generalError}
		<p class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive" role="alert">
			{generalError}
		</p>
	{/if}
{/snippet}

<ResponsiveDialog open={dialog === 'name'} onOpenChange={closing('name')}>
	<Dialog.Title class="text-xl">Cambiar nombre</Dialog.Title>
	<form class="flex flex-col gap-4" onsubmit={saveName} novalidate>
		<AuthField
			id="profile-name"
			label="Nombre"
			autocomplete="name"
			bind:value={name}
			error={validationMessage(auth.fieldErrors.fullName)}
		/>
		{@render failure()}
		<div class={buttons}>
			<Button type="button" variant="outline" onclick={close}>Cancelar</Button>
			<Button type="submit" disabled={auth.busy}>Guardar</Button>
		</div>
	</form>
</ResponsiveDialog>

<ResponsiveDialog open={dialog === 'email'} onOpenChange={closing('email')}>
	<Dialog.Title class="text-xl">Cambiar correo</Dialog.Title>
	{#if auth.pendingEmailChange}
		<p class="text-sm leading-5 text-muted-foreground">
			Enviamos un código de 6 dígitos a {auth.pendingEmailChange}. Ingrésalo para confirmar el
			cambio.
		</p>
		<form class="flex flex-col gap-4" onsubmit={confirmEmail} novalidate>
			<AuthField
				id="email-code"
				label="Código"
				placeholder="123456"
				autocomplete="one-time-code"
				bind:value={code}
				error={validationMessage(auth.fieldErrors.code)}
			/>
			{@render failure()}
			<div class={buttons}>
				<Button type="button" variant="outline" onclick={close}>Cancelar</Button>
				<Button type="submit" disabled={auth.busy}>Confirmar</Button>
			</div>
		</form>
	{:else}
		<form class="flex flex-col gap-4" onsubmit={requestEmail} novalidate>
			<AuthField
				id="new-email"
				label="Correo nuevo"
				type="email"
				placeholder="nombre@correo.com"
				autocomplete="email"
				bind:value={newEmail}
				error={validationMessage(auth.fieldErrors.email)}
			/>
			<AuthField
				id="email-password"
				label="Contraseña actual"
				type="password"
				autocomplete="current-password"
				bind:value={emailPassword}
				error={validationMessage(auth.fieldErrors.password)}
			/>
			{@render failure()}
			<div class={buttons}>
				<Button type="button" variant="outline" onclick={close}>Cancelar</Button>
				<Button type="submit" disabled={auth.busy}>Enviar código</Button>
			</div>
		</form>
	{/if}
</ResponsiveDialog>

<ResponsiveDialog open={dialog === 'password'} onOpenChange={closing('password')}>
	<Dialog.Title class="text-xl">Cambiar contraseña</Dialog.Title>
	<form class="flex flex-col gap-4" onsubmit={savePassword} novalidate>
		<AuthField
			id="current-password"
			label="Contraseña actual"
			type="password"
			autocomplete="current-password"
			bind:value={currentPassword}
			error={validationMessage(auth.fieldErrors.currentPassword)}
		/>
		<AuthField
			id="new-password"
			label="Contraseña nueva"
			type="password"
			placeholder="Mínimo 8 caracteres"
			autocomplete="new-password"
			bind:value={newPassword}
			error={validationMessage(auth.fieldErrors.password)}
		>
			<StrengthMeter password={newPassword} variant="segments" />
		</AuthField>
		<AuthField
			id="confirm-password"
			label="Confirmar contraseña"
			type="password"
			autocomplete="new-password"
			bind:value={confirmation}
			error={validationMessage(auth.fieldErrors.confirmation)}
		/>
		{@render failure()}
		<div class={buttons}>
			<Button type="button" variant="outline" onclick={close}>Cancelar</Button>
			<Button type="submit" disabled={auth.busy}>Guardar</Button>
		</div>
	</form>
</ResponsiveDialog>
