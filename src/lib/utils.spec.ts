import { describe, expect, it } from 'vitest';
import { cn } from '#lib/utils.js';

describe('cn', () => {
	it('une clases y resuelve conflictos de Tailwind', () => {
		expect(cn('p-2', 'p-4')).toBe('p-4');
		const oculto = false;
		expect(cn('text-sm', oculto && 'hidden', 'font-bold')).toBe('text-sm font-bold');
	});
});
