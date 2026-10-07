import type { Note } from './note.js';

export interface NoteGroup {
	/** Clave estable: `pinned`, `today`, `week`, `2026-09`, `2025`… */
	key: string;
	/** Etiqueta para mostrar: "Fijadas", "Hoy", "Esta semana", "Septiembre", "Septiembre 2025". */
	label: string;
	notes: Note[];
}

const DAY = 24 * 60 * 60 * 1000;
const monthName = (d: Date) =>
	new Intl.DateTimeFormat('es', { month: 'long' }).format(d).replace(/^./, (c) => c.toUpperCase());

/**
 * Agrupa las notas como la lista del diseño: Fijadas · Hoy · Esta semana · mes (· mes y año).
 * El orden de las notas dentro de cada grupo es el que traiga `notes`; el de los grupos es fijo.
 */
export function groupNotes(notes: Note[], now: Date): NoteGroup[] {
	const groups = new Map<string, NoteGroup>();
	const push = (key: string, label: string, note: Note) => {
		const g = groups.get(key) ?? { key, label, notes: [] };
		g.notes.push(note);
		groups.set(key, g);
	};
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

	for (const note of notes) {
		if (note.pinned) {
			push('pinned', 'Fijadas', note);
			continue;
		}
		const d = new Date(note.updatedAt);
		const t = d.getTime();
		if (t >= startOfToday) push('today', 'Hoy', note);
		else if (t >= startOfToday - 6 * DAY) push('week', 'Esta semana', note);
		else {
			const sameYear = d.getFullYear() === now.getFullYear();
			const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
			push(key, sameYear ? monthName(d) : `${monthName(d)} ${d.getFullYear()}`, note);
		}
	}
	// Orden fijo: Fijadas · Hoy · Esta semana · meses de más reciente a más antiguo
	// (independiente del orden de las notas dentro de cada grupo).
	const rank = (key: string) =>
		key === 'pinned' ? 0 : key === 'today' ? 1 : key === 'week' ? 2 : 3;
	return [...groups.values()].sort(
		(a, b) => rank(a.key) - rank(b.key) || (rank(a.key) === 3 ? b.key.localeCompare(a.key) : 0)
	);
}

/** Días que faltan para que una nota de la papelera se elimine definitivamente (mínimo 0). */
export function daysUntilPurge(deletedAt: string, now: Date, retentionDays: number): number {
	const elapsed = Math.floor((now.getTime() - new Date(deletedAt).getTime()) / DAY);
	return Math.max(0, retentionDays - elapsed);
}
