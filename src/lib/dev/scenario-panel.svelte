<script lang="ts">
	import { getApp } from '#lib/app/index.js';
	import { DEMO_USER_EMAIL, DEMO_USER_PASSWORD, type Dataset } from '#lib/data/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	const app = getApp();
	const { scenario, notes, sync, auth, folders } = app;

	const toggles = [
		{
			key: 'offline',
			label: 'Sin conexión',
			hint: 'Banner "sin conexión"; las notas se guardan localmente'
		},
		{
			key: 'serverError',
			label: 'Error de servidor',
			hint: 'Falla la carga de listas y las llamadas remotas'
		},
		{ key: 'sessionExpired', label: 'Sesión expirada', hint: 'Diálogo de sesión vencida' },
		{
			key: 'deviceRevoked',
			label: 'Dispositivo revocado',
			hint: 'Se cierra la sesión y se borra la copia local'
		},
		{
			key: 'injectConflict',
			label: 'Conflicto en la próxima sincronización',
			hint: 'Luego pulsa "Sincronizar ahora"'
		}
	] as const;

	const latencies = [0, 250, 1000, 3000];
	const datasets: { value: Dataset; label: string }[] = [
		{ value: 'normal', label: 'Normal (48 notas, 5 carpetas)' },
		{ value: 'first-time', label: 'Primera vez (cuenta vacía)' },
		{ value: 'large', label: 'Grande (2.000 notas)' }
	];
</script>

<div class="flex flex-col gap-6">
	<section class="flex flex-col gap-3">
		<h2 class="text-heading font-semibold">Escenarios</h2>
		{#each toggles as t (t.key)}
			<div class="flex items-center justify-between gap-4 rounded-lg border bg-card p-3">
				<div class="flex flex-col">
					<Label for="sim-{t.key}">{t.label}</Label>
					<span class="text-caption text-muted-foreground">{t.hint}</span>
				</div>
				<Switch id="sim-{t.key}" bind:checked={scenario[t.key]} />
			</div>
		{/each}

		<div class="flex flex-col gap-1.5">
			<Label for="sim-latency">Latencia simulada (ms) — alta para ver los skeletons</Label>
			<select
				id="sim-latency"
				class="h-11 rounded-lg bg-input-fill px-3 text-body"
				bind:value={scenario.latencyMs}
			>
				{#each latencies as ms (ms)}
					<option value={ms}>{ms}</option>
				{/each}
			</select>
		</div>

		<div class="flex flex-col gap-1.5">
			<Label for="sim-dataset">Datos de ejemplo</Label>
			<select
				id="sim-dataset"
				class="h-11 rounded-lg bg-input-fill px-3 text-body"
				value={scenario.dataset}
				onchange={(e) => app.resetData(e.currentTarget.value as Dataset)}
			>
				{#each datasets as d (d.value)}
					<option value={d.value}>{d.label}</option>
				{/each}
			</select>
		</div>

		<div class="flex flex-wrap gap-2">
			<Button variant="outline" size="sm" onclick={() => sync.syncNow()}>Sincronizar ahora</Button>
			<Button variant="outline" size="sm" onclick={() => notes.load()}>Recargar notas</Button>
			<Button
				variant="ghost"
				size="sm"
				onclick={() => {
					scenario.clear();
					app.resetData();
				}}
			>
				Restablecer todo
			</Button>
		</div>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-heading font-semibold">Estado</h2>
		<dl class="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border bg-card p-3 text-label">
			<dt class="text-muted-foreground">Sesión</dt>
			<dd>{auth.status}{auth.user ? ` · ${auth.user.email}` : ''}</dd>
			<dt class="text-muted-foreground">Sincronización</dt>
			<dd>{sync.phase} · {sync.pendingCount} pendientes · {sync.conflicts.length} conflictos</dd>
			<dt class="text-muted-foreground">Notas</dt>
			<dd>
				{notes.status} · {notes.counts.all} activas · {notes.counts.pinned} fijadas · {notes.counts
					.trash} en papelera
			</dd>
			<dt class="text-muted-foreground">Carpetas</dt>
			<dd>{folders.status} · {folders.list.length}</dd>
			<dt class="text-muted-foreground">Error de carga</dt>
			<dd>{notes.error?.kind ?? '—'}</dd>
		</dl>
	</section>

	<section class="flex flex-col gap-1 text-label text-muted-foreground">
		<h2 class="text-heading font-semibold text-foreground">Datos para probar</h2>
		<span
			>Usuario demo: <code>{DEMO_USER_EMAIL}</code> · contraseña
			<code>{DEMO_USER_PASSWORD}</code></span
		>
		<span>Código de verificación de correo: <code>123456</code></span>
		<span>Token de recuperación de contraseña: <code>token-de-prueba</code></span>
	</section>
</div>
