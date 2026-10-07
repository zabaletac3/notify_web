const DAY = 24 * 60 * 60 * 1000;

const weekdayShort = new Intl.DateTimeFormat('es', { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat('es', {
	day: 'numeric',
	month: 'short',
	year: 'numeric'
});
const time = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false });

const capitalize = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const clean = (s: string) => s.replace(/\./g, '');

/**
 * Fecha corta de una nota, como en la lista del diseño:
 * hoy → `09:12` · ayer → `Ayer` · últimos 6 días → `Lun` · antes → `28 sep` (con año si es otro año).
 */
export function formatNoteDate(iso: string, now: Date): string {
	const d = new Date(iso);
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const t = d.getTime();
	if (t >= startOfToday) return time.format(d);
	if (t >= startOfToday - DAY) return 'Ayer';
	if (t >= startOfToday - 6 * DAY) return capitalize(clean(weekdayShort.format(d)));
	return clean(d.getFullYear() === now.getFullYear() ? dayMonth.format(d) : dayMonthYear.format(d));
}

/** Fecha larga para la cabecera del editor: `7 de octubre de 2026, 09:12`. */
export function formatNoteDateLong(iso: string): string {
	const d = new Date(iso);
	const date = new Intl.DateTimeFormat('es', {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(d);
	return `${date}, ${time.format(d)}`;
}

/** Tiempo relativo breve: `hace 2 minutos`, `hace 3 días`. */
export function formatRelativeTime(iso: string, now: Date): string {
	const diff = now.getTime() - new Date(iso).getTime();
	const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'always' });
	const min = Math.round(diff / 60000);
	if (min < 1) return 'ahora mismo';
	if (min < 60) return rtf.format(-min, 'minute');
	const h = Math.round(min / 60);
	if (h < 24) return rtf.format(-h, 'hour');
	return rtf.format(-Math.round(h / 24), 'day');
}

export function formatCount(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}
