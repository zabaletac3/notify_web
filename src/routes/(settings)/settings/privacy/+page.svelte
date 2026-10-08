<script lang="ts">
	import { goto } from '$app/navigation';
	import { getApp } from '#lib/app/index.js';
	import { ChoiceRow, SettingRow, SettingsGroup } from '#lib/components/app/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { formatCount } from '#lib/core/index.js';

	const { settings, devices, vault } = getApp();
	const values = $derived(settings.values);
</script>

<svelte:head><title>Privacidad y seguridad · Apunte</title></svelte:head>

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
	<SettingRow label="Bloquear al salir de la app">
		{#snippet control()}
			<Switch
				aria-label="Bloquear al salir de la app"
				checked={values.lockOnExit}
				onCheckedChange={(lockOnExit) => {
					void settings.update({ lockOnExit });
					// Sin bloqueo al salir, la clave se recuerda (cifrada) en este dispositivo.
					void vault.setRemember(!lockOnExit);
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
			{ value: '15m', label: '15 minutos' }
		]}
		onchange={(lockTimeout) => settings.update({ lockTimeout })}
	/>
</SettingsGroup>

<SettingsGroup title="Cifrado">
	<SettingRow
		label="Cifrado de extremo a extremo"
		description="Activo. Solo tú puedes leer tus notas: ni el servidor ni Apunte tienen tu clave."
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
		value={values.twoFactor ? 'Activada' : 'Desactivada'}
		chevron
		onclick={() => settings.update({ twoFactor: !values.twoFactor })}
	/>
	<SettingRow
		label="Sesiones activas"
		value={formatCount(devices.list.length, 'dispositivo', 'dispositivos')}
		chevron
		onclick={() => goto('/settings/sync')}
	/>
</SettingsGroup>
