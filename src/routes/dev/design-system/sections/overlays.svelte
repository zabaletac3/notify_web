<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as ContextMenu from '#lib/components/ui/context-menu/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { AppIcon } from '#lib/components/app/index.js';
</script>

<section class="flex flex-col gap-4" aria-labelledby="ds-overlays">
	<h2 id="ds-overlays" class="text-heading font-semibold">Capas y avisos</h2>

	<div class="flex flex-wrap items-center gap-3">
		<Dialog.Root>
			<Dialog.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>Diálogo</Button>
				{/snippet}
			</Dialog.Trigger>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>¿Mover a la papelera?</Dialog.Title>
					<Dialog.Description>
						La nota se conservará 30 días en la papelera. Puedes restaurarla cuando quieras.
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Footer>
					<Dialog.Close>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>Cancelar</Button>
						{/snippet}
					</Dialog.Close>
					<Button variant="destructive">Mover a la papelera</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>

		<Sheet.Root>
			<Sheet.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>Bottom sheet</Button>
				{/snippet}
			</Sheet.Trigger>
			<Sheet.Content side="bottom">
				<Sheet.Header>
					<Sheet.Title>Compartir nota</Sheet.Title>
					<Sheet.Description>Elige cómo quieres compartirla.</Sheet.Description>
				</Sheet.Header>
				<div class="px-4 pb-6">
					<Button class="w-full">Copiar enlace</Button>
				</div>
			</Sheet.Content>
		</Sheet.Root>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>Menú</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content class="w-56">
				<DropdownMenu.Item><AppIcon name="pin" size={18} />Fijar nota</DropdownMenu.Item>
				<DropdownMenu.Item><AppIcon name="folder" size={18} />Mover a carpeta</DropdownMenu.Item>
				<DropdownMenu.Item><AppIcon name="share" size={18} />Compartir</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item variant="destructive">
					<AppIcon name="trash" size={18} />Mover a la papelera
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<Tooltip.Provider>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button variant="ghost" size="icon-sm" aria-label="Nueva nota" {...props}>
							<AppIcon name="compose" size={18} />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>Nueva nota</Tooltip.Content>
			</Tooltip.Root>
		</Tooltip.Provider>
	</div>

	<ContextMenu.Root>
		<ContextMenu.Trigger
			class="flex h-24 max-w-sm items-center justify-center rounded-lg border border-dashed text-label text-muted-foreground"
		>
			Clic derecho aquí
		</ContextMenu.Trigger>
		<ContextMenu.Content class="w-56">
			<ContextMenu.Item>Fijar nota</ContextMenu.Item>
			<ContextMenu.Item>Duplicar</ContextMenu.Item>
			<ContextMenu.Item variant="destructive">Mover a la papelera</ContextMenu.Item>
		</ContextMenu.Content>
	</ContextMenu.Root>

	<div class="flex flex-wrap items-center gap-3">
		<Button variant="secondary" onclick={() => toast.success('Nota movida a Ideas')}>
			Toast éxito
		</Button>
		<Button
			variant="secondary"
			onclick={() =>
				toast('Nota enviada a la papelera', { action: { label: 'Deshacer', onClick: () => {} } })}
		>
			Toast con acción
		</Button>
		<Button variant="secondary" onclick={() => toast.error('No se pudo guardar la nota')}>
			Toast error
		</Button>
	</div>
</section>
