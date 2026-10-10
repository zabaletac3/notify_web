import type { Extensions } from '@tiptap/core';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

/**
 * Extensiones que definen el **formato Markdown** de AxoNote (TipTap 3): StarterKit (párrafo,
 * títulos, negrita, cursiva, tachado, código, cita, listas, separador, salto duro), Markdown
 * (parseo y serialización) y las listas de tareas (anidadas).
 *
 * Las usan el mismo editor (`note-editor.svelte`, que además añade el placeholder) y el generador
 * de vectores (`scripts/generate-vectors.ts`, que las pasa a `MarkdownManager`). Así, el formato
 * que se edita y el que documentan los vectores `markdown.json` son exactamente el mismo.
 *
 * Es una función para devolver extensiones nuevas en cada uso: TipTap no garantiza que una misma
 * instancia se comparta entre varios editores.
 */
export function createMarkdownExtensions(): Extensions {
	return [StarterKit, Markdown, TaskList, TaskItem.configure({ nested: true })];
}
