import { argon2id } from 'hash-wasm';
import { describe, expect, it } from 'vitest';
import {
	CryptoFormatError,
	DEFAULT_KDF,
	DecryptError,
	deriveFromPassword,
	deriveFromRecoveryKey,
	formatRecoveryKey,
	fromB64u,
	fromUtf8,
	generateDeviceKey,
	generateItemKey,
	generateMasterKey,
	generateRecoveryKey,
	importRawForShare,
	exportRawForShare,
	isSealed,
	newKdfParams,
	open,
	pad,
	parseRecoveryKey,
	randomBytes,
	seal,
	timingSafeEqual,
	toB64u,
	unpadJson,
	unwrap,
	utf8,
	wrap
} from './index.js';

/** Parámetros ligeros: las pruebas no necesitan 64 MiB. */
const LIGHT = { alg: 'argon2id', memoryKiB: 1024, iterations: 1, parallelism: 1 } as const;

describe('bytes', () => {
	it('base64url ida y vuelta, sin relleno ni + /', () => {
		for (const length of [0, 1, 2, 3, 4, 31, 32, 33]) {
			const bytes = randomBytes(length);
			const text = toB64u(bytes);
			expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
			expect(fromB64u(text)).toEqual(bytes);
		}
	});

	it('rechaza texto que no es base64url', () => {
		expect(() => fromB64u('a+b/')).toThrow(CryptoFormatError);
		expect(() => fromB64u('abc=')).toThrow(CryptoFormatError);
		expect(() => fromB64u('a')).toThrow(CryptoFormatError);
	});

	it('timingSafeEqual', () => {
		expect(timingSafeEqual(utf8('abc'), utf8('abc'))).toBe(true);
		expect(timingSafeEqual(utf8('abc'), utf8('abd'))).toBe(false);
		expect(timingSafeEqual(utf8('abc'), utf8('ab'))).toBe(false);
	});
});

describe('seal / open', () => {
	it('ida y vuelta con el formato a1.<iv>.<ct>', async () => {
		const key = await generateItemKey();
		const sealed = await seal(key, utf8('hola ñandú 🙂'), 'ctx');
		expect(sealed).toMatch(/^a1\./);
		expect(isSealed(sealed)).toBe(true);
		expect(fromUtf8(await open(key, sealed, 'ctx'))).toBe('hola ñandú 🙂');
	});

	it('dos cifrados del mismo texto son distintos (IV aleatorio)', async () => {
		const key = await generateItemKey();
		expect(await seal(key, utf8('x'), 'ctx')).not.toBe(await seal(key, utf8('x'), 'ctx'));
	});

	it('otra clave, otros datos asociados o un byte alterado → DecryptError', async () => {
		const key = await generateItemKey();
		const sealed = await seal(key, utf8('secreto'), 'ctx');
		await expect(open(await generateItemKey(), sealed, 'ctx')).rejects.toThrow(DecryptError);
		await expect(open(key, sealed, 'otro')).rejects.toThrow(DecryptError);

		const [v, iv, ct] = sealed.split('.');
		const bytes = fromB64u(ct);
		bytes[0] ^= 1;
		await expect(open(key, `${v}.${iv}.${toB64u(bytes)}`, 'ctx')).rejects.toThrow(DecryptError);
	});

	it('un texto con formato inválido → CryptoFormatError', async () => {
		const key = await generateItemKey();
		for (const bad of ['', 'hola', 'a2.AAAAAAAAAAAAAAAA.xx', 'a1.corto.xx', 'a1.AAAAAAAAAAAAAAAA.'])
			await expect(open(key, bad, 'ctx')).rejects.toThrow(CryptoFormatError);
		expect(isSealed(42)).toBe(false);
	});
});

describe('relleno', () => {
	it('deja un múltiplo de 256 y se quita al leer', () => {
		for (const length of [0, 1, 255, 256, 257, 1000]) {
			const json = JSON.stringify({ t: 'x'.repeat(Math.max(0, length - 8)) });
			const padded = pad(utf8(json));
			expect(padded.length % 256).toBe(0);
			expect(padded.length).toBeGreaterThanOrEqual(json.length);
			expect(unpadJson(padded)).toBe(json);
		}
	});

	it('textos del mismo tramo tienen el mismo tamaño', () => {
		expect(pad(utf8('{"a":1}')).length).toBe(pad(utf8('{"a":12345}')).length);
	});
});

describe('Argon2id y HKDF', () => {
	it('vector fijo: detecta cambios de librería', async () => {
		const hash = await argon2id({
			password: utf8('correct horse battery staple'),
			salt: new Uint8Array(16).map((_, i) => i),
			memorySize: 1024,
			iterations: 1,
			parallelism: 1,
			hashLength: 32,
			outputType: 'hex'
		});
		expect(hash).toBe('f0d1525842159cef972608e2f8bc1cb2c8230f81eea76f124789f6beb42403b2');
	});

	it('es determinista con los mismos parámetros y cambia con otra sal o contraseña', async () => {
		const params = newKdfParams(LIGHT);
		const a = await deriveFromPassword('contraseña-1', params);
		const b = await deriveFromPassword('contraseña-1', params);
		const otherPassword = await deriveFromPassword('contraseña-2', params);
		const otherSalt = await deriveFromPassword('contraseña-1', newKdfParams(LIGHT));
		expect(a.authKey).toBe(b.authKey);
		expect(a.authKey).not.toBe(otherPassword.authKey);
		expect(a.authKey).not.toBe(otherSalt.authKey);
		expect(fromB64u(a.authKey)).toHaveLength(32);
	});

	it('la sal no depende del correo y es de 16 bytes', () => {
		const a = newKdfParams();
		expect(a).toMatchObject(DEFAULT_KDF);
		expect(fromB64u(a.salt)).toHaveLength(16);
		expect(newKdfParams().salt).not.toBe(a.salt);
	});

	it('authKey y kek están separadas: lo que ve el servidor no abre nada', async () => {
		const params = newKdfParams(LIGHT);
		const { authKey, kek } = await deriveFromPassword('una contraseña', params);
		const sealed = await seal(kek, utf8('clave'), 'ctx');
		// El servidor conoce authKey: usarla como clave AES tampoco descifra.
		const asKey = await crypto.subtle.importKey('raw', fromB64u(authKey), 'AES-GCM', false, [
			'decrypt'
		]);
		await expect(open(asKey, sealed, 'ctx')).rejects.toThrow(DecryptError);
		expect(await open(kek, sealed, 'ctx')).toEqual(utf8('clave'));
	});

	it('con los parámetros por defecto también funciona', async () => {
		const { authKey } = await deriveFromPassword('x', newKdfParams());
		expect(fromB64u(authKey)).toHaveLength(32);
	}, 20_000);

	it('la clave de recuperación da una prueba y una clave propias', async () => {
		const rk = generateRecoveryKey();
		const a = await deriveFromRecoveryKey(rk);
		const b = await deriveFromRecoveryKey(rk);
		const other = await deriveFromRecoveryKey(generateRecoveryKey());
		expect(a.recoveryAuth).toBe(b.recoveryAuth);
		expect(a.recoveryAuth).not.toBe(other.recoveryAuth);
		const sealed = await seal(a.rkWrap, utf8('mk'), 'ctx');
		expect(await open(b.rkWrap, sealed, 'ctx')).toEqual(utf8('mk'));
		await expect(open(other.rkWrap, sealed, 'ctx')).rejects.toThrow(DecryptError);
	});
});

describe('claves', () => {
	it('envolver y desenvolver la clave maestra con la kek; con otro AAD falla', async () => {
		const { kek } = await deriveFromPassword('pw', newKdfParams(LIGHT));
		const master = await generateMasterKey();
		const wrapped = await wrap(kek, master, 'apunte/v1/mk/u/password');
		const back = await unwrap(kek, wrapped, 'apunte/v1/mk/u/password');
		const sealed = await seal(master, utf8('nota'), 'ctx');
		expect(fromUtf8(await open(back, sealed, 'ctx'))).toBe('nota');
		await expect(unwrap(kek, wrapped, 'apunte/v1/mk/u/recovery')).rejects.toThrow(DecryptError);
	});

	it('una clave de elemento se envuelve con la maestra', async () => {
		const master = await generateMasterKey();
		const item = await generateItemKey();
		const wrapped = await wrap(master, item, 'apunte/v1/key/u/note/1');
		const sealed = await seal(item, utf8('contenido'), 'apunte/v1/data/u/note/1');
		const back = await unwrap(master, wrapped, 'apunte/v1/key/u/note/1');
		expect(fromUtf8(await open(back, sealed, 'apunte/v1/data/u/note/1'))).toBe('contenido');
	});

	it('la clave de dispositivo no se puede exportar', async () => {
		const device = await generateDeviceKey();
		expect(device.extractable).toBe(false);
		await expect(crypto.subtle.exportKey('raw', device)).rejects.toThrow();
		// Pero sí envuelve la clave maestra.
		const master = await generateMasterKey();
		expect(isSealed(await wrap(device, master, 'ctx'))).toBe(true);
	});

	it('la clave de un enlace viaja en base64url y solo descifra', async () => {
		const key = await generateItemKey();
		const sealed = await seal(key, utf8('pública'), 'apunte/v1/share/n1');
		const imported = await importRawForShare(await exportRawForShare(key));
		expect(fromUtf8(await open(imported, sealed, 'apunte/v1/share/n1'))).toBe('pública');
		await expect(seal(imported, utf8('x'), 'ctx')).rejects.toThrow();
		expect(() => importRawForShare('AAAA')).toThrow(CryptoFormatError);
	});
});

describe('clave de recuperación', () => {
	it('formato legible: grupos de 4 y ida y vuelta', () => {
		const rk = generateRecoveryKey();
		const text = formatRecoveryKey(rk);
		expect(text).toMatch(/^([0-9A-Z*~$=]{4}-){13}[0-9A-Z*~$=]$/);
		expect(parseRecoveryKey(text)).toEqual(rk);
	});

	it('tolera minúsculas, espacios y confusiones O/0 I/L/1', () => {
		const rk = generateRecoveryKey();
		const text = formatRecoveryKey(rk);
		expect(parseRecoveryKey(text.toLowerCase().replaceAll('-', ' '))).toEqual(rk);
		expect(parseRecoveryKey(text.replaceAll('0', 'o').replaceAll('1', 'l'))).toEqual(rk);
	});

	it('un carácter cambiado o una longitud incorrecta → error', () => {
		const rk = generateRecoveryKey();
		const text = formatRecoveryKey(rk).replaceAll('-', '');
		const i = 10;
		const changed = text[i] === '2' ? '3' : '2';
		expect(() => parseRecoveryKey(text.slice(0, i) + changed + text.slice(i + 1))).toThrow(
			CryptoFormatError
		);
		expect(() => parseRecoveryKey(text.slice(1))).toThrow(CryptoFormatError);
		expect(() => parseRecoveryKey('')).toThrow(CryptoFormatError);
		expect(() => formatRecoveryKey(new Uint8Array(16))).toThrow(CryptoFormatError);
	});

	it('claves de 256 bits distintas dan textos distintos', () => {
		expect(formatRecoveryKey(generateRecoveryKey())).not.toBe(
			formatRecoveryKey(generateRecoveryKey())
		);
	});
});
