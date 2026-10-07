import { describe, expect, it } from 'vitest';
import { newId } from './ids.js';

describe('newId (UUID v7)', () => {
	it('tiene formato UUID con versión 7 y variante RFC 4122', () => {
		expect(newId()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
		);
	});

	it('ordena por hora de creación', () => {
		const ids = [1_000, 5_000, 2_000, 9_000, 3_000].map((t) => ({ t, id: newId(t) }));
		const sorted = [...ids].sort((a, b) => a.id.localeCompare(b.id)).map((x) => x.t);
		expect(sorted).toEqual([1_000, 2_000, 3_000, 5_000, 9_000]);
	});

	it('no repite identificadores', () => {
		expect(new Set(Array.from({ length: 1000 }, () => newId())).size).toBe(1000);
	});
});
