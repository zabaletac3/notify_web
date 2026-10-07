<script lang="ts">
	import { goto } from '$app/navigation';
	import { SettingRow, SettingsGroup, viewport } from '#lib/components/app/index.js';
	import { settingsSections } from '../sections.js';

	// El menú de secciones solo existe en pantallas estrechas.
	$effect(() => {
		if (viewport.split.current) void goto('/settings/general', { replaceState: true });
	});
</script>

<svelte:head><title>Ajustes · Apunte</title></svelte:head>

<h1 class="sr-only">Ajustes</h1>

<SettingsGroup>
	{#each settingsSections as section (section.href)}
		<SettingRow label={section.label} chevron onclick={() => goto(section.href)} />
	{/each}
</SettingsGroup>
