import {
	deriveFromPassword,
	deriveFromRecoveryKey,
	formatRecoveryKey,
	generateMasterKey,
	generateRecoveryKey,
	newKdfParams,
	parseRecoveryKey,
	unwrap,
	wrap,
	type KdfParams
} from '#lib/core/crypto/index.js';
import { newId, type Id, type KeyBundle, type Sealed } from '#lib/domain/index.js';

/**
 * Operaciones con las claves de una cuenta. Son funciones puras sobre contraseñas y paquetes de
 * claves: no guardan nada ni conocen la interfaz. La contraseña y las claves nunca salen de aquí
 * hacia el servidor; solo `authKey`, `recoveryAuth` y las claves ya cifradas.
 */

export type KdfBase = Omit<KdfParams, 'salt'>;
export type MasterKeyKind = 'password' | 'recovery' | 'device';

/** Datos asociados (AAD) con los que se cifra la clave maestra, ligados a la cuenta y a quién la abre. */
export const masterKeyAad = (userId: Id, kind: MasterKeyKind) => `apunte/v1/mk/${userId}/${kind}`;

export interface NewAccountKeys {
	userId: Id;
	/** Prueba de la contraseña para el servidor. */
	authKey: string;
	/** Prueba de la clave de recuperación para el servidor. */
	recoveryAuth: string;
	keys: KeyBundle;
	masterKey: CryptoKey;
	/** La clave de recuperación, tal como se muestra a la persona. Se enseña una sola vez. */
	recoveryKey: string;
}

/** Claves de una cuenta nueva (o de una que se reinicia sin conservar las notas). */
export async function createAccountKeys(
	password: string,
	kdfBase: KdfBase,
	userId: Id = newId()
): Promise<NewAccountKeys> {
	const kdf = newKdfParams(kdfBase);
	const { authKey, kek } = await deriveFromPassword(password, kdf);
	const masterKey = await generateMasterKey();
	const recoveryBytes = generateRecoveryKey();
	const { recoveryAuth, rkWrap } = await deriveFromRecoveryKey(recoveryBytes);
	return {
		userId,
		authKey,
		recoveryAuth,
		masterKey,
		recoveryKey: formatRecoveryKey(recoveryBytes),
		keys: {
			kdf,
			wrappedMasterKey: await wrap(kek, masterKey, masterKeyAad(userId, 'password')),
			recoveryWrappedMasterKey: await wrap(rkWrap, masterKey, masterKeyAad(userId, 'recovery')),
			keysVersion: 1
		}
	};
}

/** Lo que el servidor necesita para comprobar la contraseña sin conocerla. */
export async function deriveAuthKey(password: string, kdf: KdfParams): Promise<string> {
	return (await deriveFromPassword(password, kdf)).authKey;
}

/**
 * Abre la clave maestra con la contraseña. Lanza `DecryptError` si la contraseña no es la de la cuenta.
 */
export async function unlockWithPassword(
	password: string,
	userId: Id,
	keys: KeyBundle
): Promise<{ masterKey: CryptoKey; authKey: string }> {
	const { authKey, kek } = await deriveFromPassword(password, keys.kdf);
	const masterKey = await unwrap(kek, keys.wrappedMasterKey, masterKeyAad(userId, 'password'));
	return { masterKey, authKey };
}

export interface PasswordChangeKeys {
	currentAuthKey: string;
	newAuthKey: string;
	keys: KeyBundle;
	masterKey: CryptoKey;
}

/** Misma clave maestra, cifrada con la contraseña nueva. Las notas no se vuelven a cifrar. */
export async function changePasswordKeys(
	currentPassword: string,
	newPassword: string,
	userId: Id,
	current: KeyBundle,
	kdfBase: KdfBase
): Promise<PasswordChangeKeys> {
	const { masterKey, authKey: currentAuthKey } = await unlockWithPassword(
		currentPassword,
		userId,
		current
	);
	const kdf = newKdfParams(kdfBase);
	const { authKey: newAuthKey, kek } = await deriveFromPassword(newPassword, kdf);
	return {
		currentAuthKey,
		newAuthKey,
		masterKey,
		keys: {
			...current,
			kdf,
			wrappedMasterKey: await wrap(kek, masterKey, masterKeyAad(userId, 'password')),
			keysVersion: current.keysVersion + 1
		}
	};
}

export interface RecoveredKeys {
	newAuthKey: string;
	recoveryAuth: string;
	keys: KeyBundle;
	masterKey: CryptoKey;
}

/**
 * Restablece la contraseña conservando las notas: abre la clave maestra con la clave de recuperación
 * y la vuelve a cifrar con la contraseña nueva. Lanza `CryptoFormatError` si la clave está mal
 * escrita y `DecryptError` si no es la de la cuenta.
 */
export async function recoverWithRecoveryKey(
	recoveryKeyText: string,
	newPassword: string,
	userId: Id,
	server: { recoveryWrappedMasterKey: Sealed },
	kdfBase: KdfBase
): Promise<RecoveredKeys> {
	const recoveryBytes = parseRecoveryKey(recoveryKeyText);
	const { recoveryAuth, rkWrap } = await deriveFromRecoveryKey(recoveryBytes);
	const masterKey = await unwrap(
		rkWrap,
		server.recoveryWrappedMasterKey,
		masterKeyAad(userId, 'recovery')
	);
	const kdf = newKdfParams(kdfBase);
	const { authKey: newAuthKey, kek } = await deriveFromPassword(newPassword, kdf);
	return {
		newAuthKey,
		recoveryAuth,
		masterKey,
		keys: {
			kdf,
			wrappedMasterKey: await wrap(kek, masterKey, masterKeyAad(userId, 'password')),
			recoveryWrappedMasterKey: server.recoveryWrappedMasterKey,
			keysVersion: 0 // lo fija el servidor
		}
	};
}

export interface RotatedRecovery {
	authKey: string;
	recoveryAuth: string;
	recoveryWrappedMasterKey: Sealed;
	/** La clave nueva, tal como se muestra. */
	recoveryKey: string;
}

/** Nueva clave de recuperación para la misma clave maestra. Pide la contraseña para abrirla. */
export async function rotateRecoveryKeys(
	password: string,
	userId: Id,
	keys: KeyBundle
): Promise<RotatedRecovery> {
	const { masterKey, authKey } = await unlockWithPassword(password, userId, keys);
	const recoveryBytes = generateRecoveryKey();
	const { recoveryAuth, rkWrap } = await deriveFromRecoveryKey(recoveryBytes);
	return {
		authKey,
		recoveryAuth,
		recoveryKey: formatRecoveryKey(recoveryBytes),
		recoveryWrappedMasterKey: await wrap(rkWrap, masterKey, masterKeyAad(userId, 'recovery'))
	};
}
