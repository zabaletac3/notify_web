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
