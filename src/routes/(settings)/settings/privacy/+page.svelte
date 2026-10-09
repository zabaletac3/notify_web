<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getApp } from '#lib/app/index.js';
	import { ChoiceRow, SettingRow, SettingsGroup } from '#lib/components/app/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { formatCount } from '#lib/core/index.js';

	const { settings, devices, vault, mfa } = getApp();
	const values = $derived(settings.values);

	// El estado real de la verificación en dos pasos lo calcula el backend.
	onMount(() => void mfa.load());
</script>

<svelte:head><title>Privacidad y seguridad · AxoNote</title></svelte:head>

<h1 class="text-page font-bold max-md:sr-only">Privacidad y seguridad</h1>

<SettingsGroup title="Bloqueo">
	<SettingRow label="Bloqueo con huella">
		{#snippet control()}
			<Switch
				aria-label="Bloqueo con huella"
				checked={values.biometricLock}
				onCheckedChange={(biometricLock) => settings.update({ biometricLock })}
			/>
		{/snippet}
	</SettingRow>
	<SettingRow label="Pedir contraseña al recargar o cerrar la pestaña">
		{#snippet control()}
			<Switch
				aria-label="Pedir contraseña al recargar o cerrar la pestaña"
				checked={values.lockOnExit}
				onCheckedChange={(lockOnExit) => {
					void settings.update({ lockOnExit });
					// Sin bloqueo al salir, la clave se recuerda (cifrada) en este dispositivo.
					void vault.setRemember(!lockOnExit);
					// Activar el bloqueo al salir se comporta como un bloqueo: se pierde la confianza (S1).
					if (lockOnExit && vault.userId) void vault.forgetTrust(vault.userId);
				}}
			/>
		{/snippet}
	</SettingRow>
	<ChoiceRow
		label="Tiempo de bloqueo"
		value={values.lockTimeout}
		options={[
			{ value: 'immediately', label: 'Inmediatamente' },
			{ value: '1m', label: '1 minuto' },
			{ value: '5m', label: '5 minutos' },
			{ value: '15m', label: '15 minutos' },
			{ value: 'never', label: 'Nunca' }
		]}
		onchange={(lockTimeout) => settings.update({ lockTimeout })}
	/>
	<p class="px-4 py-2.5 text-label text-muted-foreground">
		{#if values.lockOnExit || values.lockTimeout !== 'never'}
			Con el bloqueo activado se pedirá tu contraseña y este dispositivo dejará de ser de confianza.
		{/if}
	</p>
	<p class="px-4 py-2.5 text-label text-muted-foreground">
		{#if values.lockTimeout === 'never'}
			La app no se bloqueará por inactividad.
		{:else if values.lockTimeout === 'immediately'}
			La app se bloquea al cambiar de pestaña o al cerrarla.
		{:else}
			Se bloquea tras ese tiempo sin actividad con la app abierta.
		{/if}
	</p>
</SettingsGroup>

<SettingsGroup title="Cifrado">
	<SettingRow
		label="Cifrado de extremo a extremo"
		description="Activo. Solo tú puedes leer tus notas: ni el servidor ni AxoNote tienen tu clave."
	/>
	<SettingRow
		label="Clave de recuperación"
		description="Es la única forma de recuperar tus notas si olvidas la contraseña."
		action="Crear nueva"
		onclick={() => goto('/recovery-key?next=/settings/privacy')}
	/>
</SettingsGroup>

<SettingsGroup title="Cuenta">
	<SettingRow
		label="Verificación en dos pasos"
		value={mfa.enabled ? 'Activada' : 'Desactivada'}
		chevron
		onclick={() => goto('/settings/two-factor')}
	/>
	<SettingRow
		label="Sesiones activas"
		value={formatCount(devices.list.length, 'dispositivo', 'dispositivos')}
		chevron
		onclick={() => goto('/settings/sync')}
	/>
</SettingsGroup>
