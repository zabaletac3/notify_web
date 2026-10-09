import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { fromUtf8, generateMasterKey, open, seal, utf8 } from '#lib/core/crypto/index.js';
import { TrustedDeviceStore, trustedDeviceAad } from './trusted-device-keys.js';

let n = 0;
const store = () => new TrustedDeviceStore(`trusted-test-${++n}`);

describe('TrustedDeviceStore', () => {
	it('envuelve la clave maestra, la guarda y la vuelve a descifrar', async () => {
		const s = store();
		const master = await generateMasterKey();
		const prepared = await s.prepare('u1', master);
		expect(prepared.wrappedMasterKey).toMatch(/^a1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
		// Preparar no guarda nada hasta que el servidor acepta.
		expect(await s.get('u1')).toBeNull();

		await s.save('u1', prepared.trustId, prepared.deviceKey);
		expect(await s.get('u1')).toMatchObject({ trustId: prepared.trustId });

		const unwrapped = await s.unwrap('u1', prepared.trustId, prepared.wrappedMasterKey);
		expect(unwrapped).not.toBeNull();
		const sealed = await seal(master, utf8('nota'), 'ctx');
		expect(fromUtf8(await open(unwrapped!, sealed, 'ctx'))).toBe('nota');
	});

	it('no descifra si la fila no existe, el trustId no coincide o el AAD es distinto', async () => {
		const s = store();
		const master = await generateMasterKey();
		const prepared = await s.prepare('u1', master);
		expect(await s.unwrap('u1', prepared.trustId, prepared.wrappedMasterKey)).toBeNull();

		await s.save('u1', prepared.trustId, prepared.deviceKey);
		expect(await s.unwrap('u1', 'otro', prepared.wrappedMasterKey)).toBeNull();

		const otra = await s.prepare('u1', master);
		expect(await s.unwrap('u1', prepared.trustId, otra.wrappedMasterKey)).toBeNull();
	});

	it('remove devuelve el trustId y borra la fila; la clave de una cuenta no se lee como otra', async () => {
		const s = store();
		const master = await generateMasterKey();
		const prepared = await s.prepare('u1', master);
		await s.save('u1', prepared.trustId, prepared.deviceKey);
		expect(await s.remove('u1')).toBe(prepared.trustId);
		expect(await s.get('u1')).toBeNull();
		expect(await s.remove('u1')).toBeNull();
	});

	it('el AAD nuevo liga la cuenta y el dispositivo', () => {
		expect(trustedDeviceAad('u1', 't1')).toBe('apunte/v1/mk/u1/trusted/t1');
	});
});
