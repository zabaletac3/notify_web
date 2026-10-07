<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getApp } from '#lib/app/index.js';
	import { SettingRow, SettingsGroup } from '#lib/components/app/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { formatBytes } from '#lib/core/index.js';

	const { notes, storage } = getApp();

	onMount(() => void storage.load());
	// El espacio se recalcula cuando cambian las notas (vaciar la papelera, etc.).
	$effect(() => {
		void notes.all.length;
		untrack(() => void storage.load());
	});

	const usage = $derived(storage.usage);

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
	{#if usage}
		<p class="text-body font-semibold">
			{formatBytes(usage.usedBytes)} de {formatBytes(usage.quotaBytes)} usados
		</p>
		<div
			class="h-2 overflow-hidden rounded-full bg-border"
			role="progressbar"
			aria-valuenow={Math.round(storage.percentUsed)}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-label="Almacenamiento usado"
		>
			<div
				class="h-full min-w-1 rounded-full bg-primary"
				style:width="{storage.percentUsed}%"
			></div>
		</div>
		<p class="text-label text-muted-foreground">
			Tienes {formatBytes(storage.availableBytes)} disponibles.
		</p>
	{:else if storage.status === 'error'}
		<p class="text-label text-muted-foreground">No pudimos calcular el espacio usado.</p>
	{:else}
		<Skeleton class="h-4 w-48" />
		<Skeleton class="h-2 w-full rounded-full" />
		<Skeleton class="h-3.5 w-40" />
	{/if}
</section>

<SettingsGroup title="Uso">
	<SettingRow label="Notas" value={usage ? formatBytes(usage.notesBytes) : '—'} chevron />
	<SettingRow label="Imágenes" value={usage ? formatBytes(usage.imagesBytes) : '—'} chevron />
	<SettingRow label="Papelera" value={usage ? formatBytes(usage.trashBytes) : '—'} chevron />
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
