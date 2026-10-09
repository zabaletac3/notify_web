// Capa local (offline-first): IndexedDB + cola de cambios + sincronización.
export {
	createLocalBackend,
	type LocalBackend,
	type LocalBackendOptions
} from './create-local-backend.js';
export { AxoNoteDb } from './axonote-db.js';
export {
	DevicePrefs,
	devicePrefsKey,
	deviceActiveAtKey,
	DEVICE_PREFS_PREFIX,
	DEVICE_ACTIVE_PREFIX,
	type PrefsStorage
} from './device-prefs.js';
export {
	createSessionChannel,
	type SessionChannel,
	type SessionMessage
} from './session-channel.js';
