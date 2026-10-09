<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { getApp } from '#lib/app/index.js';
	import {
		AuthField,
		ResponsiveDialog,
		SettingRow,
		SettingsGroup,
		StrengthMeter,
		dialogButtons,
		dialogButtonsStacked
	} from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { errorMessage, formatCount, validationMessage } from '#lib/core/index.js';

	const { auth, sync } = getApp();

	const user = $derived(auth.user);
	const initials = $derived(
		(user?.fullName ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase())
			.join('')
	);

	async function logout(forgetDevice: boolean) {
		const result = await auth.logout({ forgetDevice });
		if (result.ok) await goto('/welcome');
	}

	// Con cambios sin sincronizar, salir los borraría del dispositivo: se pregunta antes.
	let leaving = $state(false);
	let syncingBeforeLeave = $state(false);
	let leaveError = $state(false);
	// Con confianza en este dispositivo, se elige entre conservarla o «olvidar este dispositivo» (T4).
	const canForget = $derived(auth.trustedHere && !!auth.user?.hasGoogle);
	let choosingForget = $state(false);

	/** Decide si hay que preguntar por la confianza o si se puede salir directamente. */
	function proceedLogout() {
		if (canForget) choosingForget = true;
		else void logout(false);
	}

	async function requestLogout() {
		// Lo último que se escribió puede estar todavía en cola: se cuenta antes de decidir.
		await sync.refresh();
		if (sync.pendingCount > 0) {
			leaveError = false;
			leaving = true;
		} else proceedLogout();
	}
	async function syncAndLogout() {
		syncingBeforeLeave = true;
		await sync.syncNow();
		syncingBeforeLeave = false;
		if (sync.pendingCount > 0) leaveError = true;
		else {
			leaving = false;
			proceedLogout();
		}
	}

	// ── Diálogos de edición ───────────────────────────────────────────
	type Kind = 'name' | 'email' | 'password' | 'google';
	let dialog = $state<Kind | null>(null);
	let name = $state('');
	let newEmail = $state('');
	let emailPassword = $state('');
	let code = $state('');
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmation = $state('');
	let unlinkPassword = $state('');

	function open(kind: Kind) {
		auth.clearErrors();
		auth.pendingEmailChange = null;
		name = user?.fullName ?? '';
		newEmail = emailPassword = code = currentPassword = newPassword = confirmation = '';
		unlinkPassword = '';
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

	async function unlinkGoogle(e: SubmitEvent) {
		e.preventDefault();
		if ((await auth.unlinkGoogle(unlinkPassword)).ok) {
			close();
			toast.success('Google desvinculado');
		}
	}

	const buttons = dialogButtons;
	const stackedButtons = dialogButtonsStacked;
	const generalError = $derived(
		auth.error && auth.error.kind !== 'validation' ? errorMessage(auth.error) : undefined
	);
</script>

<svelte:head><title>Mi cuenta · AxoNote</title></svelte:head>

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

<SettingsGroup title="Acceso">
	<SettingRow
		label="Google"
		value={user?.hasGoogle ? 'Vinculada' : 'No vinculada'}
		action={user?.hasGoogle ? 'Desvincular' : undefined}
		onclick={user?.hasGoogle ? () => open('google') : undefined}
	/>
</SettingsGroup>

<SettingsGroup>
	<SettingRow label="Cerrar sesión" danger onclick={requestLogout} />
</SettingsGroup>

{#snippet failure()}
	{#if generalError}
		<p class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive" role="alert">
			{generalError}
		</p>
	{/if}
{/snippet}

<ResponsiveDialog open={leaving} onOpenChange={(isOpen) => (leaving = isOpen)}>
	<Dialog.Title class="text-xl">Cambios sin sincronizar</Dialog.Title>
	<p class="text-sm leading-5 text-muted-foreground">
		Tienes {formatCount(sync.pendingCount, 'cambio', 'cambios')} sin sincronizar. Si cierras sesión ahora
		se perderán.
	</p>
	{#if leaveError}
		<p class="rounded-xl bg-destructive-soft px-3.5 py-3 text-label text-destructive" role="alert">
			No se pudo sincronizar. Revisa tu conexión e inténtalo de nuevo.
		</p>
	{/if}
	<div class={buttons}>
		<Button type="button" variant="outline" onclick={() => (leaving = false)}>Cancelar</Button>
		<Button
			type="button"
			variant="destructive"
			disabled={syncingBeforeLeave}
			onclick={() => {
				leaving = false;
				proceedLogout();
			}}>Salir igualmente</Button
		>
		<Button type="button" disabled={syncingBeforeLeave} onclick={syncAndLogout}
			>Sincronizar y salir</Button
		>
	</div>
</ResponsiveDialog>

<ResponsiveDialog open={choosingForget} onOpenChange={(isOpen) => (choosingForget = isOpen)}>
	<Dialog.Title class="text-xl">Cerrar sesión</Dialog.Title>
	<p class="text-sm leading-5 text-muted-foreground">
		En este dispositivo puedes volver a entrar con el botón de Google sin escribir tu contraseña. Si
		lo compartes con alguien, elige olvidarlo.
	</p>
	<div class={stackedButtons}>
		<Button
			type="button"
			variant="outline"
			onclick={() => {
				choosingForget = false;
				void logout(false);
			}}>Cerrar sesión</Button
		>
		<Button
			type="button"
			variant="destructive"
			onclick={() => {
				choosingForget = false;
				void logout(true);
			}}>Cerrar sesión y olvidar este dispositivo</Button
		>
	</div>
</ResponsiveDialog>

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

<ResponsiveDialog open={dialog === 'google'} onOpenChange={closing('google')}>
	<Dialog.Title class="text-xl">Desvincular Google</Dialog.Title>
	<p class="text-sm leading-5 text-muted-foreground">
		Dejarás de poder entrar con el botón de Google. Tus notas y tu contraseña de AxoNote no cambian.
	</p>
	<form class="flex flex-col gap-4" onsubmit={unlinkGoogle} novalidate>
		<AuthField
			id="unlink-password"
			label="Contraseña"
			type="password"
			autocomplete="current-password"
			bind:value={unlinkPassword}
			error={validationMessage(auth.fieldErrors.password)}
		/>
		{@render failure()}
		<div class={buttons}>
			<Button type="button" variant="outline" onclick={close}>Cancelar</Button>
			<Button type="submit" variant="destructive" disabled={auth.busy}>Desvincular</Button>
		</div>
	</form>
</ResponsiveDialog>
