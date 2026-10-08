import type { KeyBundle } from '#lib/domain/index.js';

// Generado una vez con las primitivas reales (`demo-keys.spec.ts` comprueba que siguen siendo coherentes).
// Solo para el simulador: contiene la clave maestra en claro para cifrar los datos de ejemplo.

export const DEMO_KEYS: KeyBundle = {
	kdf: {
		alg: 'argon2id',
		memoryKiB: 1024,
		iterations: 1,
		parallelism: 1,
		salt: 'EREREREREREREREREREREQ'
	},
	wrappedMasterKey:
		'a1.CNaoTV80E_5MfWbM.RKgZxDJg0CyThgENMVFSkkxTsFMTF4Wt7lkZrjzJkYwzNHOgZN1rq2f8qCRRlfOm',
	recoveryWrappedMasterKey:
		'a1.Ul4V8lPB8zBwLabr.eSNuKXJ917wNNgx97wIpBUunLL8VMKOzQ3NzDe7ObWmp0Y7MemgkAVoAZXbxv0Vd',
	keysVersion: 1
};
export const DEMO_AUTH_KEY_HASH = 'ndxNZW05Ac1j6EKRSkAvvVrNWU9G_zWc1TWBgDlaYIA';
export const DEMO_RECOVERY_AUTH_HASH = 'zV4Uws-isgjqCUIgLD6uRlSj6IXu-xnG_WbOOb4goas';
export const DEMO_RECOVERY_KEY =
	'XA92-KW7Q-9S0P-2619-ZRRE-NX96-BMDD-MWQJ-R2S7-FCV8-BJM3-DKRV-75W0-7';
export const DEMO_MASTER_KEY_RAW = 'OpJJdlRjUaH6uapm3mUcqVhCeh74qTS-EXLp0Lrdzpg';
