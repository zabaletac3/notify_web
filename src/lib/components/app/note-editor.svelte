<script lang="ts">
	import { onDestroy, onMount, type Snippet } from 'svelte';
	import { Editor } from '@tiptap/core';
	import { Markdown } from '@tiptap/markdown';
	import Placeholder from '@tiptap/extension-placeholder';
	import TaskItem from '@tiptap/extension-task-item';
	import TaskList from '@tiptap/extension-task-list';
	import StarterKit from '@tiptap/starter-kit';
	import ToolbarButton from './toolbar-button.svelte';
	import { cn } from '#lib/utils.js';

	type Props = {
		/** Markdown inicial. Para cargar otra nota, recrear el componente (`{#key}`). */
		content: string;
		/** Se llama (con espera) con el Markdown cada vez que el usuario edita. */
		onchange?: (markdown: string) => void;
		/** Se dibuja dentro del área con scroll, encima del texto (fecha, título…). */
		header?: Snippet;
		class?: string;
	};

	let { content, onchange, header, class: className }: Props = $props();

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
				StarterKit,
				Markdown,
				TaskList,
				TaskItem.configure({ nested: true }),
				Placeholder.configure({ placeholder: 'Empieza a escribir…' })
			],
			content,
			contentType: 'markdown',
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

	const run = (fn: (e: Editor) => void) => editor && fn(editor);
</script>

<div class="flex min-h-0 flex-1 flex-col">
	<div
		class="flex h-[53px] shrink-0 items-center gap-0.5 border-b py-2.5 pr-3 pl-4"
		role="toolbar"
		aria-label="Formato"
	>
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
	</div>
	<div class={cn('flex-1 overflow-y-auto', className)}>
		{@render header?.()}
		<div bind:this={element} class="prose-apunte"></div>
	</div>
</div>
