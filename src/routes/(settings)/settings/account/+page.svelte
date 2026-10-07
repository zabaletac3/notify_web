<script lang="ts">
	import { goto } from '$app/navigation';
	import { getApp } from '#lib/app/index.js';
	import { SettingRow, SettingsGroup } from '#lib/components/app/index.js';

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
		if (result.ok) await goto('/login');
	}
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
	<SettingRow label="Nombre" value={user?.fullName} chevron />
	<SettingRow label="Correo electrónico" value={user?.email} chevron />
	<SettingRow label="Contraseña" action="Cambiar" onclick={() => goto('/forgot-password')} />
</SettingsGroup>

<SettingsGroup>
	<SettingRow label="Cerrar sesión" danger onclick={logout} />
</SettingsGroup>
