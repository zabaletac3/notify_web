<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { getApp } from '#lib/app/index.js';
	import { SettingRow, SettingsGroup } from '#lib/components/app/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { formatRelativeTime } from '#lib/core/index.js';
	import type { DevicePlatform } from '#lib/domain/index.js';

	const { settings, sync, devices } = getApp();
	const values = $derived(settings.values);
	const now = new Date();

	const phaseLabel = $derived.by(() => {
		if (sync.snapshot.phase === 'syncing' || sync.syncing) return 'Sincronizando…';
		if (sync.snapshot.phase === 'offline') return 'Sin conexión';
		if (sync.snapshot.phase === 'error') return 'No se pudo sincronizar';
		if (sync.snapshot.pendingCount > 0) return 'Cambios pendientes';
		return 'Todo sincronizado';
	});
	const lastSync = $derived(
		sync.snapshot.lastSyncedAt
			? `Última sincronización ${formatRelativeTime(sync.snapshot.lastSyncedAt, now)}`
			: 'Aún no se ha sincronizado'
	);

	const platforms: Record<DevicePlatform, string> = {
		linux: 'Linux',
		windows: 'Windows',
		android: 'Android',
		web: 'Web'
	};
	const ordered = $derived([...devices.list].sort((a, b) => Number(b.current) - Number(a.current)));

	async function syncNow() {
		const result = await sync.syncNow();
		if (!result.ok) toast.error('No se pudo sincronizar');
	}

	async function remove(id: string) {
		const result = await devices.remove(id);
		toast[result.ok ? 'success' : 'error'](
			result.ok ? 'Dispositivo eliminado' : 'No se pudo quitar el dispositivo'
		);
	}
</script>

<svelte:head><title>Sincronización · Apunte</title></svelte:head>

<h1 class="text-page font-bold max-md:sr-only">Sincronización y dispositivos</h1>

<section class="flex items-center gap-3 rounded-[14px] bg-accent p-4" aria-live="polite">
	<span class="size-3 rounded-full bg-primary"></span>
	<div class="flex flex-col gap-0.5">
		<p class="text-body font-semibold">{phaseLabel}</p>
		<p class="text-label text-muted-foreground">{lastSync}</p>
	</div>
</section>

<SettingsGroup title="Sincronización">
	<SettingRow label="Sincronizar automáticamente">
		{#snippet control()}
			<Switch
				aria-label="Sincronizar automáticamente"
				checked={values.autoSync}
				onCheckedChange={(autoSync) => settings.update({ autoSync })}
			/>
		{/snippet}
	</SettingRow>
	<SettingRow label="Solo con Wi-Fi" description="Evita gastar datos móviles">
		{#snippet control()}
			<Switch
				aria-label="Solo con Wi-Fi"
				checked={values.wifiOnly}
				onCheckedChange={(wifiOnly) => settings.update({ wifiOnly })}
			/>
		{/snippet}
	</SettingRow>
	<SettingRow label="Sincronizar ahora" action="Ahora" onclick={syncNow} />
</SettingsGroup>

<SettingsGroup title="Dispositivos">
	{#each ordered as device (device.id)}
		<SettingRow
			label={device.name}
			description="{device.current ? 'Este dispositivo · ' : ''}{platforms[
				device.platform
			]} · {device.current ? 'activo ahora' : formatRelativeTime(device.lastActiveAt, now)}"
		>
			{#snippet control()}
				{#if !device.current}
					<button
						type="button"
						class="text-sm font-semibold text-primary"
						onclick={() => remove(device.id)}
					>
						Quitar<span class="sr-only"> {device.name}</span>
					</button>
				{/if}
			{/snippet}
		</SettingRow>
	{/each}
</SettingsGroup>
