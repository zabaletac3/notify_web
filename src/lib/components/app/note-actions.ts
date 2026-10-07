import type { IconName } from './icons.js';

export type NoteActionId = 'pin' | 'move' | 'share' | 'rename' | 'duplicate' | 'trash';

export interface NoteAction {
	id: NoteActionId;
	label: string;
	icon: IconName;
	shortcut: string;
	danger?: boolean;
}

/** Acciones del menú de una nota, en el orden del diseño ("Menú contextual de nota"). */
export function noteActions(pinned: boolean): NoteAction[] {
	return [
		{ id: 'pin', label: pinned ? 'Desfijar nota' : 'Fijar nota', icon: 'pin', shortcut: 'Ctrl P' },
		{ id: 'move', label: 'Mover a carpeta', icon: 'folder', shortcut: 'Ctrl M' },
		{ id: 'share', label: 'Compartir', icon: 'share', shortcut: 'Ctrl Shift S' },
		{ id: 'rename', label: 'Cambiar nombre', icon: 'compose', shortcut: 'F2' },
		{ id: 'duplicate', label: 'Duplicar', icon: 'notes', shortcut: 'Ctrl D' },
		{
			id: 'trash',
			label: 'Mover a la papelera',
			icon: 'trash',
			shortcut: 'Supr',
			danger: true
		}
	];
}
