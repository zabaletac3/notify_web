// Capa local (offline-first): IndexedDB + cola de cambios + sincronización.
export {
	createLocalBackend,
	type LocalBackend,
	type LocalBackendOptions
} from './create-local-backend.js';
export { ApunteDb } from './apunte-db.js';
export {
	createSessionChannel,
	type SessionChannel,
	type SessionMessage
} from './session-channel.js';
