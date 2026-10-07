<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { getApp } from '#lib/app/index.js';
	import { SettingRow, SettingsGroup } from '#lib/components/app/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';

	const { notes } = getApp();

	// Cifras de ejemplo: aún no existe un repositorio de almacenamiento (llega con IndexedDB).
	const usage = { usedMb: 180, totalMb: 1024, notesMb: 120, imagesMb: 55, trashMb: 5 };
	const percent = (usage.usedMb / usage.totalMb) * 100;

	let confirmEmpty = $state(false);

	async function emptyTrash() {
		const result = await notes.emptyTrash();
		confirmEmpty = false;
		toast[result.ok ? 'success' : 'error'](
			result.ok ? 'Papelera vaciada' : 'No se pudo vaciar la papelera'
		);
	}
</script>

<svelte:head><title>Almacenamiento · Apunte</title></svelte:head>

<h1 class="text-page font-bold max-md:sr-only">Almacenamiento y exportación</h1>

<section class="flex flex-col gap-3 rounded-[14px] border bg-card p-4">
	<p class="text-body font-semibold">{usage.usedMb} MB de 1 GB usados</p>
	<div
		class="h-2 overflow-hidden rounded-full bg-border"
		role="progressbar"
		aria-valuenow={usage.usedMb}
		aria-valuemax={usage.totalMb}
		aria-label="Almacenamiento usado"
	>
		<div class="h-full rounded-full bg-primary" style:width="{percent}%"></div>
	</div>
	<p class="text-label text-muted-foreground">
		Tienes {usage.totalMb - usage.usedMb} MB disponibles.
	</p>
</section>

<SettingsGroup title="Uso">
	<SettingRow label="Notas" value="{usage.notesMb} MB" chevron />
	<SettingRow label="Imágenes" value="{usage.imagesMb} MB" chevron />
	<SettingRow label="Papelera" value="{usage.trashMb} MB" chevron />
</SettingsGroup>

<SettingsGroup title="Exportar">
	<SettingRow label="Exportar todas las notas" description="Archivo .zip con Markdown" chevron />
	<SettingRow label="Exportar como PDF" chevron />
	<SettingRow label="Importar notas" chevron />
</SettingsGroup>

<SettingsGroup>
	<SettingRow label="Vaciar papelera" danger onclick={() => (confirmEmpty = true)} />
</SettingsGroup>

<AlertDialog.Root bind:open={confirmEmpty}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>¿Vaciar la papelera?</AlertDialog.Title>
			<AlertDialog.Description>
				Se eliminarán definitivamente {notes.counts.trash} notas. No podrás recuperarlas.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={emptyTrash}>Vaciar</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
