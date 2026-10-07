# Plan 0005 — Cifrado de extremo a extremo (E2E)

> **Para quien ejecute este plan:** síguelo en orden, fase por fase. Cada fase termina con
> `pnpm check && pnpm lint && CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:unit --run` en verde
> y un commit propio. No cambies decisiones marcadas como **fijadas**; si algo no encaja con el
> código, detente y anótalo en «Desviaciones» (al final) en vez de improvisar.
> Lee antes `CLAUDE.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/adr/0004-sincronizacion.md`.

## 0. Objetivo y alcance

**Objetivo:** que el servidor (y quien robe su base de datos o sus copias) **no pueda leer** títulos,
contenido, etiquetas ni nombres de carpetas; y que la copia local en IndexedDB también esté cifrada,
de modo que otra cuenta en el mismo navegador, una extensión que lea el disco o un análisis forense
no obtengan texto.

**Incluye:** jerarquía de claves, derivación desde la contraseña, clave de recuperación, cifrado de
notas y carpetas en la sincronización y en local, desbloqueo, cambio y restablecimiento de
contraseña, enlaces públicos con la clave en el fragmento de la URL, contrato OpenAPI, simulador y
pruebas. También incorpora las correcciones de la alternativa A que el cifrado necesita (base local
por cuenta, limpieza al revocar, cierre de sesión sin red, aviso de cambios pendientes, varias
pestañas).

**No incluye:** imágenes (se cifrarán igual cuando existan, ver §12), cifrado de ajustes en el
servidor (los ajustes hoy no se sincronizan), backend real en Go, cambios en Figma (las pantallas
nuevas usan componentes existentes y se marcan como «pendiente de Figma»).

**No hay datos reales que migrar:** todo es simulado. Se cambia la versión de la base Dexie y los
datos de ejemplo se generan ya cifrados.

## 1. Modelo de amenazas (qué protege y qué no)

| Amenaza                                                  | ¿Protege? | Cómo                                                                                                                  |
| -------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| Filtración de la base del servidor o de sus copias       | Sí        | Solo hay texto cifrado; las claves nunca salen del cliente                                                            |
| Empleado o proveedor del servidor curioso                | Sí        | Ídem                                                                                                                  |
| Otra cuenta en el mismo navegador                        | Sí        | Base local por cuenta + cifrada; sin clave no se lee                                                                  |
| Copia del disco / forense tras cerrar sesión             | Sí        | Se borra la clave del dispositivo; lo que quede en disco es cifrado                                                   |
| Dispositivo robado con sesión **bloqueada**              | Sí        | La clave maestra no está en disco sin envolver                                                                        |
| Dispositivo robado con la app **desbloqueada** y abierta | No        | Inherente; mitigación: bloqueo por inactividad (`lockTimeout`)                                                        |
| XSS en la app                                            | No        | Lee lo descifrado en memoria. Mitigación: CSP estricta (fase 9)                                                       |
| Servidor malicioso que sirve JS alterado (solo web)      | No        | Límite de todo E2E web. Tauri/Flutter empaquetan el código                                                            |
| Servidor que devuelve una versión antigua (rollback)     | No        | Se acepta y documenta (§13)                                                                                           |
| Servidor que borra o retiene datos                       | No        | Disponibilidad, no confidencialidad                                                                                   |
| Metadatos                                                | Parcial   | Visibles: nº de notas, tamaños (con relleno), fechas, estructura de carpetas, nombres de dispositivo, correo y nombre |

## 2. Decisiones fijadas

1. **Criptografía:** WebCrypto (`crypto.subtle`) para AES-256-GCM, HKDF-SHA-256 y aleatorios.
   **Argon2id** con la librería `hash-wasm` (WASM, sin dependencias). Nada de criptografía escrita a mano.
2. **Derivación (KDF):** `Argon2id(password, salt, m=65536 KiB, t=3, p=1, len=32)`. La `salt` es de
   16 bytes aleatorios por cuenta, **no** depende del correo (así cambiar el correo no obliga a
   re-cifrar). Los parámetros se guardan en el servidor (`KdfParams`) para poder subirlos en el futuro.
   En pruebas: `m=1024, t=1` inyectados.
3. **Separación autenticación / cifrado** (como Bitwarden):
   - `stretched = Argon2id(...)` (32 bytes).
   - `authKey = HKDF(stretched, info="apunte/v1/auth")` → 32 bytes, se envía al servidor en lugar de
     la contraseña (base64url). El servidor guarda **Argon2id(authKey)**, nunca `authKey`.
   - `kek = HKDF(stretched, info="apunte/v1/kek")` → clave AES-GCM no exportable, solo `wrapKey`/`unwrapKey`. Nunca sale del cliente.
   - **La contraseña nunca viaja al servidor.**
4. **Jerarquía de claves:**
   - **Clave maestra (MK):** AES-256-GCM aleatoria, generada en el cliente al registrarse. Una por cuenta.
     Se guarda en el servidor **envuelta dos veces**: con `kek` (`wrappedMasterKey`) y con la clave de
     recuperación (`recoveryWrappedMasterKey`).
   - **Clave de elemento (DEK):** AES-256-GCM aleatoria **por nota y por carpeta**, envuelta con la MK
     (`wrappedKey`). Permite compartir una sola nota sin exponer la MK y rotar la de una nota al revocar un enlace.
   - **Clave de recuperación (RK):** 32 bytes aleatorios mostrados una vez. De ella:
     `rkWrap = HKDF(RK, "apunte/v1/recovery-kek")` (envuelve la MK) y
     `recoveryAuth = HKDF(RK, "apunte/v1/recovery-auth")` (el servidor guarda su hash, para exigir la RK al restablecer conservando las notas).
   - **Clave de dispositivo (DK):** AES-GCM **no exportable** creada en el navegador, guardada como
     `CryptoKey` en IndexedDB (`apunte-keys`). Envuelve la MK en local para no pedir la contraseña en cada recarga cuando el bloqueo está desactivado.
5. **Formato del texto cifrado:** cadena compacta `a1.<iv>.<ct>` (base64url sin relleno; `iv` 12 bytes
   aleatorios; `ct` incluye la etiqueta GCM de 16 bytes). `a1` = versión 1 del formato. Se valida con
   la expresión `^a1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$`.
6. **Datos asociados (AAD), obligatorios**, para que el servidor no pueda intercambiar textos cifrados entre notas o cuentas:
   - Contenido: `apunte/v1/data/{userId}/{entity}/{id}`
   - Clave de elemento: `apunte/v1/key/{userId}/{entity}/{id}`
   - MK envuelta: `apunte/v1/mk/{userId}/{password|recovery|device}`
   - Enlace público: `apunte/v1/share/{noteId}` (ver §9: el contenido compartido no lleva `userId` en el AAD; se re-cifra para el enlace).
7. **Qué se cifra y qué no:**
   | Entidad                                                                                            | Cifrado (en `payload`)               | En claro (metadatos)                                                                      |
   | -------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
   | Nota                                                                                               | `title`, `content`, `tags`, `pinned` | `id`, `folderId`, `createdAt`, `updatedAt`, `deletedAt`, `revision`, `lastEditedDeviceId` |
   | Carpeta                                                                                            | `name`                               | `id`, `createdAt`, `updatedAt`, `revision`                                                |
   | Cuenta                                                                                             | —                                    | correo, nombre (hacen falta para correos y la cuenta)                                     |
   | `folderId` y `deletedAt` quedan en claro porque el servidor los usa (borrar carpeta deja notas sin |
   | carpeta; purga de la papelera a los 30 días).                                                      |
8. **Relleno:** el JSON del `payload` se rellena con espacios hasta el siguiente múltiplo de 256 bytes
   antes de cifrar (JSON admite espacios finales), para no revelar el tamaño exacto.
9. **Base local por cuenta:** `apunte-{userId}`. En `meta`: `userId`, `schema`. La base de claves es
   `apunte-keys` (una tabla `deviceKeys` con clave `userId`).
10. **Bloqueo en web:** si `settings.lockOnExit` es `true`, la MK **no** se guarda en local: al
    recargar se pide la contraseña (pantalla `/unlock`). Si es `false`, se guarda envuelta con la DK.
    `lockTimeout` bloquea tras inactividad. **El ajuste `encryptLocal` desaparece** (el cifrado local
    es siempre obligatorio); su fila en Privacidad se sustituye por una fila informativa.
11. **Restablecer contraseña por correo:**
    - Con la RK → se conservan las notas (la MK se re-envuelve con la nueva contraseña).
    - Sin la RK → se **borran** todas las notas y carpetas del servidor y se crea una MK nueva.
      Exige marcar «Entiendo que se borrarán mis notas».
12. **Identificadores** siguen siendo UUID v7 (en claro). El `slug` de los enlaces públicos sigue siendo aleatorio y distinto del id.

## 3. Mapa de archivos

Nuevos:

```
src/lib/core/crypto/
  bytes.ts            base64url, utf8, concat, timingSafeEqual
  sealed.ts           seal/open (AES-GCM + AAD) y formato a1.<iv>.<ct>
  kdf.ts              Argon2id (hash-wasm) + HKDF; KdfParams; derive(password, params)
  keys.ts             generar/envolver/desenvolver MK, DEK, DK; importar/exportar
  recovery-key.ts     generar RK, formato legible (Crockford base32, grupos de 4, con dígito de control), parse
  padding.ts          pad/unpad a múltiplos de 256
  kdf.worker.ts       Web Worker para Argon2id (no bloquea la UI)
  index.ts
  crypto.spec.ts
src/lib/domain/crypto.ts          tipos puros: Sealed (string), KdfParams, KeyBundle, VaultStatus
src/lib/data/crypto/
  vault.ts            Vault: MK en memoria, caché de DEK, codificar/decodificar notas y carpetas
  note-codec.ts       Note ↔ EncryptedNote, Folder ↔ EncryptedFolder
  device-keys.ts      tabla apunte-keys: guardar/leer/borrar MK envuelta con DK
  index.ts
  vault.spec.ts
src/lib/data/local/session-channel.ts  BroadcastChannel entre pestañas
src/lib/features/vault/
  state/vault.svelte.ts   VaultState (estado visible: locked/unlocked/unlocking, errores)
  index.ts
src/routes/(auth)/unlock/+page.svelte
src/routes/(auth)/recovery-key/+page.svelte   mostrar y confirmar la RK tras verificar el correo
docs/adr/0005-cifrado-extremo-a-extremo.md
```

Modificados (principales): `domain/sync-protocol.ts`, `domain/note.ts` (sin cambios de forma; ver §5),
`domain/settings.ts`, `domain/errors.ts`, `domain/auth.ts`, `data/contracts.ts`,
`data/local/{apunte-db,outbox,local-note-repository,local-folder-repository,local-sync-repository,create-local-backend}.ts`,
`data/mock/{mock-database,mock-sync-server,mock-auth-repository,mock-misc-repositories,create-mock-repositories}.ts`,
`app/create-app.svelte.ts`, `features/auth/state/auth.svelte.ts`, rutas de `(auth)`, `settings/privacy`,
`settings/account`, diálogo de compartir, `docs/api/openapi.yaml`, `docs/api/decisions.md`,
`docs/data-and-state.md`, `docs/components.md`, `docs/roadmap.md`, `eslint.config.js` (si hace falta
permitir `features/vault`), `vite.config.ts` (worker, si hace falta).

**Capas:** `core/crypto` no importa nada de la app (define sus propios tipos; `Sealed` es `string`).
`domain/crypto.ts` solo tipos. `data/crypto` usa `core/crypto` y `domain`. La UI nunca toca claves:
solo `VaultState` (estado y acciones con `ActionResult`).

## 4. Fase 0 — Prerrequisitos (alternativa A mínima)

Commit: `Base local por cuenta, limpieza al revocar y cierre de sesión sin red`.

1. **Base por cuenta.** `createLocalBackend` deja de abrir la base en la creación: expone
   `local.open(userId)` y `local.close()`. `ApunteDb(name)` se crea con `apunte-${userId}`.
   Mientras no hay base abierta, los repositorios locales lanzan `fail.sessionExpired()`
   (no deben devolver datos de otra cuenta). Guardar `meta.userId`; si al abrir no coincide → `db.delete()` y recrear.
2. **Orden de arranque** en `createApp`: `auth.bootstrap()` → si hay usuario, `local.open(user.id)` → `loadData()`.
   En `login`/`verifyEmail` correctos (efecto `wasAuthenticated` existente) → `local.open(user.id)` antes de `loadData()`.
3. **Cerrar sesión sin red:** en `AuthState.logout()` ejecutar primero la limpieza local
   (`onSignedOut`) y después `repo.logout()` en `try/catch` (si falla por red, se ignora: el token
   caduca solo; anotar en `docs/api/decisions.md` D2 que el servidor debe aceptar revocación diferida).
   `logout()` siempre termina en `anonymous`.
4. **Aviso de cambios pendientes:** antes de cerrar sesión, si `sync.snapshot.pendingCount > 0`,
   la UI (diálogo de confirmación existente en `system-dialogs.svelte` o el de cerrar sesión) muestra
   «Tienes N cambios sin sincronizar. Si cierras sesión ahora se perderán.» con botones
   «Sincronizar y salir» (llama `sync.syncNow()` y si queda en 0 sale) y «Salir igualmente».
   Mensajes en `core/messages.ts`.
5. **Revocación:** añadir a `AppError` el tipo `{ kind: 'device-revoked' }` y `fail.deviceRevoked()`.
   El transporte de sincronización y `currentSession` lo lanzan si el simulador marca el dispositivo
   como eliminado (`scenario.deviceRevoked`, nuevo flag en el simulador `/dev/simulator`).
   `SyncState` lo trata como `onSessionExpired` pero con `onDeviceRevoked` → `local.destroy()`
   (borra base y claves) + `auth` pasa a `anonymous` + mensaje «Se cerró la sesión en este dispositivo».
6. **Varias pestañas:** `session-channel.ts` con `BroadcastChannel('apunte-session')`. Mensajes
   `{ type: 'signed-out' | 'locked' | 'unlocked', userId }`. Al recibir `signed-out` o `locked`:
   la pestaña descarta estado en memoria (`notes.reset()`, `folders.reset()`, `vault.lock()`) y navega a
   `/login` o `/unlock`. En entornos sin `BroadcastChannel` (pruebas en node) es un no-op.

Pruebas nuevas (en `local-sync.spec.ts` o `local-session.spec.ts`):

- Dos cuentas en el mismo «navegador» (mismo `indexedDB` de `fake-indexeddb`): B no ve notas de A y
  los pendientes de A **no** se suben con la sesión de B.
- `logout` sin red deja `anonymous` y borra la base.
- `device-revoked` borra base y claves.
- Con `pendingCount > 0`, la acción de cierre de sesión requiere confirmación (prueba de estado).

## 5. Fase 1 — Primitivas criptográficas (`core/crypto`)

Commit: `Primitivas de cifrado (AES-GCM, Argon2id, HKDF, clave de recuperación)`.

`pnpm add hash-wasm` (versión estable más reciente 4.x; anotar la exacta en el commit).

API exacta (todas `async` salvo las de bytes):

```ts
// bytes.ts
export const toB64u: (b: Uint8Array) => string;
export const fromB64u: (s: string) => Uint8Array; // lanza CryptoFormatError si no es válido
export const utf8: (s: string) => Uint8Array;
export const fromUtf8: (b: Uint8Array) => string;
export const randomBytes: (n: number) => Uint8Array; // crypto.getRandomValues

// sealed.ts
export type Sealed = string; // "a1.<iv>.<ct>"
export class CryptoFormatError extends Error {}
export class DecryptError extends Error {} // etiqueta GCM inválida, clave o AAD erróneos
export function seal(key: CryptoKey, plaintext: Uint8Array, aad: string): Promise<Sealed>;
export function open(key: CryptoKey, sealed: Sealed, aad: string): Promise<Uint8Array>;
export function isSealed(v: unknown): v is Sealed;

// padding.ts
export function pad(b: Uint8Array, block = 256): Uint8Array; // rellena con 0x20 (espacio)
export function unpadJson(b: Uint8Array): string; // trimEnd del texto

// kdf.ts
export interface KdfParams {
	alg: 'argon2id';
	memoryKiB: number;
	iterations: number;
	parallelism: number;
	salt: string; /* b64u, 16 bytes */
}
export const DEFAULT_KDF: Omit<KdfParams, 'salt'>; // { alg:'argon2id', memoryKiB:65536, iterations:3, parallelism:1 }
export function newKdfParams(base?: Omit<KdfParams, 'salt'>): KdfParams;
export interface DerivedKeys {
	authKey: string /* b64u */;
	kek: CryptoKey;
}
export function deriveFromPassword(password: string, p: KdfParams): Promise<DerivedKeys>;
export function deriveFromRecoveryKey(
	rk: Uint8Array
): Promise<{ recoveryAuth: string; rkWrap: CryptoKey }>;
/** Permite sustituir Argon2id por un worker o por un falso en pruebas. */
export function setArgon2Impl(
	fn: (password: string, salt: Uint8Array, p: KdfParams) => Promise<Uint8Array>
): void;

// keys.ts
export function generateMasterKey(): Promise<CryptoKey>; // AES-GCM 256, extractable (solo para envolver)
export function generateItemKey(): Promise<CryptoKey>; // ídem
export function generateDeviceKey(): Promise<CryptoKey>; // AES-GCM 256, extractable:false, usos wrapKey/unwrapKey
export function wrap(wrapping: CryptoKey, key: CryptoKey, aad: string): Promise<Sealed>; // exporta 'raw' y sella
export function unwrap(
	wrapping: CryptoKey,
	sealed: Sealed,
	aad: string,
	usages?: KeyUsage[]
): Promise<CryptoKey>;
export function exportRawForShare(key: CryptoKey): Promise<string>; // b64u, para el fragmento del enlace
export function importRawForShare(b64u: string): Promise<CryptoKey>;

// recovery-key.ts
export function generateRecoveryKey(): Uint8Array; // 32 bytes
export function formatRecoveryKey(rk: Uint8Array): string; // Crockford base32, grupos de 4 con «-», + 1 carácter de control (mod 37)
export function parseRecoveryKey(text: string): Uint8Array; // tolera minúsculas, espacios, O→0, I/L→1; lanza CryptoFormatError si el control no cuadra
```

Detalles obligatorios:

- `wrap`/`unwrap`: implementar como `exportKey('raw')` + `seal`, y `open` + `importKey('raw')`
  (más sencillo y uniforme que `wrapKey` con AES-GCM). Las claves desenvueltas se importan con
  `extractable: true` solo la MK y las DEK (hace falta para re-envolver); la DK nunca es extraíble.
- HKDF: `importKey('raw', stretched, 'HKDF', false, ['deriveKey','deriveBits'])`; salt HKDF vacía
  (32 bytes a cero); `info` = las cadenas de §2.3; `deriveBits(256)` para `authKey` y `recoveryAuth`,
  `deriveKey(AES-GCM 256, extractable:false, ['encrypt','decrypt'])` para `kek` y `rkWrap`.
- `kdf.worker.ts`: recibe `{password, salt, params}`, responde `Uint8Array`. `kdf.ts` usa el worker
  cuando `typeof Worker !== 'undefined'` y `import.meta.env.MODE !== 'test'`; si no, llama a
  `hash-wasm` directamente.
- Nunca registrar (`console.*`) contraseñas, claves ni textos descifrados.

Pruebas (`crypto.spec.ts`, entorno node; Node 22 trae `crypto.subtle`):

- `seal`/`open` ida y vuelta; `open` con otra clave, otro AAD o un byte alterado → `DecryptError`.
- Dos `seal` del mismo texto dan resultados distintos (IV aleatorio).
- `isSealed` y formato `a1.`; `fromB64u` rechaza entradas inválidas.
- `pad` → múltiplo de 256; `unpadJson(pad(x))` = x.
- `deriveFromPassword` determinista con los mismos parámetros; distinto con otra salt o contraseña;
  `authKey` ≠ material de `kek` (comprobar que cifrar con `kek` y luego intentar usar `authKey` como clave no descifra).
  Usar parámetros ligeros (`memoryKiB:1024, iterations:1`).
- Vector fijo de Argon2id (RFC 9106 no da vector para estos parámetros: generar uno con `hash-wasm`
  una vez y fijarlo en la prueba, para detectar cambios de librería).
- RK: `parseRecoveryKey(formatRecoveryKey(rk))` = rk; un carácter cambiado → error de control.
- `wrap`/`unwrap` de MK con `kek`; con AAD distinto falla.

## 6. Fase 2 — Tipos de dominio y protocolo cifrado

Commit: `Protocolo de sincronización con datos cifrados`.

`domain/crypto.ts`:

```ts
export type Sealed = string;
export interface KdfParams {
	alg: 'argon2id';
	memoryKiB: number;
	iterations: number;
	parallelism: number;
	salt: string;
}
/** Lo que el servidor guarda de las claves de una cuenta (nada de ello permite descifrar sin contraseña o RK). */
export interface KeyBundle {
	kdf: KdfParams;
	wrappedMasterKey: Sealed; // MK con kek       (AAD apunte/v1/mk/{userId}/password)
	recoveryWrappedMasterKey: Sealed; // MK con rkWrap    (AAD apunte/v1/mk/{userId}/recovery)
	keysVersion: number; // sube al cambiar contraseña o RK
}
export type VaultStatus = 'locked' | 'unlocking' | 'unlocked';
```

`domain/sync-protocol.ts` — sustituir `NoteFields`/`FolderFields` en el transporte:

```ts
export interface EncryptedNote {
	id: Id;
	folderId: Id | null;
	createdAt: IsoDate;
	updatedAt: IsoDate;
	deletedAt: IsoDate | null;
	revision: number;
	lastEditedDeviceId: Id;
	wrappedKey: Sealed; // DEK con MK
	payload: Sealed; // {title, content, tags, pinned} con DEK
}
export interface EncryptedFolder {
	id: Id;
	createdAt: IsoDate;
	updatedAt: IsoDate;
	revision: number;
	wrappedKey: Sealed;
	payload: Sealed; /* {name} */
}
export type EncryptedNoteFields = Omit<EncryptedNote, 'id' | 'revision' | 'lastEditedDeviceId'>;
export type EncryptedFolderFields = Omit<EncryptedFolder, 'id' | 'revision'>;
// SyncChange.data: EncryptedNoteFields | EncryptedFolderFields
// SyncRemoteChange.note?: EncryptedNote; .folder?: EncryptedFolder
// SyncConflictReport.remote: EncryptedNote
```

Los tipos en claro `NoteFields`/`FolderFields` se mantienen para uso interno (codec), pero ya no
aparecen en `SyncChange`. `Note` y `Folder` (lo que ve la UI) **no cambian**.

## 7. Fase 3 — Vault y codec (`data/crypto`)

Commit: `Vault: clave maestra en memoria y codificación de notas y carpetas`.

```ts
// vault.ts
export class Vault {
	constructor(opts: { userId: Id });
	get status(): VaultStatus;
	/** Desbloquea con la MK ya desenvuelta. */
	unlockWith(mk: CryptoKey): void;
	lock(): void; // olvida MK y vacía la caché de DEK
	requireKey(): CryptoKey; // lanza fail.locked() si está bloqueado
	newItemKey(entity: 'note' | 'folder', id: Id): Promise<{ key: CryptoKey; wrapped: Sealed }>;
	itemKey(entity: 'note' | 'folder', id: Id, wrapped: Sealed): Promise<CryptoKey>; // con caché Map<`${entity}:${id}:${wrapped}`, CryptoKey>
	rotateItemKey(entity: 'note' | 'folder', id: Id): Promise<{ key: CryptoKey; wrapped: Sealed }>;
}

// note-codec.ts
export async function encryptNote(v: Vault, n: Note, wrapped?: Sealed): Promise<EncryptedNote>; // reutiliza la DEK si llega `wrapped`
export async function decryptNote(
	v: Vault,
	e: EncryptedNote,
	syncStatus: NoteSyncStatus
): Promise<Note>;
export async function encryptFolder(
	v: Vault,
	f: Folder,
	wrapped?: Sealed
): Promise<EncryptedFolder>;
export async function decryptFolder(v: Vault, e: EncryptedFolder): Promise<Folder>;
/** Caché de descifrado: reutiliza el resultado si `payload` no cambió. */
export class DecryptCache<T> {
	get(id: Id, payload: Sealed): T | undefined;
	set(id: Id, payload: Sealed, value: T): void;
	delete(id: Id): void;
	clear(): void;
}
```

- `payload` de nota = `JSON.stringify({ title, content, tags, pinned })` → `pad` → `seal(DEK, …, AAD data)`.
- Al descifrar validar la forma del JSON (tipos de cada campo); si falla → `DecryptError`.
- Si una nota no se puede descifrar (DEK o payload corrupto), **no** romper la lista: se muestra con
  título «Nota ilegible» y contenido vacío, `syncStatus` intacto, y se registra un aviso sin datos.
  Añadir al simulador el flag `scenario.corruptNote` (corrompe el `payload` de una nota en el servidor) para probarlo.
- `domain/errors.ts`: añadir `{ kind: 'locked' }` (`fail.locked()`) y `{ kind: 'decrypt' }`; mensajes en `core/messages.ts`:
  «La app está bloqueada. Ingresa tu contraseña.» / «No se pudo descifrar esta nota.»

`device-keys.ts` (Dexie, base `apunte-keys`, tabla `deviceKeys: 'userId'`, filas
`{ userId, deviceKey: CryptoKey, wrappedMasterKey: Sealed }`): `save(userId, mk)`, `load(userId): Promise<CryptoKey|null>`, `remove(userId)`, `removeAll()`.
`fake-indexeddb` admite `CryptoKey` por _structured clone_ en node 22; si no, guardar en pruebas un
objeto en memoria (inyectar el almacén).

Pruebas (`vault.spec.ts`): ida y vuelta de nota y carpeta; AAD con otro `userId` o `id` falla
(simular servidor que cambia `payload` entre dos notas → `DecryptError`); relleno a 256; caché evita
descifrar dos veces (espiar `open`); `lock()` hace que `requireKey` lance `locked`.

## 8. Fase 4 — Cuenta: registro, inicio de sesión, desbloqueo, contraseña, recuperación

Commit: `Claves de cuenta: registro, desbloqueo, cambio y restablecimiento de contraseña`.

### 8.1 Contrato `AuthRepository` (cambios)

La contraseña ya no llega al repositorio remoto: el **estado** (`AuthState`) deriva las claves y el
repositorio recibe `authKey` y material cifrado.

```ts
interface AuthRepository {
	/** Parámetros KDF de una cuenta. Para correos inexistentes devuelve parámetros falsos estables (no revela si existe). */
	prelogin(email: string): Promise<{ kdf: KdfParams }>;
	register(input: {
		fullName: string;
		email: string;
		acceptedTerms: boolean;
		authKey: string;
		recoveryAuth: string;
		keys: KeyBundle;
	}): Promise<{ email: string }>;
	login(input: { email: string; authKey: string }): Promise<Session & { keys: KeyBundle }>;
	keys(): Promise<KeyBundle>; // con sesión vigente
	changePassword(input: {
		currentAuthKey: string;
		newAuthKey: string;
		keys: KeyBundle;
	}): Promise<void>;
	requestEmailChange(newEmail: string, authKey: string): Promise<{ email: string }>;
	/** Paso 1 del restablecimiento: con el token del correo obtiene la MK envuelta con la RK. */
	passwordResetBundle(
		token: string
	): Promise<{ userId: Id; recoveryWrappedMasterKey: Sealed; kdf: KdfParams }>;
	resetPassword(
		input:
			| { token: string; mode: 'keep'; recoveryAuth: string; newAuthKey: string; keys: KeyBundle }
			| { token: string; mode: 'wipe'; newAuthKey: string; recoveryAuth: string; keys: KeyBundle }
	): Promise<void>;
	rotateRecoveryKey(input: {
		authKey: string;
		recoveryAuth: string;
		recoveryWrappedMasterKey: Sealed;
	}): Promise<void>;
	// sin cambios: verifyEmail, resendVerificationCode, logout, updateProfile, confirmEmailChange, deleteAccount, currentSession, requestPasswordReset
}
```

`RegisterInput`/`LoginInput` del dominio siguen teniendo `password` (lo que escribe la persona);
los tipos con `authKey` son internos de `data` (definirlos en `domain/crypto.ts` como
`RegisterKeysInput`, etc.).

### 8.2 Flujos en `AuthState` (y nuevo `VaultState`)

`VaultState` (`features/vault`): `status`, `error`, acciones `unlock(password)`, `lock()`,
`setupRecoveryKey()`; envuelve `Vault` y `deviceKeys`. `AuthState` recibe un `KeyService`
(inyectado desde `createApp`) con estas operaciones; **las rutas solo llaman a `AuthState`/`VaultState`**.

1. **Registro:** `kdf = newKdfParams()`; `{authKey, kek} = derive(password, kdf)`; `mk = generateMasterKey()`;
   `rk = generateRecoveryKey()`; `{recoveryAuth, rkWrap} = deriveFromRecoveryKey(rk)`.
   **Fijado:** como el AAD necesita el `userId` antes de que exista la cuenta, el cliente lo genera
   (`userId = newId()`) y lo envía en `register` (el servidor lo acepta si no existe, igual que D1). Envolver MK con `kek` y con `rkWrap` (AAD con ese `userId`).
   Guardar `rk` **solo en memoria** de `AuthState` (`pendingRecoveryKey`) para mostrarla tras verificar.
2. **Verificación del correo:** tras `verifyEmail` correcto → navegar a `/recovery-key` (en lugar de
   `/onboarding`). Esa pantalla muestra la RK formateada, botones «Copiar» y «Descargar .txt»
   (archivo `apunte-clave-de-recuperacion.txt` con la clave, el correo y una frase de aviso), casilla
   obligatoria «La guardé en un lugar seguro» y «Continuar» → borra `pendingRecoveryKey` → `/onboarding`.
   Si se recarga la página y ya no hay RK en memoria → ofrecer «Generar una nueva» (`rotateRecoveryKey`).
3. **Inicio de sesión:** `prelogin(email)` → `derive` (mostrar «Desbloqueando…» en el botón; puede
   tardar ~1 s) → `login({email, authKey})` → `mk = unwrap(kek, keys.wrappedMasterKey, AAD password)` →
   `vault.unlockWith(mk)` → si `lockOnExit === false`: `deviceKeys.save(userId, mk)`.
   Error de credenciales: el mismo mensaje que hoy.
4. **Arranque con sesión vigente:** si hay `deviceKeys.load(userId)` → desbloquear sin pedir nada;
   si no → estado `locked` → el layout `(app)` redirige a `/unlock`.
5. **`/unlock`:** muestra correo y nombre, campo contraseña, «Desbloquear», enlace «No soy yo /
   cerrar sesión». Hace `keys()` (o usa el bundle en caché en `meta`), `derive`, `unwrap`.
   Contraseña incorrecta → `unwrap` lanza `DecryptError` → mensaje «Contraseña incorrecta».
   5 intentos fallidos seguidos → cerrar sesión (contador en memoria).
6. **Bloqueo:** `vault.lock()` + `deviceKeys.remove(userId)` si `lockOnExit`; por inactividad según
   `lockTimeout` (escuchar `pointerdown`/`keydown`/`visibilitychange` en `createApp`, solo en navegador).
   Bloquear también descarta notas en memoria (`notes.reset()`, `folders.reset()`, `search` se vacía) y avisa a otras pestañas.
7. **Cambiar contraseña** (Cuenta): `derive(actual)` con el `kdf` actual → `newKdf = newKdfParams()` →
   `derive(nueva)` → re-envolver la **misma** MK con el nuevo `kek` → `changePassword({currentAuthKey, newAuthKey, keys:{...bundle, kdf:newKdf, wrappedMasterKey, keysVersion+1}})`.
   Las notas no se re-cifran. El servidor cierra las demás sesiones.
8. **Restablecer contraseña** (`/reset-password?token=`): nueva sección antes del campo de contraseña:
   - Opción A «Tengo mi clave de recuperación» (por defecto): campo de texto para la RK →
     `passwordResetBundle(token)` → `parseRecoveryKey` → `rkWrap` → `unwrap` (si falla: «La clave de
     recuperación no es correcta») → nueva contraseña → `resetPassword({mode:'keep', recoveryAuth, …})`.
   - Opción B «No la tengo»: aviso destacado (componente `Banner` variante destructiva) «Se borrarán
     todas tus notas y carpetas. No se pueden recuperar.» + casilla obligatoria → `mode:'wipe'` con MK y RK
     **nuevas** → tras guardar, mostrar `/recovery-key` con la nueva RK.
9. **Cambiar correo:** igual que hoy pero envía `authKey` derivado de la contraseña escrita.
10. **Privacidad → «Clave de recuperación»:** fila nueva «Generar una clave nueva» (pide contraseña en
    un `ResponsiveDialog`) → `rotateRecoveryKey` → muestra la nueva RK con el mismo componente de la
    pantalla `/recovery-key` (extraer `RecoveryKeyPanel` a `components/app`). La anterior deja de servir.
    Fila informativa «Cifrado de extremo a extremo · Activo · Solo tú puedes leer tus notas» en lugar del interruptor `encryptLocal`.
11. **Eliminar cuenta:** pide contraseña (ya lo hace la pantalla) → `authKey`; tras borrar: `local.destroy()`.

### 8.3 Simulador (`mock-auth-repository.ts`, `mock-database.ts`)

- `StoredUser` guarda `authKeyHash` (en el simulador basta `SHA-256(authKey)` en b64u; comentar que el
  real usa Argon2id), `recoveryAuthHash`, `keys: KeyBundle`. Desaparece `password`.
- `prelogin` de correo inexistente: `salt = b64u(SHA-256("apunte-fake-salt:" + email))[0..16 bytes]`, parámetros por defecto.
- Cuenta demo: `MockDatabase` necesita claves reales para la cuenta demo. Añadir
  `async seedVault(password = DEMO_PASSWORD, kdf = TEST_KDF)` que deriva claves, crea la MK, cifra
  todas las notas y carpetas de los datos de ejemplo y deja `db.server.notes: EncryptedNote[]`.
  `DEMO_PASSWORD` y la RK demo (`DEMO_RECOVERY_KEY`, fija) en `fixtures/index.ts`; mostrarlas en `/dev/simulator`.
  En desarrollo usar `TEST_KDF` (rápido) solo si `import.meta.env.DEV`; en producción `DEFAULT_KDF`.
- Las pruebas existentes que usan `password: '…'` del simulador siguen escribiendo la contraseña en
  la UI/estado; el estado deriva `authKey`. Ajustar fixtures de pruebas de auth.

Pruebas (`auth-keys.spec.ts`, estado con `testApp({ persistence: 'indexeddb' })` y KDF ligero):

- Registro → verificar → hay RK pendiente → tras confirmar se borra de memoria.
- Login correcto desbloquea; contraseña incorrecta → `invalid-credentials` y vault `locked`.
- Recarga simulada (nuevo `createApp` con el mismo `indexedDB`): con `lockOnExit:false` desbloquea solo; con `true` queda `locked`.
- `unlock` con contraseña incorrecta → error; 5 fallos → `anonymous`.
- Cambiar contraseña: la vieja deja de desbloquear, la nueva sí, **las notas siguen legibles**.
- Restablecer con RK (`keep`): notas legibles con la nueva contraseña. Con RK errónea → error y nada cambia.
- Restablecer sin RK (`wipe`): servidor sin notas; nueva RK válida.
- `rotateRecoveryKey`: la RK vieja ya no sirve en `keep`.
- `prelogin` de correo inexistente devuelve siempre la misma salt y no lanza.

## 9. Fase 5 — Datos cifrados en local y en la sincronización

Commit: `Notas y carpetas cifradas en IndexedDB y en la sincronización`.

1. **Dexie `version(2)`** en `ApunteDb`: `notes` guarda `EncryptedNote & { syncStatus }`; `folders`
   guarda `EncryptedFolder`; `outbox.data` guarda `EncryptedNoteFields | EncryptedFolderFields`;
   `conflicts.remote` guarda `EncryptedNote`. Índices iguales. `upgrade()`: borrar todas las tablas
   (no hay datos reales). `meta.keysBundle` guarda el `KeyBundle` para desbloquear sin red.
2. **`LocalNoteRepository`:** recibe `vault` en `LocalDeps`.
   - `list`/`get`: leer filas → `decryptNote` con `DecryptCache` → `queryNotes` en memoria (ya se hace).
   - `create`: `id = newId()`; `vault.newItemKey('note', id)`; `encryptNote`; guardar fila y `enqueue`.
   - `update`/`moveToTrash`/`restore`/`duplicate`: descifrar actual → aplicar → `encryptNote(v, n, row.wrappedKey)` (misma DEK) → fila + `enqueue`. `duplicate` usa DEK **nueva**.
   - Todas lanzan `fail.locked()` si `vault.status !== 'unlocked'`.
3. **`LocalFolderRepository`:** igual con `encryptFolder`/`decryptFolder`.
4. **`outbox.ts`:** `noteFields`/`folderFields` pasan a devolver los campos cifrados a partir de la fila (`EncryptedNoteFields`). La fusión por entidad no cambia.
5. **`LocalSyncRepository.apply`:** las filas remotas ya llegan cifradas → se guardan tal cual (sin
   descifrar). `snapshot()` descifra para construir `Conflict` (local y remoto) — necesita `vault`;
   si está bloqueado, devuelve `conflicts: []` y `pendingCount` correcto.
   `resolveConflict('both')`: descifrar la local, crear copia con DEK **nueva**, cifrar y encolar.
6. **`MockSyncServer`:** opera sobre `db.server.notes: EncryptedNote[]` y `db.server.folders: EncryptedFolder[]`
   (nunca descifra). Validar en `sync()` que `payload` y `wrappedKey` cumplen `isSealed`; si no → `fail.validation`.
   `simulateRemoteEdit(noteId)` necesita la MK demo: recibe un `Vault` del «otro dispositivo» (crear
   en `createLocalBackend` un vault de servidor de pruebas con la MK demo, **solo para el simulador**).
7. **Repositorios del simulador que leían notas en claro** (`MockShareRepository`, `MockStorageRepository`):
   - Almacenamiento: tamaños = longitud de `payload` + `wrappedKey` (ya con relleno).
   - Compartir: ver Fase 6.
8. **Modo `memory`** (pruebas de UI existentes y simulador por defecto): se mantiene en claro, como
   hoy. Documentarlo en `docs/data-and-state.md`: «el modo memory no cifra; es solo para la UI».

Pruebas: adaptar las 18 de `local-sync.spec.ts` (deben seguir pasando todas con datos cifrados) y añadir:

- El servidor simulado no contiene en ningún campo el título ni el contenido de una nota creada
  (buscar la cadena en `JSON.stringify(db.server)`).
- IndexedDB local tampoco contiene el texto (`JSON.stringify` de todas las tablas).
- Con el vault bloqueado, `notes.list()` lanza `locked`; la sincronización sigue subiendo lo
  pendiente (no necesita descifrar) y bajando filas.
- Servidor que intercambia `payload` entre dos notas → esas notas aparecen como «Nota ilegible», el resto bien.
- Conflicto `both` produce copia con `wrappedKey` distinta de la original.

## 10. Fase 6 — Enlaces públicos

Commit: `Enlaces públicos con la clave en el fragmento de la URL`.

- **Fijado:** al crear el enlace, el cliente genera una **clave de enlace** (`shareKey`, AES-GCM nueva),
  cifra una copia de la nota (`{title, content}`, relleno, AAD `apunte/v1/share/{noteId}`) y la sube:
  `createLink(noteId, { payload })`. URL: `https://apunte.app/n/{slug}#k={b64u(shareKey)}`. El
  fragmento nunca llega al servidor.
- El servidor guarda `payload` del enlace. **Al editar la nota**, si tiene enlace, el cliente sube
  una copia nueva cifrada con la misma `shareKey` (guardar `shareKey` envuelta con la MK en la fila
  del enlace: `wrappedShareKey`). Añadir `updateLinkPayload(noteId, payload)` al contrato y
  llamarlo desde `NotesState` tras `update` si `share.getLink(noteId)` existe (vía gancho `onWrite` con id).
- **Revocar** borra el enlace y su `payload`; la clave queda inútil. Volver a compartir genera clave y slug nuevos.
- `ShareLink` (dominio) añade `url` completa con fragmento, construida en el cliente.
- Página pública (`/n/[slug]`, fuera de `(app)`, sin sesión): lee `location.hash`, pide
  `GET /public/notes/{slug}`, descifra y muestra con el visor Markdown sanitizado. Sin `#k` o con
  clave errónea → «Este enlace no es válido o fue revocado». Añadir `<meta name="referrer" content="no-referrer">` en esa página.
- El diálogo de compartir añade la nota: «El enlace incluye la clave para leer la nota. Quien lo tenga podrá leerla.»

Pruebas: crear enlace → la URL tiene `#k=`; el servidor no tiene el texto; descifrar con la clave
del fragmento da el contenido; tras editar, el enlace muestra lo nuevo; tras revocar, falla.

## 11. Fase 7 — Contrato OpenAPI y decisiones

Commit: `API: claves de cuenta, datos cifrados y enlaces con clave`.

`docs/api/openapi.yaml`:

- Esquemas nuevos: `Sealed` (string, `pattern` de §2.5), `KdfParams`, `KeyBundle`, `EncryptedNote`,
  `EncryptedFolder`, `EncryptedNoteFields`, `EncryptedFolderFields`.
- `SyncChange.data` → `oneOf [EncryptedNoteFields, EncryptedFolderFields]`; `SyncRemoteChange.note/folder` → cifrados; `SyncConflictReport.remote` → `EncryptedNote`.
- `GET/PUT /notes`, `/folders`: los cuerpos y respuestas pasan a cifrados (o marcar esos endpoints
  como «solo lectura de metadatos / desaconsejados»: la escritura va por `/sync`).
- Auth: `POST /auth/prelogin`, `POST /auth/register` (con `userId`, `authKey`, `recoveryAuth`, `keys`),
  `POST /auth/login` (devuelve `keys`), `GET /keys`, `POST /auth/password` (cambiar),
  `GET /auth/password-reset/{token}` (bundle), `POST /auth/password-reset` (`mode: keep|wipe`),
  `PUT /keys/recovery`. Quitar `password` de todos los cuerpos: **ningún endpoint recibe la contraseña**.
- Compartir: `POST /notes/{id}/share` con `{ payload, wrappedShareKey }`; `PUT /notes/{id}/share/payload`;
  `GET /public/notes/{slug}` (sin auth) → `{ payload, updatedAt }`.
- Descripción del servidor (x-notes): guarda `Argon2id(authKey)` y `Argon2id(recoveryAuth)`;
  limitar intentos en `prelogin`/`login`; `prelogin` falso estable para correos inexistentes;
  respuestas `401` con `code: device-revoked`.
- `pnpm api:lint` en verde.

`docs/api/decisions.md`: nueva **D13 · Cifrado de extremo a extremo (Decidido: ADR 0005)**; ajustar
D2 (revocación diferida, `device-revoked`), D10 (slug + clave en fragmento), D11 (la búsqueda es
solo local, obligatoria con E2E). `docs/adr/0005-cifrado-extremo-a-extremo.md` con las §1, §2 y §13
resumidas. Actualizar `docs/data-and-state.md`, `docs/roadmap.md`, `CLAUDE.md` (una línea: «Las notas
se cifran en el cliente; ver ADR 0005. Nunca registrar claves ni textos descifrados.»).

## 12. Fase 8 — UI y textos

Commit: `Pantallas de desbloqueo y clave de recuperación`.

Todas en español, con tokens y componentes existentes (`AuthCard`, `AuthField`, `Banner`,
`SettingRow`, `ResponsiveDialog`, `AppIcon`). Añadir a `docs/components.md` → «Pendientes con Figma»:
`/unlock`, `/recovery-key`, `RecoveryKeyPanel`, sección de RK en `/reset-password`, fila de Privacidad.

| Lugar                        | Textos                                                                                                                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Botón de inicio de sesión    | «Iniciar sesión» → mientras deriva: «Desbloqueando…»                                                                                                                                                                                     |
| `/recovery-key`              | Título «Guarda tu clave de recuperación» · «Si olvidas tu contraseña, es la única forma de recuperar tus notas. Nadie más la tiene, ni siquiera Apunte.» · «Copiar» · «Descargar» · casilla «La guardé en un lugar seguro» · «Continuar» |
| `/unlock`                    | «Desbloquea Apunte» · «Ingresa tu contraseña para leer tus notas.» · «Desbloquear» · «Cerrar sesión»                                                                                                                                     |
| `/reset-password`            | «¿Tienes tu clave de recuperación?» · «Sí, la tengo» / «No la tengo» · aviso de borrado · «Entiendo que se borrarán mis notas»                                                                                                           |
| Privacidad                   | «Cifrado de extremo a extremo» · «Activo. Solo tú puedes leer tus notas.» · «Clave de recuperación» · «Generar una clave nueva»                                                                                                          |
| Cerrar sesión con pendientes | «Tienes {n} cambios sin sincronizar. Si cierras sesión ahora se perderán.» · «Sincronizar y salir» · «Salir igualmente»                                                                                                                  |
| Nota ilegible                | Título «Nota ilegible» · banner en el editor «No se pudo descifrar esta nota.»                                                                                                                                                           |

Accesibilidad: la RK en `<output>` con `aria-live="polite"` al copiar («Copiada»); fuente
monoespaciada (token existente; si no hay, usar `font-mono` de Tailwind y anotarlo); el campo de RK
con `autocomplete="off"`, `spellcheck="false"`, `autocapitalize="characters"`.

Rutas y guardas: `(app)/+layout.ts` → si `vault.status === 'locked'` y hay sesión → `goto('/unlock')`.
`/unlock` sin sesión → `/login`. `/recovery-key` sin RK pendiente → ofrece generar nueva (requiere sesión).

Pruebas de navegador (Vitest browser): `/unlock` desbloquea y muestra notas; `/recovery-key` no deja
continuar sin la casilla; reset con «No la tengo» exige la casilla.

## 13. Fase 9 — Endurecimiento del navegador

Commit: `CSP estricta y cabeceras de seguridad`.

- `svelte.config.js` → `kit.csp`: `mode: 'auto'`, directivas
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'`
  (Tailwind/bits-ui inyectan estilos; revisar si se puede quitar), `img-src 'self' data: blob:`,
  `connect-src 'self' <API>`, `worker-src 'self' blob:`, `frame-ancestors 'none'`, `base-uri 'none'`,
  `form-action 'self'`, `object-src 'none'`. `'wasm-unsafe-eval'` es necesario para `hash-wasm`.
- `require-trusted-types-for 'script'` solo si DOMPurify y TipTap funcionan con una política
  `trustedTypes.createPolicy('apunte', …)`; si rompe algo, dejarlo anotado como pendiente.
- Cabeceras para el despliegue (documentar en `docs/architecture.md`, sección «Seguridad»):
  `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` mínima, HSTS.
- Comprobar en navegador (Playwright manual) que la app arranca sin violaciones de CSP en consola.
- Revisar que no haya `console.log` con datos de notas (grep) y que los errores enviados a
  cualquier registro no incluyan `content`/`title`.

## 14. Riesgos aceptados y limitaciones (van al ADR)

1. **Olvidar contraseña y RK = notas perdidas.** Es el precio del E2E; se explica al registrarse y al restablecer.
2. **JS servido por el servidor (web):** un servidor comprometido podría servir código que robe la
   contraseña. Mitigación parcial: CSP, SRI en el build; protección real en Tauri/Flutter (código empaquetado).
3. **Rollback:** el servidor puede devolver una versión antigua válida de una nota. No se detecta
   (haría falta encadenar revisiones firmadas). Se reevalúa más adelante.
4. **Metadatos visibles:** cantidad de notas, tamaños aproximados, fechas, qué notas están en qué
   carpeta (ids), dispositivos, IP.
5. **App desbloqueada:** quien tenga el dispositivo abierto lee todo. Mitigación: `lockTimeout`.
6. **Clave de dispositivo no exportable:** con `lockOnExit:false` la MK queda en disco envuelta con una
   clave que el navegador guarda en el perfil; protege frente a otra cuenta y a lecturas casuales,
   no frente a malware con acceso al perfil desbloqueado. Por eso el valor por defecto es bloquear.
7. **Rendimiento:** descifrar todas las notas al desbloquear. Medir con 1000 notas (prueba de rendimiento
   informativa, no bloqueante: objetivo < 500 ms en escritorio).

## 15. Criterios de aceptación globales

- [ ] Ningún endpoint ni transporte recibe la contraseña (grep de `password` en `data/local`, `data/remote`, `MockSyncServer`).
- [ ] `JSON.stringify` del servidor simulado y de IndexedDB no contiene textos de notas ni nombres de carpetas (prueba automática).
- [ ] Todas las pruebas previas (214) siguen pasando, adaptadas donde el contrato cambió; nuevas pruebas de cada fase en verde.
- [ ] `pnpm verify` y `pnpm api:lint` en verde.
- [ ] Prueba manual en navegador: registrarse → guardar RK → crear notas → recargar (bloquea) → desbloquear → cambiar contraseña → cerrar sesión → olvidé contraseña con RK → notas intactas.
- [ ] Sin violaciones de CSP en consola.
- [ ] Documentación: ADR 0005, OpenAPI, decisions D13, data-and-state, components (pendientes de Figma), roadmap, CLAUDE.md.

## 16. Orden de commits

0 Prerrequisitos → 1 Primitivas → 2 Protocolo → 3 Vault → 4 Cuenta → 5 Datos cifrados → 6 Enlaces →
7 API y docs → 8 UI → 9 CSP. Las fases 4 y 8 se pueden fusionar si la UI se necesita para probar;
el resto, un commit por fase. Push a `main` al final de cada fase con las líneas de atribución del sistema.

## 17. Preguntas que el usuario puede querer revisar (hay valor por defecto; no bloquean)

1. **Bloquear al recargar en web** (`lockOnExit: true` por defecto): más seguro, pero pide la contraseña en cada apertura. Alternativa: `false` por defecto.
2. **Restablecer sin RK borra las notas.** Alternativa: no permitirlo (solo con RK).
3. **Parámetros Argon2id** 64 MiB / 3 iteraciones: en móviles antiguos puede tardar 1–2 s.

## Desviaciones

_(Quien ejecute: anotar aquí cualquier cambio respecto al plan y por qué.)_

**Fase 0**

- La base local se abre con `local.open(userId)` desde `createApp` (tras `auth.bootstrap()` o al iniciar sesión). Sin base abierta, los repositorios lanzan `session-expired` y `snapshot()` devuelve un estado vacío.
- Si la sesión ya venció al arrancar (`status: 'expired'`) no se conoce el `userId`, así que no se abre ninguna base ni se cargan datos hasta volver a iniciar sesión (antes se veían las notas guardadas). Es más seguro y evita mezclar cuentas.
- `device-revoked` lo detectan `SyncState` y `AuthState.bootstrap`. Los estados de ajustes, dispositivos y compartir siguen tratando solo `session-expired`: lo recoge la siguiente sincronización (cada 60 s como máximo).
- `endSession(reason)` en `AuthState` cubre revocación y cierre en otra pestaña; la pantalla de inicio de sesión muestra el aviso (`auth.notice`).
- Cerrar sesión pone antes la sesión en `anonymous` y borra la copia local; si el servidor no responde se ignora el error. Cerrar sesión desde Cuenta pregunta antes si hay cambios pendientes.
