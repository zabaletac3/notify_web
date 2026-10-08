import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as crypto_ from '#lib/core/crypto/index.js';
import { generateMasterKey, isSealed } from '#lib/core/crypto/index.js';
import { AppFailure, type Folder, type Note } from '#lib/domain/index.js';
import {
	DecryptCache,
	DeviceKeyStore,
	Vault,
	decryptFolder,
	decryptNote,
	encryptFolder,
	encryptNote,
	unreadableNote
} from './index.js';

const NOW = '2026-10-07T12:00:00.000Z';

const note = (over: Partial<Note> = {}): Note => ({
	id: 'n1',
	folderId: 'f1',
	title: 'Reunión con ñandú',
	content: '# Hola\n\nUn texto **privado** 🙂',
	tags: ['trabajo', 'urgente'],
	pinned: true,
	createdAt: NOW,
	updatedAt: NOW,
	deletedAt: null,
	revision: 3,
	syncStatus: 'pending',
	lastEditedDeviceId: 'd1',
	...over
});

const folder = (over: Partial<Folder> = {}): Folder => ({
	id: 'f1',
	name: 'Universidad',
	createdAt: NOW,
	updatedAt: NOW,
	...over
});

async function unlocked(userId = 'u1') {
	const vault = new Vault({ userId });
	vault.unlockWith(await generateMasterKey());
	return vault;
}

describe('Vault', () => {
	it('empieza bloqueado y exige la clave maestra', async () => {
		const vault = new Vault({ userId: 'u1' });
		expect(vault.status).toBe('locked');
		expect(() => vault.requireKey()).toThrow(AppFailure);
		await expect(vault.newItemKey('note', 'n1')).rejects.toMatchObject({
			error: { kind: 'locked' }
		});
		vault.unlockWith(await generateMasterKey());
		expect(vault.status).toBe('unlocked');
		vault.lock();
		expect(vault.status).toBe('locked');
		expect(() => vault.requireKey()).toThrow(AppFailure);
	});

	it('reparte una clave por elemento y la recuerda hasta bloquear', async () => {
		const vault = await unlocked();
		const { key, wrapped } = await vault.newItemKey('note', 'n1');
		expect(isSealed(wrapped)).toBe(true);
		expect(await vault.itemKey('note', 'n1', wrapped)).toBe(key);

		vault.lock();
		vault.unlockWith(await generateMasterKey());
		// Otra clave maestra: la caché se vació y la clave de la nota ya no se puede abrir.
		await expect(vault.itemKey('note', 'n1', wrapped)).rejects.toThrow();
	});

	it('la clave de un elemento no sirve para otro (datos asociados)', async () => {
		const vault = await unlocked();
		const { wrapped } = await vault.newItemKey('note', 'n1');
		await expect(vault.itemKey('note', 'n2', wrapped)).rejects.toThrow();
		await expect(vault.itemKey('folder', 'n1', wrapped)).rejects.toThrow();
	});
});

describe('notas y carpetas cifradas', () => {
	it('ida y vuelta de una nota', async () => {
		const vault = await unlocked();
		const original = note();
		const encrypted = await encryptNote(vault, original);
		expect(await decryptNote(vault, encrypted, 'pending')).toEqual(original);
	});

	it('el servidor solo ve metadatos y textos cifrados', async () => {
		const vault = await unlocked();
		const encrypted = await encryptNote(vault, note());
		const json = JSON.stringify(encrypted);
		for (const secret of ['Reunión', 'ñandú', 'privado', 'trabajo', 'urgente'])
			expect(json).not.toContain(secret);
		expect(encrypted).toMatchObject({ id: 'n1', folderId: 'f1', revision: 3, deletedAt: null });
		expect(isSealed(encrypted.payload)).toBe(true);
		expect(isSealed(encrypted.wrappedKey)).toBe(true);
	});

	it('al volver a cifrar con la misma clave solo cambia el texto, no la clave', async () => {
		const vault = await unlocked();
		const first = await encryptNote(vault, note());
		const second = await encryptNote(vault, note({ title: 'Otro' }), first.wrappedKey);
		expect(second.wrappedKey).toBe(first.wrappedKey);
		expect(second.payload).not.toBe(first.payload);
		expect((await decryptNote(vault, second, 'synced')).title).toBe('Otro');
	});

	it('una nota nueva (o duplicada) lleva una clave nueva', async () => {
		const vault = await unlocked();
		const a = await encryptNote(vault, note());
		const b = await encryptNote(vault, note({ id: 'n2' }));
		expect(a.wrappedKey).not.toBe(b.wrappedKey);
	});

	it('los textos se rellenan: títulos de tamaño parecido dan el mismo tamaño cifrado', async () => {
		const vault = await unlocked();
		const a = await encryptNote(vault, note({ content: 'a' }));
		const b = await encryptNote(vault, note({ content: 'a'.repeat(100) }));
		expect(a.payload.length).toBe(b.payload.length);
	});

	it('ida y vuelta de una carpeta', async () => {
		const vault = await unlocked();
		const encrypted = await encryptFolder(vault, folder(), 2);
		expect(JSON.stringify(encrypted)).not.toContain('Universidad');
		expect(encrypted.revision).toBe(2);
		expect(await decryptFolder(vault, encrypted)).toEqual(folder());
	});

	it('si el servidor cambia el texto cifrado entre dos notas, no se puede leer', async () => {
		const vault = await unlocked();
		const a = await encryptNote(vault, note({ id: 'a', title: 'A' }));
		const b = await encryptNote(vault, note({ id: 'b', title: 'B' }));
		// Mismo contenido, pero el servidor lo coloca en la otra nota.
		const swapped = { ...a, payload: b.payload };
		await expect(decryptNote(vault, swapped, 'synced')).rejects.toThrow();
		// Y tampoco con la clave de la otra.
		await expect(
			decryptNote(vault, { ...a, wrappedKey: b.wrappedKey }, 'synced')
		).rejects.toThrow();
		expect((await decryptNote(vault, b, 'synced')).title).toBe('B');
	});

	it('el texto cifrado de otra cuenta no se puede leer aunque se tenga la clave maestra', async () => {
		const master = await generateMasterKey();
		const a = new Vault({ userId: 'u1' });
		a.unlockWith(master);
		const b = new Vault({ userId: 'u2' });
		b.unlockWith(master);
		const encrypted = await encryptNote(a, note());
		await expect(decryptNote(b, encrypted, 'synced')).rejects.toThrow();
	});

	it('con el cofre bloqueado no se puede cifrar ni descifrar', async () => {
		const vault = await unlocked();
		const encrypted = await encryptNote(vault, note());
		vault.lock();
		await expect(decryptNote(vault, encrypted, 'synced')).rejects.toMatchObject({
			error: { kind: 'locked' }
		});
		await expect(encryptNote(vault, note())).rejects.toMatchObject({ error: { kind: 'locked' } });
	});

	it('una nota corrupta se puede mostrar como "Nota ilegible"', async () => {
		const vault = await unlocked();
		const encrypted = await encryptNote(vault, note());
		const broken = { ...encrypted, payload: 'a1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAA' };
		await expect(decryptNote(vault, broken, 'synced')).rejects.toThrow();
		expect(unreadableNote(broken, 'synced')).toMatchObject({
			id: 'n1',
			title: 'Nota ilegible',
			content: '',
			folderId: 'f1',
			revision: 3
		});
	});

	it('un contenido con la forma equivocada se rechaza', async () => {
		const vault = await unlocked();
		const encrypted = await encryptNote(vault, note());
		const key = await vault.itemKey('note', 'n1', encrypted.wrappedKey);
		const bad = await crypto_.seal(
			key,
			crypto_.pad(crypto_.utf8(JSON.stringify({ title: 1 }))),
			vault.dataAad('note', 'n1')
		);
		await expect(decryptNote(vault, { ...encrypted, payload: bad }, 'synced')).rejects.toThrow();
	});
});

describe('DecryptCache', () => {
	it('reutiliza lo descifrado mientras el texto no cambie', () => {
		const cache = new DecryptCache<string>();
		cache.set('n1', 'p1', 'k1', 'valor');
		expect(cache.get('n1', 'p1', 'k1')).toBe('valor');
		expect(cache.get('n1', 'p2', 'k1')).toBeUndefined();
		expect(cache.get('n1', 'p1', 'k2')).toBeUndefined();
		cache.delete('n1');
		expect(cache.get('n1', 'p1', 'k1')).toBeUndefined();
		cache.set('n1', 'p1', 'k1', 'valor');
		cache.clear();
		expect(cache.get('n1', 'p1', 'k1')).toBeUndefined();
	});
});

describe('DeviceKeyStore', () => {
	let n = 0;
	const store = () => new DeviceKeyStore(`test-keys-${++n}`);

	it('guarda la clave maestra y la devuelve utilizable', async () => {
		const keys = store();
		const master = await generateMasterKey();
		await keys.save('u1', master);
		const loaded = await keys.load('u1');
		expect(loaded).not.toBeNull();

		const sealed = await crypto_.seal(master, crypto_.utf8('x'), 'ctx');
		expect(crypto_.fromUtf8(await crypto_.open(loaded!, sealed, 'ctx'))).toBe('x');
	});

	it('sin clave guardada devuelve null; remove y removeAll la borran', async () => {
		const keys = store();
		expect(await keys.load('u1')).toBeNull();
		await keys.save('u1', await generateMasterKey());
		await keys.save('u2', await generateMasterKey());
		await keys.remove('u1');
		expect(await keys.load('u1')).toBeNull();
		expect(await keys.load('u2')).not.toBeNull();
		await keys.removeAll();
		expect(await keys.load('u2')).toBeNull();
	});

	it('la clave guardada de una cuenta no se lee como la de otra', async () => {
		const keys = store();
		await keys.save('u1', await generateMasterKey());
		expect(await keys.load('u2')).toBeNull();
	});
});
