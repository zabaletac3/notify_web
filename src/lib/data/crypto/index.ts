// Cifrado de los datos de la app: claves de la sesión y conversión de notas y carpetas.
export { Vault, type ItemEntity } from './vault.js';
export {
	DecryptCache,
	decryptFolder,
	decryptNote,
	encryptFolder,
	encryptNote,
	unreadableFolder,
	unreadableNote
} from './note-codec.js';
export { DeviceKeyStore } from './device-keys.js';
export {
	changePasswordKeys,
	createAccountKeys,
	deriveAuthKey,
	masterKeyAad,
	recoverWithRecoveryKey,
	rotateRecoveryKeys,
	unlockWithPassword,
	type KdfBase,
	type NewAccountKeys,
	type PasswordChangeKeys,
	type RecoveredKeys,
	type RotatedRecovery
} from './account-keys.js';
export {
	SLUG_BYTES,
	createShare,
	isValidSlug,
	keyFromFragment,
	newSlug,
	openShareKey,
	openSharedNote,
	sealSharedNote,
	shareUrl
} from './share-codec.js';
