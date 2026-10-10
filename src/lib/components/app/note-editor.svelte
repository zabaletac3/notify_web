<script lang="ts">
	import { onDestroy, onMount, type Snippet } from 'svelte';
	import { Editor } from '@tiptap/core';
	import Placeholder from '@tiptap/extension-placeholder';
	import { createMarkdownExtensions } from '#lib/core/editor/extensions.js';
	import AppIcon from './app-icon.svelte';
	import ToolbarButton from './toolbar-button.svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { cn } from '#lib/utils.js';

	type Props = {
		/** Markdown inicial. Para cargar otra nota, recrear el componente (`{#key}`). */
		content: string;
		/** Se llama (con espera) con el Markdown cada vez que el usuario edita. */
		onchange?: (markdown: string) => void;
		/** Se dibuja dentro del área con scroll, encima del texto (fecha, título…). */
		header?: Snippet;
		/** Botones del extremo derecho de la barra (compartir, más…). */
		actions?: Snippet;
		/** Barra superior para pantallas estrechas (volver, compartir…). Recibe `undo`. */
		mobileBar?: Snippet<[{ undo: () => void }]>;
		class?: string;
	};

	let { content, onchange, header, actions, mobileBar, class: className }: Props = $props();

	let element: HTMLDivElement;
	let editor = $state.raw<Editor | null>(null);
	/** Cambia en cada transacción para que la barra refleje la selección. */
	let tick = $state(0);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const active = (name: string) => {
		void tick;
		return editor?.isActive(name) ?? false;
	};

	function flush() {
		if (timer && editor) {
			clearTimeout(timer);
			timer = undefined;
			onchange?.(editor.getMarkdown());
		}
	}

	onMount(() => {
		editor = new Editor({
			element,
			extensions: [
				...createMarkdownExtensions(),
				Placeholder.configure({ placeholder: 'Empieza a escribir…' })
			],
			content,
			contentType: 'markdown',
			// El área de escritura necesita un nombre para lectores de pantalla.
			editorProps: {
				attributes: { 'aria-label': 'Contenido de la nota', 'aria-multiline': 'true' }
			},
			onTransaction: () => tick++,
			onUpdate: ({ editor: e }) => {
				clearTimeout(timer);
				timer = setTimeout(() => {
					timer = undefined;
					onchange?.(e.getMarkdown());
				}, 400);
			}
		});
	});

	onDestroy(() => {
		flush();
		editor?.destroy();
	});

	const styles = [
		{ label: 'Párrafo', apply: (e: Editor) => e.chain().focus().setParagraph().run() },
		{ label: 'Título 1', apply: (e: Editor) => e.chain().focus().setHeading({ level: 1 }).run() },
		{ label: 'Título 2', apply: (e: Editor) => e.chain().focus().setHeading({ level: 2 }).run() },
		{ label: 'Título 3', apply: (e: Editor) => e.chain().focus().setHeading({ level: 3 }).run() }
	];
	const currentStyle = $derived.by(() => {
		void tick;
		const level = [1, 2, 3].find((l) => editor?.isActive('heading', { level: l }));
		return level ? `Título ${level}` : 'Párrafo';
	});

	const run = (fn: (e: Editor) => void) => editor && fn(editor);
	const undo = () => run((e) => e.chain().focus().undo().run());
</script>

<div class="relative flex min-h-0 flex-1 flex-col">
	{#if mobileBar}
		<div class="md:hidden">{@render mobileBar({ undo })}</div>
	{/if}
	<div
		class="hidden h-[53px] shrink-0 items-center gap-0.5 border-b py-2.5 pr-3 pl-4 md:flex"
		role="toolbar"
		aria-label="Formato"
	>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="mr-1.5 flex h-7 items-center gap-1 rounded-lg bg-input-fill pr-2 pl-2.5 text-label font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				{currentStyle}
				<AppIcon name="chevron-down" size={14} />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start">
				{#each styles as style (style.label)}
					<DropdownMenu.Item onclick={() => run(style.apply)}>{style.label}</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
		<ToolbarButton
			icon="bold"
			label="Negrita"
			active={active('bold')}
			onclick={() => run((e) => e.chain().focus().toggleBold().run())}
		/>
		<ToolbarButton
			icon="italic"
			label="Cursiva"
			active={active('italic')}
			onclick={() => run((e) => e.chain().focus().toggleItalic().run())}
		/>
		<ToolbarButton
			icon="list"
			label="Lista"
			active={active('bulletList')}
			onclick={() => run((e) => e.chain().focus().toggleBulletList().run())}
		/>
		<ToolbarButton
			icon="checklist"
			label="Lista de tareas"
			active={active('taskList')}
			onclick={() => run((e) => e.chain().focus().toggleTaskList().run())}
		/>
		<span class="mx-1 h-[18px] w-px bg-border"></span>
		<ToolbarButton
			icon="undo"
			label="Deshacer"
			onclick={() => run((e) => e.chain().focus().undo().run())}
		/>
		<div class="flex-1"></div>
		{@render actions?.()}
	</div>
	<div class={cn('flex-1 overflow-y-auto', className)}>
		{@render header?.()}
		<div bind:this={element} class="prose-axonote"></div>
	</div>

	<!-- Barra de formato flotante (pantallas estrechas) -->
	<div class="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center md:hidden">
		<div
			class="pointer-events-auto flex items-center gap-1 rounded-3xl bg-sidebar p-1.5 shadow-lg ring-1 ring-foreground/5"
			role="toolbar"
			aria-label="Formato"
		>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="flex h-8.5 items-center gap-1 rounded-full bg-input-fill pr-2 pl-3 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
					aria-label="Estilo de texto"
				>
					Aa
					<AppIcon name="chevron-down" size={14} />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" side="top">
					{#each styles as style (style.label)}
						<DropdownMenu.Item onclick={() => run(style.apply)}>{style.label}</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
			<ToolbarButton
				size="lg"
				icon="bold"
				label="Negrita"
				active={active('bold')}
				onclick={() => run((e) => e.chain().focus().toggleBold().run())}
			/>
			<ToolbarButton
				size="lg"
				icon="italic"
				label="Cursiva"
				active={active('italic')}
				onclick={() => run((e) => e.chain().focus().toggleItalic().run())}
			/>
			<ToolbarButton
				size="lg"
				icon="list"
				label="Lista"
				active={active('bulletList')}
				onclick={() => run((e) => e.chain().focus().toggleBulletList().run())}
			/>
			<ToolbarButton
				size="lg"
				icon="checklist"
				label="Lista de tareas"
				active={active('taskList')}
				onclick={() => run((e) => e.chain().focus().toggleTaskList().run())}
			/>
		</div>
	</div>
</div>
