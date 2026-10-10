import {
	DEFAULT_KDF,
	LIGHT_KDF,
	deriveFromPassword,
	deriveFromRecoveryKey,
	formatRecoveryKey,
	pad,
	toB64u,
	unpadJson,
	utf8,
	type DerivedKeys,
	type KdfParams,
	type Sealed
} from '#lib/core/crypto/index.js';
import { sealWithIv as sealWithIvForVectors } from '#lib/core/crypto/testing.js';
import type {
	EncryptedFolder,
	EncryptedNote,
	Id,
	KeyBundle,
	SharedNote
} from '#lib/domain/index.js';
import { masterKeyAad } from './account-keys.js';
import { buildMarkdownVector } from './markdown-vectors.js';
import { buildSyncBehaviorVector } from './sync-behavior-vectors.js';
import {
	decryptFolder,
	decryptNote,
	encodeFolderPayload,
	encodeNotePayload,
	type NotePayload
} from './note-codec.js';
import { openSharedNote, shareContentAad, shareKeyAad, shareUrl } from './share-codec.js';
import { trustedDeviceAad } from './trusted-device-keys.js';
import { Vault } from './vault.js';

/**
 * Vectores de prueba compartidos con las apps nativas (ver `docs/api/vectors/README.md`).
 *
 * Se generan de forma **determinista**: claves, sales, IVs y slugs fijos salen de `pattern(...)`,
 * nunca de `crypto.getRandomValues`. `sealWithIvForVectors` fija el IV; el resto del formato lo
 * producen las mismas funciones que usa la app (`encodeNotePayload`, `masterKeyAad`, etc.), de modo
 * que un cambio de formato rompe las pruebas hasta regenerar y revisar el diff (`pnpm vectors:generate`).
 */

export const VECTORS_DIR = 'docs/api/vectors';

const USER_ID: Id = '018f6f9a-7b1c-7c3e-8c9d-000000000001';
const DEVICE_ID: Id = '018f6f9a-7b1c-7c3e-8c9d-0000000000aa';
const NOTE_ID: Id = '018f6f9a-7b1c-7c3e-8c9d-000000000101';
const NOTE_ID_2: Id = '018f6f9a-7b1c-7c3e-8c9d-000000000102';
const FOLDER_ID: Id = '018f6f9a-7b1c-7c3e-8c9d-000000000201';
const SHARE_ID: Id = '018f6f9a-7b1c-7c3e-8c9d-000000000301';
const TRUST_ID: Id = '018f6f9a-7b1c-7c3e-8c9d-000000000401';

const NOTE_TITLE = 'Receta secreta';
const NOTE_CONTENT = '# Ingredientes\n\n- 2 huevos\n- 100 g de azúcar';
const NOTE_TAGS = ['cocina', 'dulce'];
const NOTE_PINNED = true;

const NOTE_2_TITLE = 'Lista de la compra';
const NOTE_2_CONTENT = '- pan\n- leche';

const FOLDER_NAME = 'Recetas';

const SHARE_TITLE = 'Receta secreta';
const SHARE_CONTENT = '# Ingredientes\n\n- 2 huevos';

const CREATED_AT = '2026-01-02T03:04:05.000Z';
const UPDATED_AT = '2026-02-03T04:05:06.000Z';

const PASSWORD_LIGHT = 'contrasen\u0303a'; // «contraseña» con la tilde descompuesta: prueba NFKC
const PASSWORD_DEFAULT = 'correct horse battery staple';

/** Bytes deterministas y distintos por `seed`. */
function pattern(seed: number, length: number): Uint8Array<ArrayBuffer> {
	return Uint8Array.from({ length }, (_, i) => (seed * 37 + i * 101 + 13) & 0xff);
}

const MASTER_KEY = pattern(1, 32);
const ITEM_KEY = pattern(2, 32);
const ITEM_KEY_2 = pattern(3, 32);
const SHARE_KEY = pattern(4, 32);
const RECOVERY_KEY_BYTES = pattern(5, 32);
const SALT_LIGHT = pattern(6, 16);
const SALT_DEFAULT = pattern(7, 16);
const SLUG = toB64u(pattern(8, 16)); // 16 bytes → 22 caracteres base64url
const TRUSTED_KEY = pattern(24, 32); // clave fija del dispositivo de confianza (solo vectores)

const IV = {
	kdf: pattern(11, 12),
	sealed: pattern(12, 12),
	mkPassword: pattern(13, 12),
	mkRecovery: pattern(14, 12),
	item: pattern(15, 12),
	noteKey: pattern(16, 12),
	noteData: pattern(17, 12),
	folderKey: pattern(18, 12),
	folderData: pattern(19, 12),
	shareKey: pattern(20, 12),
	sharePayload: pattern(21, 12),
	note2Key: pattern(22, 12),
	note2Data: pattern(23, 12),
	trusted: pattern(25, 12)
} as const;

const importAes = (bytes: Uint8Array<ArrayBuffer>, usages: KeyUsage[] = ['encrypt', 'decrypt']) =>
	crypto.subtle.importKey('raw', bytes, 'AES-GCM', true, usages);

const masterKeyCrypto = () => importAes(MASTER_KEY);

async function unlockedVault(): Promise<Vault> {
	const vault = new Vault({ userId: USER_ID });
	vault.unlockWith(await masterKeyCrypto());
	return vault;
}

/** Deriva contraseña → claves una sola vez por combinación: el caso DEFAULT (64 MiB) es lento. */
const derivationCache = new Map<string, Promise<DerivedKeys>>();
export function deriveForVector(password: string, kdf: KdfParams): Promise<DerivedKeys> {
	const cacheKey = `${password}\u0000${kdf.memoryKiB}\u0000${kdf.iterations}\u0000${kdf.parallelism}\u0000${kdf.salt}`;
	let pending = derivationCache.get(cacheKey);
	if (!pending) {
		pending = deriveFromPassword(password, kdf);
		derivationCache.set(cacheKey, pending);
	}
	return pending;
}

const tamper = (sealed: Sealed): Sealed => {
	const [version, iv, ct] = sealed.split('.');
	const bytes = Uint8Array.from(atob(ct.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
		c.charCodeAt(0)
	);
	bytes[0] ^= 1;
	return `${version}.${iv}.${toB64u(bytes)}`;
};

// ── kdf.json ────────────────────────────────────────────────────────────────────────────────
async function buildKdf(): Promise<Record<string, unknown>> {
	const cases = [];
	for (const [name, base, salt, password] of [
		['light', LIGHT_KDF, SALT_LIGHT, PASSWORD_LIGHT],
		['default', DEFAULT_KDF, SALT_DEFAULT, PASSWORD_DEFAULT]
	] as const) {
		const kdf: KdfParams = { ...base, salt: toB64u(salt) };
		const { authKey, kek } = await deriveForVector(password, kdf);
		const sealed = await sealWithIvForVectors(
			kek,
			MASTER_KEY,
			masterKeyAad(USER_ID, 'password'),
			IV.kdf
		);
		cases.push({
			name,
			password,
			kdf,
			authKey,
			kekCheck: {
				description:
					'Envolvió la clave maestra fija con la kek derivada y este IV. Otra plataforma debe obtener el mismo `sealed` (o abrirlo y comparar con `masterKey`).',
				aad: masterKeyAad(USER_ID, 'password'),
				iv: toB64u(IV.kdf),
				masterKey: toB64u(MASTER_KEY),
				sealed
			}
		});
	}
	return {
		version: 1,
		description:
			'Argon2id + HKDF-SHA-256: contraseña → authKey (base64url) y kek (AES-256-GCM). El caso «default» usa 64 MiB y 3 iteraciones.',
		cases
	};
}

// ── sealed.json ─────────────────────────────────────────────────────────────────────────────
async function buildSealed(): Promise<Record<string, unknown>> {
	const key = await importAes(ITEM_KEY);
	const cases: Record<string, unknown>[] = [];
	const add = async (name: string, aad: string, plaintext: string, iv: Uint8Array) => {
		cases.push({
			name,
			key: toB64u(ITEM_KEY),
			iv: toB64u(iv),
			aad,
			plaintext,
			sealed: await sealWithIvForVectors(key, utf8(plaintext), aad, iv)
		});
	};
	await add('contexto', 'ctx', 'hola ñandú 🙂', IV.sealed);
	await add('nota-data', `apunte/v1/data/${USER_ID}/note/${NOTE_ID}`, NOTE_CONTENT, IV.noteData);
	await add('vacio', 'ctx-vacio', '', IV.item);

	const byName = (name: string) => cases.find((c) => c.name === name)!;
	return {
		version: 1,
		description:
			'AES-256-GCM con IV de 12 bytes y AAD, en formato `a1.<iv>.<ct>` (base64url sin relleno; `ct` incluye la etiqueta de 16 bytes).',
		cases,
		failures: [
			{
				name: 'aad-distinto',
				case: 'nota-data',
				aad: `apunte/v1/data/${USER_ID}/note/otra`,
				error: 'DecryptError',
				reason: 'Los datos asociados no coinciden.'
			},
			{
				name: 'texto-alterado',
				case: 'nota-data',
				sealed: tamper(byName('nota-data').sealed as Sealed),
				error: 'DecryptError',
				reason: 'Un byte del texto cifrado está cambiado; la etiqueta GCM no cuadra.'
			},
			{
				name: 'otra-clave',
				case: 'nota-data',
				key: toB64u(ITEM_KEY_2),
				error: 'DecryptError',
				reason: 'Clave distinta.'
			},
			{
				name: 'formato-version',
				case: 'nota-data',
				sealed: 'a2.AAAAAAAAAAAAAAAA.xx',
				error: 'CryptoFormatError',
				reason: 'Versión de formato desconocida.'
			},
			{
				name: 'formato-iv-corto',
				case: 'nota-data',
				sealed: 'a1.corto.xx',
				error: 'CryptoFormatError',
				reason: 'IV que no mide 12 bytes.'
			}
		]
	};
}

// ── wrap.json ───────────────────────────────────────────────────────────────────────────────
async function buildWrap(): Promise<Record<string, unknown>> {
	const kdf: KdfParams = { ...LIGHT_KDF, salt: toB64u(SALT_LIGHT) };
	const { kek } = await deriveForVector(PASSWORD_LIGHT, kdf);
	const { recoveryAuth, rkWrap } = await deriveFromRecoveryKey(RECOVERY_KEY_BYTES);
	const master = await masterKeyCrypto();

	const wrappedMasterKey = await sealWithIvForVectors(
		kek,
		MASTER_KEY,
		masterKeyAad(USER_ID, 'password'),
		IV.mkPassword
	);
	const recoveryWrappedMasterKey = await sealWithIvForVectors(
		rkWrap,
		MASTER_KEY,
		masterKeyAad(USER_ID, 'recovery'),
		IV.mkRecovery
	);
	const keys: KeyBundle = { kdf, wrappedMasterKey, recoveryWrappedMasterKey, keysVersion: 1 };

	return {
		version: 1,
		description:
			'Envoltura de claves (exportar `raw` + `seal`): la maestra con la kek de la contraseña y con la clave de recuperación, y una clave de elemento con la maestra.',
		userId: USER_ID,
		keyBundle: keys,
		password: PASSWORD_LIGHT,
		recoveryAuth,
		recoveryKey: formatRecoveryKey(RECOVERY_KEY_BYTES),
		cases: [
			{
				name: 'maestra-con-kek',
				wrapping: 'kek de la contraseña',
				password: PASSWORD_LIGHT,
				kdf,
				aad: masterKeyAad(USER_ID, 'password'),
				iv: toB64u(IV.mkPassword),
				plaintextKey: toB64u(MASTER_KEY),
				sealed: wrappedMasterKey
			},
			{
				name: 'maestra-con-clave-de-recuperacion',
				wrapping: 'rkWrap',
				recoveryBytes: toB64u(RECOVERY_KEY_BYTES),
				aad: masterKeyAad(USER_ID, 'recovery'),
				iv: toB64u(IV.mkRecovery),
				plaintextKey: toB64u(MASTER_KEY),
				sealed: recoveryWrappedMasterKey
			},
			{
				name: 'elemento-con-maestra',
				wrapping: 'clave maestra',
				masterKey: toB64u(MASTER_KEY),
				aad: `apunte/v1/key/${USER_ID}/note/${NOTE_ID}`,
				iv: toB64u(IV.item),
				plaintextKey: toB64u(ITEM_KEY),
				sealed: await sealWithIvForVectors(
					master,
					ITEM_KEY,
					`apunte/v1/key/${USER_ID}/note/${NOTE_ID}`,
					IV.item
				)
			}
		]
	};
}

// ── trusted-device.json ─────────────────────────────────────────────────────────────────────
/**
 * Dispositivo de confianza (D16): la clave maestra va cifrada con una clave propia del navegador y
 * los datos asociados nuevos `apunte/v1/mk/<userId>/trusted/<trustId>`. La clave del dispositivo
 * (`TRUSTED_KEY`) es fija **solo** para el vector: en la app es AES-GCM no exportable.
 */
async function buildTrustedDevice(): Promise<Record<string, unknown>> {
	const deviceKey = await importAes(TRUSTED_KEY);
	const aad = trustedDeviceAad(USER_ID, TRUST_ID);
	const sealed = await sealWithIvForVectors(deviceKey, MASTER_KEY, aad, IV.trusted);
	return {
		version: 1,
		description:
			'Clave maestra envuelta con la clave de un dispositivo de confianza. El AAD liga la envoltura a la cuenta y al dispositivo; sin la clave local (no exportable en el navegador) no se puede abrir.',
		userId: USER_ID,
		trustId: TRUST_ID,
		case: {
			name: 'dispositivo-de-confianza',
			wrapping: 'clave del dispositivo',
			deviceKey: toB64u(TRUSTED_KEY),
			aad,
			iv: toB64u(IV.trusted),
			plaintextKey: toB64u(MASTER_KEY),
			sealed
		}
	};
}

// ── recovery-key.json ───────────────────────────────────────────────────────────────────────
function buildRecoveryKey(): Record<string, unknown> {
	const bytes = RECOVERY_KEY_BYTES;
	const text = formatRecoveryKey(bytes);
	const stripped = text.replaceAll('-', '');
	const last = stripped.at(-1);
	const badControl = `${stripped.slice(0, -1)}${last === '0' ? '1' : '0'}`;
	const badChar = `${stripped.slice(0, 5)}!${stripped.slice(6)}`;
	return {
		version: 1,
		description:
			'Clave de recuperación: 32 bytes ↔ 52 caracteres Crockford base32 + 1 de control, en grupos de 4. `tolerant` debe producir los mismos bytes que `cases`; `invalid` debe lanzar CryptoFormatError.',
		cases: [
			{
				name: 'ceros',
				bytes: toB64u(new Uint8Array(32)),
				text: formatRecoveryKey(new Uint8Array(32))
			},
			{ name: 'patron', bytes: toB64u(bytes), text }
		],
		tolerant: [
			{
				name: 'minusculas-y-espacios',
				text: text.toLowerCase().replaceAll('-', ' '),
				bytes: toB64u(bytes)
			},
			{
				name: 'confusiones-o-0-i-l-1',
				text: text.replaceAll('0', 'O').replaceAll('1', 'I'),
				bytes: toB64u(bytes)
			}
		],
		invalid: [
			{
				name: 'longitud',
				text: stripped.slice(1),
				error: 'CryptoFormatError',
				message: 'longitud inválida'
			},
			{
				name: 'digito-de-control',
				text: badControl,
				error: 'CryptoFormatError',
				message: 'dígito de control incorrecto'
			},
			{ name: 'caracter', text: badChar, error: 'CryptoFormatError', message: 'carácter inválido' }
		]
	};
}

// ── padding.json ────────────────────────────────────────────────────────────────────────────
function buildPadding(): Record<string, unknown> {
	const lengths = [0, 1, 2, 255, 256, 257, 511, 512, 513, 1000].map((input) => ({
		input,
		padded: pad(new Uint8Array(input)).length
	}));
	const raw = '{"a":1}';
	const padded = pad(utf8(raw));
	return {
		version: 1,
		description:
			'Relleno a múltiplos de 256 bytes con espacios (0x20). `unpad` muestra que al leer se recorta el espacio final.',
		block: 256,
		lengths,
		unpad: { padded: toB64u(padded), paddedLength: padded.length, text: unpadJson(padded) }
	};
}

// ── note-payload.json ───────────────────────────────────────────────────────────────────────
async function buildNotePayload(): Promise<Record<string, unknown>> {
	const vault = await unlockedVault();
	const master = await masterKeyCrypto();
	const itemKey = await importAes(ITEM_KEY);
	const keyAad = vault.keyAad('note', NOTE_ID);
	const dataAad = vault.dataAad('note', NOTE_ID);
	const wrappedKey = await sealWithIvForVectors(master, ITEM_KEY, keyAad, IV.noteKey);
	const payload: NotePayload = {
		title: NOTE_TITLE,
		content: NOTE_CONTENT,
		tags: NOTE_TAGS,
		pinned: NOTE_PINNED
	};
	const plaintext = encodeNotePayload(payload);
	const sealedPayload = await sealWithIvForVectors(itemKey, plaintext, dataAad, IV.noteData);
	const encrypted: EncryptedNote = {
		id: NOTE_ID,
		folderId: FOLDER_ID,
		createdAt: CREATED_AT,
		updatedAt: UPDATED_AT,
		deletedAt: null,
		revision: 3,
		lastEditedDeviceId: DEVICE_ID,
		wrappedKey,
		payload: sealedPayload
	};

	const folderKeyAad = vault.keyAad('folder', FOLDER_ID);
	const folderDataAad = vault.dataAad('folder', FOLDER_ID);
	const wrappedFolderKey = await sealWithIvForVectors(
		master,
		pattern(9, 32),
		folderKeyAad,
		IV.folderKey
	);
	const folderPayload = await sealWithIvForVectors(
		await importAes(pattern(9, 32)),
		encodeFolderPayload({ name: FOLDER_NAME }),
		folderDataAad,
		IV.folderData
	);
	const encryptedFolder: EncryptedFolder = {
		id: FOLDER_ID,
		createdAt: CREATED_AT,
		updatedAt: UPDATED_AT,
		revision: 2,
		wrappedKey: wrappedFolderKey,
		payload: folderPayload
	};

	return {
		version: 1,
		description:
			'Nota y carpeta cifradas tal y como las produce `note-codec`: `wrappedKey` (clave del elemento con la maestra) y `payload` (JSON rellenado y cifrado con la clave del elemento). El camino inverso (`decrypted`) lo calcula `decryptNote`/`decryptFolder`.',
		userId: USER_ID,
		masterKey: toB64u(MASTER_KEY),
		note: {
			id: NOTE_ID,
			itemKey: toB64u(ITEM_KEY),
			keyAad,
			keyIv: toB64u(IV.noteKey),
			wrappedKey,
			dataAad,
			dataIv: toB64u(IV.noteData),
			plaintextJson: unpadJson(plaintext),
			payload: sealedPayload,
			encrypted,
			decrypted: await decryptNote(vault, encrypted, 'synced')
		},
		folder: {
			id: FOLDER_ID,
			itemKey: toB64u(pattern(9, 32)),
			keyAad: folderKeyAad,
			keyIv: toB64u(IV.folderKey),
			wrappedKey: wrappedFolderKey,
			dataAad: folderDataAad,
			dataIv: toB64u(IV.folderData),
			plaintextJson: '{"name":"' + FOLDER_NAME + '"}',
			payload: folderPayload,
			encrypted: encryptedFolder,
			decrypted: await decryptFolder(vault, encryptedFolder)
		}
	};
}

// ── share.json ──────────────────────────────────────────────────────────────────────────────
async function buildShare(): Promise<Record<string, unknown>> {
	const master = await masterKeyCrypto();
	const shareKey = await importAes(SHARE_KEY);
	const keyAad = shareKeyAad(USER_ID, NOTE_ID);
	const contentAad = shareContentAad(SLUG);
	const wrappedShareKey = await sealWithIvForVectors(master, SHARE_KEY, keyAad, IV.shareKey);
	const plaintext = pad(utf8(JSON.stringify({ title: SHARE_TITLE, content: SHARE_CONTENT })));
	const payload = await sealWithIvForVectors(shareKey, plaintext, contentAad, IV.sharePayload);
	const shared: SharedNote = {
		id: SHARE_ID,
		noteId: NOTE_ID,
		slug: SLUG,
		wrappedShareKey,
		payload,
		createdAt: CREATED_AT,
		updatedAt: UPDATED_AT
	};
	const keyFragment = `#k=${toB64u(SHARE_KEY)}`;
	return {
		version: 1,
		description:
			'Enlace público: la copia (`{title, content}` rellenada) se cifra con una clave propia del enlace y el AAD del slug; la clave va en el fragmento `#k=` (base64url) y, cifrada con la maestra, en `wrappedShareKey`.',
		origin: 'https://apunte.app',
		userId: USER_ID,
		noteId: NOTE_ID,
		note: { title: SHARE_TITLE, content: SHARE_CONTENT },
		masterKey: toB64u(MASTER_KEY),
		slug: SLUG,
		shareKey: toB64u(SHARE_KEY),
		keyAad,
		keyIv: toB64u(IV.shareKey),
		wrappedShareKey,
		contentAad,
		payloadIv: toB64u(IV.sharePayload),
		payload,
		keyFragment,
		url: await shareUrl(shared, shareKey),
		decrypted: await openSharedNote(SLUG, toB64u(SHARE_KEY), payload, UPDATED_AT)
	};
}

// ── sync.json ───────────────────────────────────────────────────────────────────────────────
async function buildSync(): Promise<Record<string, unknown>> {
	const vault = await unlockedVault();
	const master = await masterKeyCrypto();

	const note = await buildEncryptedNote(vault, master, {
		id: NOTE_ID,
		itemKeyBytes: ITEM_KEY,
		keyIv: IV.noteKey,
		dataIv: IV.noteData,
		payload: { title: NOTE_TITLE, content: NOTE_CONTENT, tags: NOTE_TAGS, pinned: NOTE_PINNED },
		folderId: FOLDER_ID,
		revision: 3
	});
	const note2 = await buildEncryptedNote(vault, master, {
		id: NOTE_ID_2,
		itemKeyBytes: ITEM_KEY_2,
		keyIv: IV.note2Key,
		dataIv: IV.note2Data,
		payload: { title: NOTE_2_TITLE, content: NOTE_2_CONTENT, tags: [], pinned: false },
		folderId: null,
		revision: 7
	});
	const folderItemKey = pattern(9, 32);
	const folderWrappedKey = await sealWithIvForVectors(
		master,
		folderItemKey,
		vault.keyAad('folder', FOLDER_ID),
		IV.folderKey
	);
	const folderPayload = await sealWithIvForVectors(
		await importAes(folderItemKey),
		encodeFolderPayload({ name: FOLDER_NAME }),
		vault.dataAad('folder', FOLDER_ID),
		IV.folderData
	);

	const noteFields = {
		folderId: note.folderId,
		createdAt: note.createdAt,
		updatedAt: note.updatedAt,
		deletedAt: note.deletedAt,
		wrappedKey: note.wrappedKey,
		payload: note.payload
	};

	return {
		version: 1,
		description:
			'Ejemplos de `EncryptedSyncRequest` y `EncryptedSyncResponse` (ver `domain/sync-protocol.ts` y `docs/api/openapi.yaml`): subida de una nota, lápida de carpeta, bajada con `hasMore: true` y conflicto en la última página.',
		userId: USER_ID,
		masterKey: toB64u(MASTER_KEY),
		request: {
			deviceId: DEVICE_ID,
			deviceName: 'Portátil de Ana',
			cursor: null,
			changes: [
				{ entity: 'note', id: NOTE_ID, op: 'upsert', baseRevision: 0, data: noteFields },
				{ entity: 'folder', id: FOLDER_ID, op: 'delete', baseRevision: 2 }
			]
		},
		responses: [
			{
				name: 'con-mas-cambios',
				cursor: 'cursor-2',
				hasMore: true,
				applied: [{ entity: 'note', id: NOTE_ID, revision: 1 }],
				remoteChanges: [
					{ entity: 'note', id: NOTE_ID_2, deleted: false, revision: 7, note: note2 },
					{ entity: 'folder', id: FOLDER_ID, deleted: true, revision: 3 }
				],
				conflicts: []
			},
			{
				name: 'final-con-conflicto',
				cursor: 'cursor-3',
				hasMore: false,
				applied: [],
				remoteChanges: [
					{
						entity: 'folder',
						id: FOLDER_ID,
						deleted: false,
						revision: 3,
						folder: {
							id: FOLDER_ID,
							createdAt: CREATED_AT,
							updatedAt: UPDATED_AT,
							revision: 3,
							wrappedKey: folderWrappedKey,
							payload: folderPayload
						}
					}
				],
				conflicts: [
					{
						noteId: NOTE_ID,
						remote: note,
						remoteDeviceName: 'Móvil de Ana'
					}
				]
			}
		]
	};
}

interface NoteSeed {
	id: Id;
	itemKeyBytes: Uint8Array<ArrayBuffer>;
	keyIv: Uint8Array<ArrayBuffer>;
	dataIv: Uint8Array<ArrayBuffer>;
	payload: NotePayload;
	folderId: Id | null;
	revision: number;
}

async function buildEncryptedNote(
	vault: Vault,
	master: CryptoKey,
	seed: NoteSeed
): Promise<EncryptedNote> {
	const wrappedKey = await sealWithIvForVectors(
		master,
		seed.itemKeyBytes,
		vault.keyAad('note', seed.id),
		seed.keyIv
	);
	return {
		id: seed.id,
		folderId: seed.folderId,
		createdAt: CREATED_AT,
		updatedAt: UPDATED_AT,
		deletedAt: null,
		revision: seed.revision,
		lastEditedDeviceId: DEVICE_ID,
		wrappedKey,
		payload: await sealWithIvForVectors(
			await importAes(seed.itemKeyBytes),
			encodeNotePayload(seed.payload),
			vault.dataAad('note', seed.id),
			seed.dataIv
		)
	};
}

// ── README y serialización ──────────────────────────────────────────────────────────────────
const README = `# Vectores de prueba compartidos

> **SOLO PRUEBAS: todas las claves, contraseñas y sales de estos archivos son públicas; no usar jamás en una cuenta real.**

Propósito: fijar el formato criptográfico de AxoNote para que las apps nativas (escritorio Tauri,
móvil) y la web comprueben que leen y escriben **exactamente los mismos bytes**. Cada JSON lleva
\`version: 1\`. Se generan de forma determinista con \`pnpm vectors:generate\` y se comprueban en
\`pnpm test:unit --run\`: si el formato cambia, las pruebas fallan hasta regenerar y revisar el diff.

## Formato

- **Contraseña → claves.** \`stretched = Argon2id(password.normalize('NFKC') en UTF-8, salt, m=memoryKiB, t=iterations, p=parallelism, len=32)\`.
  Después, HKDF-SHA-256 con \`salt\` de 32 bytes a cero:
  \`authKey = HKDF(stretched, info="apunte/v1/auth", 32 bytes)\` (base64url) y
  \`kek = HKDF(stretched, info="apunte/v1/kek", AES-256-GCM, no exportable)\`.
- **Clave de recuperación.** 32 bytes aleatorios. De ella:
  \`recoveryAuth = HKDF(RK, "apunte/v1/recovery-auth", 32 bytes)\` y
  \`rkWrap = HKDF(RK, "apunte/v1/recovery-kek", AES-256-GCM)\`.
- **Texto cifrado.** \`a1.<iv>.<ct>\`: \`iv\` de 12 bytes y \`ct\` = texto + etiqueta GCM de 16 bytes,
  ambos en base64url **sin relleno**.
- **AAD.** AES-GCM con \`additionalData\`; cada vector indica el \`aad\` exacto.
- **Relleno.** El JSON del payload se rellena con espacios (0x20) hasta el siguiente múltiplo de 256 bytes.
- **Clave de recuperación legible.** 52 caracteres Crockford base32 (256 bits desplazados 4 a la
  izquierda; los 4 bits bajos quedan a cero) + 1 carácter de control
  (\`alfabeto[valor % 37]\`, alfabeto \`0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U\`), en grupos de 4
  separados por \`-\` (el último grupo tiene 1 carácter). Al leer se toleran minúsculas, espacios,
  guiones, \`O→0\`, \`I/L→1\`.

## Cómo verificar cada archivo en otra plataforma

- **kdf.json.** Deriva con Argon2id + HKDF y comprueba \`authKey\`. Para validar la \`kek\`, abre
  \`kekCheck.sealed\` con la \`kek\`, el \`kekCheck.aad\` y ese IV, y compara con \`kekCheck.masterKey\`
  (o vuelve a cifrar esa clave con el mismo IV y compara). \`password\` se normaliza a NFKC.
- **sealed.json.** Abre cada \`sealed\` con \`key\` + \`aad\` y compara con \`plaintext\` en UTF-8. Cada
  \`failures\` debe lanzar el error indicado (\`DecryptError\` o \`CryptoFormatError\`).
- **wrap.json.** Deriva/importa la clave de envoltura (contraseña, clave de recuperación o maestra),
  abre \`sealed\` con \`aad\` y compara con \`plaintextKey\`. \`keyBundle\` + \`password\` debe abrir la
  maestra (\`unlockWithPassword\`).
- **trusted-device.json.** Dispositivo de confianza (D16): abre \`case.sealed\` con \`case.deviceKey\`,
  \`case.aad\` y el IV y compara con \`case.plaintextKey\`. El AAD es
  \`apunte/v1/mk/<userId>/trusted/<trustId>\`.
- **recovery-key.json.** \`format\` de bytes → texto; \`tolerant\` → los mismos bytes; \`invalid\` → error.
- **padding.json.** Comprueba \`lengths\` y \`unpad\`.
- **note-payload.json.** Descifra \`wrappedKey\` con la maestra y \`payload\` con la clave del elemento
  (AAD y IV indicados); el resultado es \`plaintextJson\` y, tras validar la forma, \`decrypted\`.
- **share.json.** Abre \`payload\` con \`shareKey\` y \`contentAad\`; la URL se reconstruye como
  \`origin + "/n/" + slug + keyFragment\`.
- **sync.json.** Estructura de \`EncryptedSyncRequest\`/\`EncryptedSyncResponse\`; las notas y carpetas
  llevan \`wrappedKey\`/\`payload\` y se descifran con \`masterKey\`.
- **markdown.json.** Casos de Markdown: \`canonical = serializar(analizar(input))\` con el mismo editor
  (TipTap 3) sin interfaz. \`canonical\` es idempotente. Con \`supported: false\` el bloque queda fuera del
  conjunto que edita el móvil y debe conservarse intacto (bloque opaco).
- **sync-behavior.json.** Escenarios del motor de sincronización (outbox + repositorio local + servidor
  simulado) con reloj e ids fijos. Cada escenario trae \`steps\` (con \`device\` a/b) y \`expected\`, el estado
  lógico del dispositivo \`a\` tras cada paso (id, título, texto, revisión, estado, cola, conflictos, cursor).
`;

/** Vectores en memoria. Deterministas: el mismo resultado en cada ejecución. */
export async function buildVectors(): Promise<Record<string, Record<string, unknown>>> {
	return {
		'kdf.json': await buildKdf(),
		'sealed.json': await buildSealed(),
		'wrap.json': await buildWrap(),
		'trusted-device.json': await buildTrustedDevice(),
		'recovery-key.json': buildRecoveryKey(),
		'padding.json': buildPadding(),
		'note-payload.json': await buildNotePayload(),
		'share.json': await buildShare(),
		'sync.json': await buildSync(),
		'markdown.json': buildMarkdownVector(),
		'sync-behavior.json': await buildSyncBehaviorVector()
	};
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			out[key] = sortKeys((value as Record<string, unknown>)[key]);
		}
		return out;
	}
	return value;
}

/** JSON canónico: claves ordenadas, indentación de 2 espacios y salto de línea final. */
export function serializeVector(vector: Record<string, unknown>): string {
	return `${JSON.stringify(sortKeys(vector), null, 2)}\n`;
}

/** Todos los archivos que deben quedar en `docs/api/vectors` (JSON + README). */
export async function buildVectorFiles(): Promise<Record<string, string>> {
	const vectors = await buildVectors();
	const files: Record<string, string> = { 'README.md': README };
	for (const [name, vector] of Object.entries(vectors)) files[name] = serializeVector(vector);
	return files;
}
