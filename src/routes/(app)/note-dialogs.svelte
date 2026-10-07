<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { getApp } from '#lib/app/index.js';
	import { AppIcon, ResponsiveDialog } from '#lib/components/app/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { validationMessage } from '#lib/core/index.js';
	import { FOLDER_NAME_MAX_LENGTH, type Note } from '#lib/domain/index.js';
	import { cn } from '#lib/utils.js';
	import { dialogs } from './dialogs.svelte.js';

	const app = getApp();
	const { notes, folders, share } = app;

	const note = $derived(notes.all.find((n) => n.id === dialogs.noteId) ?? null);
	const isOpen = (kind: string) => dialogs.kind === kind;
	// Solo cierra si ese diálogo sigue siendo el activo (al pasar de "Mover" a "Nueva carpeta"
	// el primero se cierra por su cuenta y no debe borrar la nota elegida).
	const closing = (kind: string) => (open: boolean) => {
		if (!open && dialogs.kind === kind) dialogs.close();
	};

	const dialogClass = 'gap-4 p-6 md:p-7';

	// ── Mover a carpeta ───────────────────────────────────────────────
	let target = $state<string | null>(null);
	$effect(() => {
		if (isOpen('move')) target = note?.folderId ?? null;
	});

	async function move() {
		if (!note) return;
		const result = await notes.moveToFolder(note.id, target);
		dialogs.close();
		toast[result.ok ? 'success' : 'error'](
			result.ok ? `Nota movida a ${folders.name(target)}` : 'No se pudo mover la nota'
		);
	}

	// ── Nueva carpeta ─────────────────────────────────────────────────
	let folderName = $state('');
	let folderError = $state<string | undefined>();
	$effect(() => {
		if (isOpen('folder')) {
			folderName = '';
			folderError = undefined;
		}
	});

	async function createFolder() {
		const result = await folders.create(folderName.trim());
		if (!result.ok) {
			folderError =
				result.error.kind === 'validation'
					? validationMessage(result.error.fields.name)
					: 'No se pudo crear la carpeta';
			return;
		}
		// Si se creó desde "Mover a carpeta", la nota se mueve a la carpeta nueva.
		const moved = note !== null;
		if (note) await notes.moveToFolder(note.id, result.value.id);
		dialogs.close();
		toast.success(moved ? `Nota movida a ${result.value.name}` : 'Carpeta creada');
	}

	// ── Papelera ──────────────────────────────────────────────────────
	async function trash() {
		if (!note) return;
		const id = note.id;
		const result = await notes.moveToTrash(id);
		dialogs.close();
		if (!result.ok) return void toast.error('No se pudo mover la nota');
		toast.success('Nota movida a la papelera', {
			action: { label: 'Deshacer', onClick: () => void notes.restore(id) }
		});
	}

	// ── Compartir ─────────────────────────────────────────────────────
	const link = $derived(note ? share.linkFor(note.id) : null);

	async function toggleLink(on: boolean) {
		if (!note) return;
		const result = on ? await share.create(note.id) : await share.revoke(note.id);
		if (!result.ok) toast.error('No se pudo actualizar el enlace');
	}

	async function copyLink() {
		if (!link) return;
		await navigator.clipboard.writeText(link.url);
		toast.success('Enlace copiado');
	}

	function exportMarkdown(n: Note) {
		const blob = new Blob([`# ${n.title}\n\n${n.content}\n`], { type: 'text/markdown' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${n.title || 'nota'}.md`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	const soon = () => toast.info('Disponible pronto');
</script>

<!-- Mover a carpeta: 440 px -->
<ResponsiveDialog open={isOpen('move')} onOpenChange={closing('move')} width="sm:max-w-110">
	<Dialog.Title class="text-xl">Mover a carpeta</Dialog.Title>
	<p class="text-sm leading-5 text-muted-foreground">“{note?.title}”</p>
	<div
		class="divide-y divide-border overflow-hidden rounded-[14px] border bg-card"
		role="radiogroup"
		aria-label="Carpeta de destino"
	>
		{#each [...folders.list.map( (f) => ({ id: f.id as string | null, name: f.name, count: notes.counts.byFolder[f.id] ?? 0 }) ), { id: null, name: 'Sin carpeta', count: notes.counts.unfiled }] as option (option.id)}
			{@const selected = target === option.id}
			<button
				type="button"
				role="radio"
				aria-checked={selected}
				onclick={() => (target = option.id)}
				class="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<span
					class={cn(
						'grid size-5 shrink-0 place-content-center rounded-full border-2',
						selected ? 'border-primary' : 'border-tertiary'
					)}
				>
					{#if selected}<span class="size-2.5 rounded-full bg-primary"></span>{/if}
				</span>
				<AppIcon name="folder" size={18} class="text-muted-foreground" />
				<span class={cn('flex-1 text-body', selected ? 'font-semibold' : 'font-medium')}>
					{option.name}
				</span>
				<span class="text-label text-tertiary">{option.count}</span>
			</button>
		{/each}
	</div>
	<button
		type="button"
		onclick={() => dialogs.open('folder', dialogs.noteId)}
		class="flex items-center gap-2 self-start text-sm font-semibold text-primary"
	>
		<span class="text-lg leading-none">+</span> Nueva carpeta
	</button>
	<div class="flex gap-3 *:flex-1 md:justify-end md:*:flex-none">
		<Button variant="outline" onclick={() => dialogs.close()}>Cancelar</Button>
		<Button onclick={move} disabled={!note || target === note.folderId}>Mover aquí</Button>
	</div>
</ResponsiveDialog>

<!-- Nueva carpeta: 440 px -->
<Dialog.Root open={isOpen('folder')} onOpenChange={closing('folder')}>
	<Dialog.Content
		class={cn(dialogClass, 'max-w-[calc(100%-4rem)] sm:max-w-110')}
		showCloseButton={false}
	>
		<form
			class="contents"
			onsubmit={(e) => {
				e.preventDefault();
				void createFolder();
			}}
		>
			<Dialog.Title class="text-xl">Nueva carpeta</Dialog.Title>
			<p class="text-sm leading-5 text-muted-foreground">
				Organiza tus notas por tema, curso o proyecto.
			</p>
			<div class="flex flex-col gap-1.5">
				<label for="folder-name" class="text-label font-medium">Nombre</label>
				<Input
					id="folder-name"
					bind:value={folderName}
					maxlength={FOLDER_NAME_MAX_LENGTH}
					autocomplete="off"
					aria-invalid={folderError ? true : undefined}
				/>
				<div class="flex items-center gap-2 text-caption">
					<span class="flex-1 text-destructive">{folderError ?? ''}</span>
					<span class="text-tertiary">{folderName.length}/{FOLDER_NAME_MAX_LENGTH}</span>
				</div>
			</div>
			<div class="flex gap-3 *:flex-1 md:justify-end md:*:flex-none">
				<Button type="button" variant="outline" onclick={() => dialogs.close()}>Cancelar</Button>
				<Button type="submit" disabled={!folderName.trim() || folders.status === 'loading'}>
					Crear
				</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Confirmar eliminación: 420 px -->
<AlertDialog.Root open={isOpen('trash')} onOpenChange={closing('trash')}>
	<AlertDialog.Content
		class="gap-4 p-6 data-[size=default]:max-w-[calc(100%-4rem)] data-[size=default]:sm:max-w-105 md:p-7"
	>
		<span
			class="grid size-14 place-content-center rounded-full bg-destructive-soft text-destructive"
		>
			<AppIcon name="trash" size={26} />
		</span>
		<AlertDialog.Title class="text-xl font-bold">¿Mover a la papelera?</AlertDialog.Title>
		<AlertDialog.Description class="leading-[21px]">
			“{note?.title}” se conservará 30 días en la papelera. Puedes restaurarla cuando quieras.
		</AlertDialog.Description>
		<div class="flex gap-3 *:flex-1 md:justify-end md:*:flex-none">
			<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={trash}>
				Mover a la papelera
			</AlertDialog.Action>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Compartir nota: 480 px -->
<ResponsiveDialog open={isOpen('share')} onOpenChange={closing('share')} width="sm:max-w-120">
	<Dialog.Title class="text-xl">Compartir nota</Dialog.Title>
	<p class="text-sm leading-5 text-muted-foreground">“{note?.title}”</p>
	<div class="flex items-center gap-2">
		<output
			class="flex h-12 flex-1 items-center truncate rounded-lg bg-input-fill px-3.5 text-sm text-muted-foreground"
		>
			{link?.url ?? 'Activa el enlace para compartir'}
		</output>
		<Button onclick={copyLink} disabled={!link}>Copiar</Button>
	</div>
	<div class="divide-y divide-border overflow-hidden rounded-[14px] border bg-card">
		<div class="flex items-center gap-3 px-4 py-3.5">
			<div class="flex flex-1 flex-col gap-0.5">
				<span class="text-body font-medium">Cualquiera con el enlace puede ver</span>
				<span class="text-label text-muted-foreground">Solo lectura, no pueden editar</span>
			</div>
			<Switch
				aria-label="Cualquiera con el enlace puede ver"
				checked={!!link}
				disabled={share.busy}
				onCheckedChange={toggleLink}
			/>
		</div>
		{#each [{ label: 'Exportar como PDF', icon: 'share' as const, run: soon }, { label: 'Exportar como Markdown', icon: 'notes' as const, run: () => note && exportMarkdown(note) }, { label: 'Enviar una copia', icon: 'share' as const, run: soon }] as option (option.label)}
			<button
				type="button"
				onclick={option.run}
				class="flex w-full items-center gap-3 px-4 py-3.5 text-left text-body font-medium outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<AppIcon name={option.icon} size={20} class="text-muted-foreground" />
				{option.label}
			</button>
		{/each}
	</div>
</ResponsiveDialog>
