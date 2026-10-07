import { describe, expect, it } from 'vitest';
import { formatBytes } from '#lib/core/index.js';
import { STORAGE_QUOTA_BYTES } from '#lib/domain/index.js';
import { testApp } from '#lib/test/test-app.js';

describe('StorageState', () => {
	it('calcula el uso real a partir de las notas', async () => {
		const { storage, notes } = await testApp();
		await storage.load();
		expect(storage.status).toBe('ready');
		expect(storage.usage?.quotaBytes).toBe(STORAGE_QUOTA_BYTES);
		expect(storage.usage?.notesBytes).toBeGreaterThan(0);
		expect(storage.usage?.trashBytes).toBeGreaterThan(0);
		expect(storage.usage?.usedBytes).toBe(
			(storage.usage?.notesBytes ?? 0) + (storage.usage?.trashBytes ?? 0)
		);
		const before = storage.usage?.notesBytes ?? 0;
		await notes.create({ title: 'Nueva', content: 'x'.repeat(500) });
		await storage.load();
		expect(storage.usage?.notesBytes).toBeGreaterThan(before);
		expect(storage.availableBytes).toBe(STORAGE_QUOTA_BYTES - (storage.usage?.usedBytes ?? 0));
		expect(storage.percentUsed).toBeGreaterThan(0);
	});

	it('con error de servidor queda en "error"', async () => {
		const app = await testApp();
		app.scenario.serverError = true;
		const r = await app.storage.load();
		expect(r.ok).toBe(false);
		expect(app.storage.status).toBe('error');
	});
});

describe('formatBytes', () => {
	it('usa unidades binarias legibles', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(180 * 1024 * 1024)).toBe('180 MB');
		expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
		expect(formatBytes(1536)).toBe('1,5 KB');
		expect(formatBytes(1024 * 1024 * 1023.9)).toBe('1 GB');
	});
});
