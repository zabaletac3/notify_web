import { importMasterKeyRaw } from '#lib/core/crypto/index.js';
import { Vault } from '../crypto/vault.js';
import { DEMO_MASTER_KEY_RAW } from './fixtures/demo-keys.js';
import { DEMO_USER_ID } from './mock-database.js';

/**
 * Cofre desbloqueado de la cuenta de ejemplo. Lo usa el simulador para cifrar los datos de ejemplo
 * del "servidor" y las pruebas para actuar como el dispositivo de esa cuenta.
 */
export async function createDemoVault(): Promise<Vault> {
	const vault = new Vault({ userId: DEMO_USER_ID });
	vault.unlockWith(await importMasterKeyRaw(DEMO_MASTER_KEY_RAW));
	return vault;
}
