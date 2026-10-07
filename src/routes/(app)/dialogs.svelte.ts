export type DialogKind = 'move' | 'folder' | 'trash' | 'share';

/** Qué diálogo está abierto y sobre qué nota. Lo abren el menú de notas, los atajos y la barra lateral. */
class DialogHost {
	kind = $state<DialogKind | null>(null);
	noteId = $state<string | null>(null);

	open(kind: DialogKind, noteId: string | null = null) {
		this.kind = kind;
		this.noteId = noteId;
	}

	close() {
		this.kind = null;
		this.noteId = null;
	}
}

export const dialogs = new DialogHost();
