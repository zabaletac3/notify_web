<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { getApp } from '#lib/app/index.js';
	import { AppIcon } from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { formatNoteDate } from '#lib/core/index.js';
	import { derivePreview, type ConflictResolution, type NoteVersion } from '#lib/domain/index.js';
	import { cn } from '#lib/utils.js';

	const { sync, auth } = getApp();

	const now = new Date();

	// ── Conflicto de sincronización ───────────────────────────────────
	const conflict = $derived(sync.firstConflict);
	let dismissedConflicts = $state<string[]>([]);
	let choice = $state<'local' | 'remote'>('local');
	$effect(() => {
		if (conflict) choice = 'local';
	});
	const conflictOpen = $derived(!!conflict && !dismissedConflicts.includes(conflict.noteId));

	async function resolve(resolution: ConflictResolution) {
		if (!conflict) return;
		const result = await sync.resolve(conflict.noteId, resolution);
		if (!result.ok) toast.error('No se pudo resolver el conflicto');
	}

	function editedAt(version: NoteVersion) {
		const when = formatNoteDate(version.editedAt, now);
		return `${version.deviceName} · editada ${/^\d/.test(when) && when.includes(':') ? `hoy ${when}` : when.toLowerCase()}`;
	}

	// ── Sesión expirada ───────────────────────────────────────────────
	let keepOffline = $state(false);
	const expiredOpen = $derived(auth.status === 'expired' && !keepOffline);
	$effect(() => {
		if (auth.status !== 'expired') keepOffline = false;
	});
</script>

<!-- Conflicto de sincronización: 520 px -->
<Dialog.Root
	open={conflictOpen}
	onOpenChange={(open) => {
		if (!open && conflict) dismissedConflicts = [...dismissedConflicts, conflict.noteId];
	}}
>
	<Dialog.Content class="gap-4 p-7 sm:max-w-130" showCloseButton={false}>
		<Dialog.Title class="text-xl">Conflicto de sincronización</Dialog.Title>
		<p class="text-sm leading-[21px] text-muted-foreground">
			“{conflict?.local.title}” se editó en dos dispositivos a la vez. Elige qué versión conservar.
		</p>
		<div class="flex flex-col gap-3" role="radiogroup" aria-label="Versión a conservar">
			{#each conflict ? ([['local', 'Esta versión', conflict.local], ['remote', 'Versión de la nube', conflict.remote]] as const) : [] as [id, label, version] (id)}
				{@const selected = choice === id}
				<button
					type="button"
					role="radio"
					aria-checked={selected}
					onclick={() => (choice = id)}
					class={cn(
						'flex flex-col gap-1.5 rounded-xl px-3.5 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
						selected ? 'border-2 border-primary bg-accent' : 'border bg-card'
					)}
				>
					<span class="flex items-center gap-2.5">
						<span
							class={cn(
								'grid size-5 shrink-0 place-content-center rounded-full border-2',
								selected ? 'border-primary' : 'border-tertiary'
							)}
						>
							{#if selected}<span class="size-2.5 rounded-full bg-primary"></span>{/if}
						</span>
						<span class="text-body font-semibold">{label}</span>
					</span>
					<span class="text-caption text-muted-foreground">{editedAt(version)}</span>
					<span class="text-label leading-[19px]">{derivePreview(version.content, 80)}</span>
				</button>
			{/each}
		</div>
		<div class="flex justify-end gap-3">
			<Button variant="outline" onclick={() => resolve('both')}>Conservar ambas</Button>
			<Button onclick={() => resolve(choice)}>Usar la seleccionada</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>

<!-- Sesión expirada: 440 px -->
<Dialog.Root open={expiredOpen} onOpenChange={(open) => !open && (keepOffline = true)}>
	<Dialog.Content class="gap-4 p-7 sm:max-w-110" showCloseButton={false}>
		<span class="grid size-16 place-content-center rounded-full bg-accent text-accent-foreground">
			<AppIcon name="lock" size={26} />
		</span>
		<Dialog.Title class="text-xl">Tu sesión expiró</Dialog.Title>
		<p class="text-sm leading-[21px] text-muted-foreground">
			Por seguridad cerramos tu sesión. Inicia sesión de nuevo para seguir sincronizando. Tus notas
			guardadas en este dispositivo siguen aquí.
		</p>
		<div class="flex justify-end gap-3">
			<Button variant="outline" onclick={() => (keepOffline = true)}>Seguir sin conexión</Button>
			<Button onclick={() => goto('/login')}>Iniciar sesión</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
