<script lang="ts">
	import { SettingRow, SettingsGroup } from '#lib/components/app/index.js';
</script>

<svelte:head><title>Acerca de · Apunte</title></svelte:head>

<h1 class="text-page font-bold max-md:sr-only">Acerca de</h1>

<section class="flex flex-col items-center gap-2 py-2">
	<span
		class="grid size-18 place-content-center rounded-[18px] bg-primary text-4xl font-bold text-primary-foreground"
		aria-hidden="true">A</span
	>
	<p class="text-[22px] font-bold">Apunte</p>
	<p class="text-sm text-muted-foreground">Versión 1.0.0 (build 1)</p>
</section>

<SettingsGroup>
	<SettingRow label="Notas de la versión" chevron />
	<SettingRow label="Términos de uso" chevron />
	<SettingRow label="Política de privacidad" chevron />
	<SettingRow label="Licencias de código abierto" chevron />
	<SettingRow label="Contacto y soporte" chevron />
</SettingsGroup>

<p class="text-center text-caption text-tertiary">© 2026 Apunte. Todos los derechos reservados.</p>
