# Vectores de prueba compartidos

> **SOLO PRUEBAS: todas las claves, contraseñas y sales de estos archivos son públicas; no usar jamás en una cuenta real.**

Propósito: fijar el formato criptográfico de AxoNote para que las apps nativas (escritorio Tauri,
móvil) y la web comprueben que leen y escriben **exactamente los mismos bytes**. Cada JSON lleva
`version: 1`. Se generan de forma determinista con `pnpm vectors:generate` y se comprueban en
`pnpm test:unit --run`: si el formato cambia, las pruebas fallan hasta regenerar y revisar el diff.

## Formato

- **Contraseña → claves.** `stretched = Argon2id(password.normalize('NFKC') en UTF-8, salt, m=memoryKiB, t=iterations, p=parallelism, len=32)`.
  Después, HKDF-SHA-256 con `salt` de 32 bytes a cero:
  `authKey = HKDF(stretched, info="apunte/v1/auth", 32 bytes)` (base64url) y
  `kek = HKDF(stretched, info="apunte/v1/kek", AES-256-GCM, no exportable)`.
- **Clave de recuperación.** 32 bytes aleatorios. De ella:
  `recoveryAuth = HKDF(RK, "apunte/v1/recovery-auth", 32 bytes)` y
  `rkWrap = HKDF(RK, "apunte/v1/recovery-kek", AES-256-GCM)`.
- **Texto cifrado.** `a1.<iv>.<ct>`: `iv` de 12 bytes y `ct` = texto + etiqueta GCM de 16 bytes,
  ambos en base64url **sin relleno**.
- **AAD.** AES-GCM con `additionalData`; cada vector indica el `aad` exacto.
- **Relleno.** El JSON del payload se rellena con espacios (0x20) hasta el siguiente múltiplo de 256 bytes.
- **Clave de recuperación legible.** 52 caracteres Crockford base32 (256 bits desplazados 4 a la
  izquierda; los 4 bits bajos quedan a cero) + 1 carácter de control
  (`alfabeto[valor % 37]`, alfabeto `0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U`), en grupos de 4
  separados por `-` (el último grupo tiene 1 carácter). Al leer se toleran minúsculas, espacios,
  guiones, `O→0`, `I/L→1`.

## Cómo verificar cada archivo en otra plataforma

- **kdf.json.** Deriva con Argon2id + HKDF y comprueba `authKey`. Para validar la `kek`, abre
  `kekCheck.sealed` con la `kek`, el `kekCheck.aad` y ese IV, y compara con `kekCheck.masterKey`
  (o vuelve a cifrar esa clave con el mismo IV y compara). `password` se normaliza a NFKC.
- **sealed.json.** Abre cada `sealed` con `key` + `aad` y compara con `plaintext` en UTF-8. Cada
  `failures` debe lanzar el error indicado (`DecryptError` o `CryptoFormatError`).
- **wrap.json.** Deriva/importa la clave de envoltura (contraseña, clave de recuperación o maestra),
  abre `sealed` con `aad` y compara con `plaintextKey`. `keyBundle` + `password` debe abrir la
  maestra (`unlockWithPassword`).
- **trusted-device.json.** Dispositivo de confianza (D16): abre `case.sealed` con `case.deviceKey`,
  `case.aad` y el IV y compara con `case.plaintextKey`. El AAD es
  `apunte/v1/mk/<userId>/trusted/<trustId>`.
- **recovery-key.json.** `format` de bytes → texto; `tolerant` → los mismos bytes; `invalid` → error.
- **padding.json.** Comprueba `lengths` y `unpad`.
- **note-payload.json.** Descifra `wrappedKey` con la maestra y `payload` con la clave del elemento
  (AAD y IV indicados); el resultado es `plaintextJson` y, tras validar la forma, `decrypted`.
- **share.json.** Abre `payload` con `shareKey` y `contentAad`; la URL se reconstruye como
  `origin + "/n/" + slug + keyFragment`.
- **sync.json.** Estructura de `EncryptedSyncRequest`/`EncryptedSyncResponse`; las notas y carpetas
  llevan `wrappedKey`/`payload` y se descifran con `masterKey`.
- **markdown.json.** Casos de Markdown: `canonical = serializar(analizar(input))` con el mismo editor
  (TipTap 3) sin interfaz. `canonical` es idempotente. Con `supported: false` el bloque queda fuera del
  conjunto que edita el móvil y debe conservarse intacto (bloque opaco).
