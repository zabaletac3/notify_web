import { describe, expect, it } from 'vitest';
import {
	CryptoFormatError,
	DecryptError,
	exportRawForShare,
	generateMasterKey,
	generateItemKey,
	isSealed
} from '#lib/core/crypto/index.js';
import type { SharedNote } from '#lib/domain/index.js';
import {
	Vault,
	createShare,
	isValidSlug,
	keyFromFragment,
	newSlug,
	openShareKey,
	openSharedNote,
	sealSharedNote,
	shareUrl
} from './index.js';

const note = { id: 'n1', title: 'Receta secreta', content: '# Ingredientes\n\n- 2 huevos' };

async function unlocked(userId = 'u1') {
	const vault = new Vault({ userId });
	vault.unlockWith(await generateMasterKey());
	return vault;
}

function stored(input: Awaited<ReturnType<typeof createShare>>, noteId = 'n1'): SharedNote {
	return {
		id: 's1',
		noteId,
		slug: input.slug,
		wrappedShareKey: input.wrappedShareKey,
		payload: input.payload,
		createdAt: '2026-10-07T12:00:00.000Z',
		updatedAt: '2026-10-07T12:00:00.000Z'
	};
}

describe('enlaces compartidos', () => {
	it('el slug es aleatorio, de 22 caracteres y distinto cada vez', () => {
		const a = newSlug();
		expect(isValidSlug(a)).toBe(true);
		expect(newSlug()).not.toBe(a);
		expect(isValidSlug('corto')).toBe(false);
		expect(isValidSlug(`${a}=`)).toBe(false);
	});

	it('la copia compartida va cifrada y no contiene el texto de la nota', async () => {
		const input = await createShare(await unlocked(), note);
		expect(isSealed(input.payload)).toBe(true);
		expect(isSealed(input.wrappedShareKey)).toBe(true);
		const json = JSON.stringify(input);
		expect(json).not.toContain('Receta');
		expect(json).not.toContain('huevos');
	});

	it('con la clave del fragmento se lee la nota; la URL lleva la clave tras el #', async () => {
		const vault = await unlocked();
		const input = await createShare(vault, note);
		const shared = stored(input);
		const url = await shareUrl(shared, await openShareKey(vault, shared));
		const [path, fragment] = url.split('#');
		expect(path).toBe(`https://apunte.app/n/${input.slug}`);
		const key = keyFromFragment(`#${fragment}`);
		expect(key).not.toBeNull();
		expect(await openSharedNote(input.slug, key!, input.payload, 'ayer')).toEqual({
			title: 'Receta secreta',
			content: '# Ingredientes\n\n- 2 huevos',
			updatedAt: 'ayer'
		});
	});

	it('la clave del enlace no sale en lo que recibe el servidor, solo cifrada', async () => {
		const vault = await unlocked();
		const input = await createShare(vault, note);
		const shared = stored(input);
		const key = await openShareKey(vault, shared);
		const raw = await exportRawForShare(key);
		expect(JSON.stringify(input)).not.toContain(raw);
	});

	it('otra clave, otro slug o un enlace alterado no se pueden leer', async () => {
		const vault = await unlocked();
		const input = await createShare(vault, note);
		const other = await exportRawForShare(await generateItemKey());
		await expect(openSharedNote(input.slug, other, input.payload, 'x')).rejects.toThrow(
			DecryptError
		);

		const shared = stored(input);
		const right = await exportRawForShare(await openShareKey(vault, shared));
		// El servidor no puede pasar la copia de un enlace como si fuera de otro.
		await expect(openSharedNote(newSlug(), right, input.payload, 'x')).rejects.toThrow(
			DecryptError
		);
		await expect(openSharedNote(input.slug, 'corta', input.payload, 'x')).rejects.toThrow(
			CryptoFormatError
		);
	});

	it('solo el dueño recupera la clave del enlace; otra cuenta o nota no', async () => {
		const vault = await unlocked('u1');
		const input = await createShare(vault, note);
		const shared = stored(input);
		await openShareKey(vault, shared);
		await expect(openShareKey(await unlocked('u1'), shared)).rejects.toThrow(); // otra clave maestra
		await expect(openShareKey(vault, { ...shared, noteId: 'n2' })).rejects.toThrow();
	});

	it('el dueño puede actualizar la copia con la misma clave', async () => {
		const vault = await unlocked();
		const input = await createShare(vault, note);
		const shared = stored(input);
		const key = await openShareKey(vault, shared);
		const next = await sealSharedNote(key, input.slug, { title: 'Receta', content: 'nuevo' });
		const fragment = await exportRawForShare(key);
		expect((await openSharedNote(input.slug, fragment, next, 'hoy')).content).toBe('nuevo');
	});

	it('el fragmento se valida: solo `k=` con 43 caracteres base64url', () => {
		const key = 'A'.repeat(43);
		expect(keyFromFragment(`#k=${key}`)).toBe(key);
		expect(keyFromFragment(`k=${key}`)).toBe(key);
		expect(keyFromFragment('')).toBeNull();
		expect(keyFromFragment('#k=corta')).toBeNull();
		expect(keyFromFragment(`#x=${key}`)).toBeNull();
		expect(keyFromFragment(`#k=${key}&y=1`)).toBeNull();
	});
});
