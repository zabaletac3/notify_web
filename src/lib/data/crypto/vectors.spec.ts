import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	CryptoFormatError,
	DecryptError,
	deriveFromRecoveryKey,
	formatRecoveryKey,
	fromB64u,
	fromUtf8,
	open,
	pad,
	parseRecoveryKey,
	toB64u,
	unpadJson,
	type KdfParams,
	type Sealed
} from '#lib/core/crypto/index.js';
import type { EncryptedFolder, EncryptedNote, SharedNote } from '#lib/domain/index.js';
import {
	Vault,
	decryptFolder,
	decryptNote,
	openSharedNote,
	shareUrl,
	unlockWithPassword
} from './index.js';
import { VECTORS_DIR, buildVectorFiles, deriveForVector } from './vectors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;
const dir = join(process.cwd(), VECTORS_DIR);
const load = (name: string): Json => JSON.parse(readFileSync(join(dir, name), 'utf8')) as Json;

const importAes = (bytes: Uint8Array<ArrayBuffer>) =>
	crypto.subtle.importKey('raw', bytes, 'AES-GCM', true, ['encrypt', 'decrypt']);

let generated: Record<string, string>;

beforeAll(async () => {
	generated = await buildVectorFiles();
}, 60_000);

describe('vectores de prueba compartidos', () => {
	it('los archivos de docs/api/vectors coinciden byte a byte con lo que genera el código actual', () => {
		for (const [name, expected] of Object.entries(generated)) {
			const actual = readFileSync(join(dir, name), 'utf8');
			expect(
				actual,
				`El vector ${name} no coincide con el código. Ejecuta «pnpm vectors:generate» y revisa el diff.`
			).toBe(expected);
		}
	});
});

describe('kdf.json', () => {
	it('el código deriva la misma authKey y abre el kekCheck (incluido DEFAULT_KDF, una vez)', async () => {
		const file = load('kdf.json');
		expect(file.cases.length).toBeGreaterThanOrEqual(2);
		for (const c of file.cases as Json[]) {
			const { authKey, kek } = await deriveForVector(c.password as string, c.kdf as KdfParams);
			expect(authKey).toBe(c.authKey);
			expect(toB64u(await open(kek, c.kekCheck.sealed, c.kekCheck.aad))).toBe(c.kekCheck.masterKey);
		}
	}, 60_000);
});

describe('sealed.json', () => {
	it('abre cada caso y falla como se espera', async () => {
		const file = load('sealed.json');
		const cases = file.cases as Json[];
		const byName = new Map(cases.map((c) => [c.name as string, c]));
		for (const c of cases) {
			const key = await importAes(fromB64u(c.key));
			expect(fromUtf8(await open(key, c.sealed, c.aad))).toBe(c.plaintext);
		}
		for (const f of file.failures as Json[]) {
			const base = byName.get(f.case as string)!;
			const key = await importAes(fromB64u((f.key ?? base.key) as string));
			const sealed = (f.sealed ?? base.sealed) as Sealed;
			const aad = (f.aad ?? base.aad) as string;
			const error = f.error === 'DecryptError' ? DecryptError : CryptoFormatError;
			await expect(
				open(key, sealed, aad),
				`El fallo «${f.name}» debía lanzar ${f.error}`
			).rejects.toThrow(error);
		}
	});
});

describe('wrap.json', () => {
	it('abre las envolturas y el keyBundle desbloquea la maestra', async () => {
		const file = load('wrap.json');
		const cases = file.cases as Json[];
		const [withKek, withRecovery, withMaster] = cases;

		const { kek } = await deriveForVector(withKek.password as string, withKek.kdf as KdfParams);
		expect(toB64u(await open(kek, withKek.sealed, withKek.aad))).toBe(withKek.plaintextKey);

		const { rkWrap } = await deriveFromRecoveryKey(fromB64u(withRecovery.recoveryBytes));
		expect(toB64u(await open(rkWrap, withRecovery.sealed, withRecovery.aad))).toBe(
			withRecovery.plaintextKey
		);

		const master = await importAes(fromB64u(withMaster.masterKey));
		expect(toB64u(await open(master, withMaster.sealed, withMaster.aad))).toBe(
			withMaster.plaintextKey
		);

		const unlocked = await unlockWithPassword(file.password, file.userId, file.keyBundle);
		const raw = await crypto.subtle.exportKey('raw', unlocked.masterKey);
		expect(toB64u(new Uint8Array(raw))).toBe(cases[0].plaintextKey);

		expect(formatRecoveryKey(fromB64u(withRecovery.recoveryBytes))).toBe(file.recoveryKey);
	});
});

describe('trusted-device.json', () => {
	it('la clave maestra se abre con la clave del dispositivo y el AAD nuevo', async () => {
		const file = load('trusted-device.json');
		const deviceKey = await importAes(fromB64u(file.case.deviceKey));
		expect(file.case.aad).toBe(`apunte/v1/mk/${file.userId}/trusted/${file.trustId}`);
		expect(toB64u(await open(deviceKey, file.case.sealed, file.case.aad))).toBe(
			file.case.plaintextKey
		);
		// Otra clave o otro AAD no lo abre.
		await expect(
			open(await importAes(fromB64u(file.case.deviceKey)), file.case.sealed, 'otro')
		).rejects.toThrow(DecryptError);
	});
});

describe('recovery-key.json', () => {
	it('formatea, tolera variantes y rechaza lo inválido', () => {
		const file = load('recovery-key.json');
		for (const c of file.cases as Json[]) {
			expect(formatRecoveryKey(fromB64u(c.bytes))).toBe(c.text);
		}
		for (const c of file.tolerant as Json[]) {
			expect(toB64u(parseRecoveryKey(c.text))).toBe(c.bytes);
		}
		for (const c of file.invalid as Json[]) {
			expect(() => parseRecoveryKey(c.text)).toThrow(CryptoFormatError);
			expect(() => parseRecoveryKey(c.text)).toThrow(c.message);
		}
	});
});

describe('padding.json', () => {
	it('rellena a múltiplos del bloque y lo quita al leer', () => {
		const file = load('padding.json');
		for (const c of file.lengths as Json[]) {
			const padded = pad(new Uint8Array(c.input as number));
			expect(padded.length).toBe(c.padded);
			expect(padded.length % (file.block as number)).toBe(0);
		}
		const padded = fromB64u(file.unpad.padded);
		expect(padded.length).toBe(file.unpad.paddedLength);
		expect(unpadJson(padded)).toBe(file.unpad.text);
	});
});

describe('note-payload.json', () => {
	it('abre la nota y la carpeta y reproduce el camino inverso', async () => {
		const file = load('note-payload.json');
		const vault = new Vault({ userId: file.userId });
		const master = await importAes(fromB64u(file.masterKey));
		vault.unlockWith(master);

		const note = file.note;
		expect(toB64u(await open(master, note.wrappedKey, note.keyAad))).toBe(note.itemKey);
		expect(
			unpadJson(await open(await importAes(fromB64u(note.itemKey)), note.payload, note.dataAad))
		).toBe(note.plaintextJson);
		const decrypted = await decryptNote(vault, note.encrypted as EncryptedNote, 'synced');
		expect(decrypted).toEqual(note.decrypted);

		const folder = file.folder;
		expect(toB64u(await open(master, folder.wrappedKey, folder.keyAad))).toBe(folder.itemKey);
		expect(
			unpadJson(
				await open(await importAes(fromB64u(folder.itemKey)), folder.payload, folder.dataAad)
			)
		).toBe(folder.plaintextJson);
		expect(await decryptFolder(vault, folder.encrypted as EncryptedFolder)).toEqual(
			folder.decrypted
		);
	});
});

describe('share.json', () => {
	it('abre la copia con la clave del enlace y reconstruye la URL con el fragmento', async () => {
		const file = load('share.json');
		const vault = new Vault({ userId: file.userId });
		const master = await importAes(fromB64u(file.masterKey));
		vault.unlockWith(master);

		expect(toB64u(await open(master, file.wrappedShareKey, file.keyAad))).toBe(file.shareKey);
		expect(
			await openSharedNote(file.slug, file.shareKey, file.payload, file.decrypted.updatedAt)
		).toEqual(file.decrypted);

		const url = await shareUrl(
			{ slug: file.slug } as SharedNote,
			await importAes(fromB64u(file.shareKey))
		);
		expect(url).toBe(file.url);
		expect(`${file.origin}/n/${file.slug}${file.keyFragment}`).toBe(file.url);
	});
});

describe('sync.json', () => {
	it('los cambios y las respuestas son coherentes y descifrables', async () => {
		const file = load('sync.json');
		const vault = new Vault({ userId: file.userId });
		vault.unlockWith(await importAes(fromB64u(file.masterKey)));

		const upsert = (file.request.changes as Json[]).find((c) => c.entity === 'note')!;
		const unwrapped = await open(
			vault.requireKey(),
			upsert.data.wrappedKey,
			vault.keyAad('note', upsert.id)
		);
		expect(unwrapped).toHaveLength(32);

		const [withMore, final] = file.responses as Json[];
		expect(withMore.hasMore).toBe(true);
		expect(final.hasMore).toBe(false);
		expect(final.conflicts.length).toBe(1);

		const remoteNote = (withMore.remoteChanges as Json[]).find((c) => c.note)!;

		const decrypted = await decryptNote(vault, remoteNote.note as EncryptedNote, 'synced');
		expect(typeof decrypted.title).toBe('string');
		expect(Array.isArray(decrypted.tags)).toBe(true);

		const tombstone = (withMore.remoteChanges as Json[]).find(
			(c) => c.deleted === true && c.entity === 'folder'
		)!;
		expect(tombstone.folder).toBeUndefined();

		const conflict = final.conflicts[0];
		expect((await decryptNote(vault, conflict.remote as EncryptedNote, 'synced')).title).toBe(
			'Receta secreta'
		);

		const remoteFolder = (final.remoteChanges as Json[]).find((c) => c.folder)!;
		expect(await decryptFolder(vault, remoteFolder.folder as EncryptedFolder)).toMatchObject({
			name: 'Recetas'
		});
	});
});
