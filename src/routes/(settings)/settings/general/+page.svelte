<script lang="ts">
	import { setMode } from 'mode-watcher';
	import { getApp } from '#lib/app/index.js';
	import { ChoiceRow, SettingRow, SettingsGroup } from '#lib/components/app/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import type { AppSettings } from '#lib/domain/index.js';

	const { settings } = getApp();
	const values = $derived(settings.values);

	function theme(value: AppSettings['theme']) {
		setMode(value);
		return settings.update({ theme: value });
	}
</script>

<svelte:head><title>Ajustes generales · AxoNote</title></svelte:head>

<h1 class="text-page font-bold max-md:sr-only">Ajustes generales</h1>

<SettingsGroup title="Apariencia">
	<ChoiceRow
		label="Tema"
		value={values.theme}
		options={[
			{ value: 'system', label: 'Sistema' },
			{ value: 'light', label: 'Claro' },
			{ value: 'dark', label: 'Oscuro' }
		]}
		onchange={theme}
	/>
	<ChoiceRow
		label="Tamaño del texto"
		value={values.textSize}
		options={[
			{ value: 'small', label: 'Pequeño' },
			{ value: 'medium', label: 'Mediano' },
			{ value: 'large', label: 'Grande' }
		]}
		onchange={(textSize) => settings.update({ textSize })}
	/>
	<SettingRow label="Fuente del editor" value="Inter" chevron />
</SettingsGroup>

<SettingsGroup title="Notas">
	<ChoiceRow
		label="Orden de las notas"
		value={values.noteOrder}
		options={[
			{ value: 'updated', label: 'Fecha de edición' },
			{ value: 'created', label: 'Fecha de creación' },
			{ value: 'title', label: 'Título' }
		]}
		onchange={(noteOrder) => settings.update({ noteOrder })}
	/>
	<SettingRow label="Abrir con una nota nueva">
		{#snippet control()}
			<Switch
				aria-label="Abrir con una nota nueva"
				checked={values.openWithNewNote}
				onCheckedChange={(openWithNewNote) => settings.update({ openWithNewNote })}
			/>
		{/snippet}
	</SettingRow>
	<SettingRow label="Mostrar vista previa en la lista">
		{#snippet control()}
			<Switch
				aria-label="Mostrar vista previa en la lista"
				checked={values.showPreview}
				onCheckedChange={(showPreview) => settings.update({ showPreview })}
			/>
		{/snippet}
	</SettingRow>
</SettingsGroup>

<SettingsGroup title="Idioma">
	<SettingRow label="Idioma de la app" value="Español" chevron />
</SettingsGroup>
