import { describe, expect, it } from 'vitest';
import {
	deriveFromPassword,
	deriveFromRecoveryKey,
	importMasterKeyRaw,
	open,
	parseRecoveryKey,
	seal,
	toB64u,
	unwrap,
	utf8
} from '#lib/core/crypto/index.js';
import { masterKeyAad } from '#lib/data/crypto/index.js';
import {
	DEMO_AUTH_KEY_HASH,
	DEMO_KEYS,
	DEMO_MASTER_KEY_RAW,
	DEMO_RECOVERY_AUTH_HASH,
	DEMO_RECOVERY_KEY
} from './demo-keys.js';
import { DEMO_USER_ID, DEMO_USER_PASSWORD } from '../mock-database.js';

const sha = async (s: string) =>
	toB64u(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(s))));

describe('cuenta de ejemplo', () => {
	it('la contraseña de ejemplo abre la clave maestra de ejemplo', async () => {
		const { authKey, kek } = await deriveFromPassword(DEMO_USER_PASSWORD, DEMO_KEYS.kdf);
		expect(await sha(authKey)).toBe(DEMO_AUTH_KEY_HASH);
		const mk = await unwrap(
			kek,
			DEMO_KEYS.wrappedMasterKey,
			masterKeyAad(DEMO_USER_ID, 'password')
		);
		// Es la misma clave que la guardada en claro para cifrar los datos de ejemplo.
		const sealed = await seal(await importMasterKeyRaw(DEMO_MASTER_KEY_RAW), utf8('x'), 'ctx');
		expect(await open(mk, sealed, 'ctx')).toEqual(utf8('x'));
	});

	it('la clave de recuperación de ejemplo abre la misma clave maestra', async () => {
		const { recoveryAuth, rkWrap } = await deriveFromRecoveryKey(
			parseRecoveryKey(DEMO_RECOVERY_KEY)
		);
		expect(await sha(recoveryAuth)).toBe(DEMO_RECOVERY_AUTH_HASH);
		const mk = await unwrap(
			rkWrap,
			DEMO_KEYS.recoveryWrappedMasterKey,
			masterKeyAad(DEMO_USER_ID, 'recovery')
		);
		const sealed = await seal(await importMasterKeyRaw(DEMO_MASTER_KEY_RAW), utf8('y'), 'ctx');
		expect(await open(mk, sealed, 'ctx')).toEqual(utf8('y'));
	});
});
