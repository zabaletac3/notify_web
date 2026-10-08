# ADR 0005 — Cifrado de extremo a extremo

**Estado:** aceptada (implementada en la web con el servidor simulado; el backend real la hereda del contrato en `docs/api/openapi.yaml`)

**Contexto:** una app de notas guarda lo más privado de una persona. Una filtración de la base del servidor, de sus copias de seguridad o de la base de IndexedDB de un equipo compartido no debe dar acceso al texto. Tras revisar el paso 8 (persistencia local y sincronización) se eligió cifrar de extremo a extremo en lugar de endurecer solo el cliente. Plan detallado y desviaciones: [`docs/plans/0005-cifrado-extremo-a-extremo.md`](../plans/0005-cifrado-extremo-a-extremo.md).

## Decisión

**Criptografía.** WebCrypto: AES-256-GCM (con datos asociados), HKDF-SHA-256 y aleatorios; Argon2id (`hash-wasm`, 64 MiB, 3 iteraciones) para la contraseña. Nada de criptografía propia. Formato del texto cifrado: `a1.<iv>.<ct>` (base64url).

**Claves.**

- La contraseña produce, en el cliente, una **prueba** para el servidor (`authKey`) y una **clave** que no sale del cliente (`kek`). El servidor guarda un hash de la prueba. La contraseña nunca viaja.
- Una **clave maestra** por cuenta, que el servidor guarda cifrada dos veces: con `kek` y con una **clave de recuperación** de 256 bits que se muestra una sola vez (legible: 13 grupos de 4 más un dígito de control).
- Una **clave por nota y por carpeta**, cifrada con la maestra. Permite compartir una sola nota sin exponer la maestra.
- Cambiar la contraseña vuelve a cifrar solo la clave maestra; las notas no se tocan.
- Una **clave de dispositivo** no exportable (en IndexedDB) recuerda la clave maestra cifrada cuando el bloqueo al salir está desactivado. Por defecto no se guarda: la app pide la contraseña al abrirse.

**Qué ve el servidor.** Metadatos que necesita (`id`, carpeta, fechas, papelera, revisión, dispositivo) y, por nota o carpeta, dos textos cifrados. Títulos, texto, etiquetas, fijada y nombres de carpeta van cifrados; el contenido se rellena a múltiplos de 256 bytes. Cada texto cifrado lleva datos asociados (cuenta, tipo e id) que impiden que el servidor lo mueva a otro sitio.

**Sincronización.** Mismo protocolo que el ADR 0004, con filas cifradas. El servidor valida solo la forma de los textos cifrados. Los conflictos se resuelven en el cliente (único que lee ambas versiones). La escritura de notas y carpetas va solo por `POST /sync`.

**Almacenamiento local.** Las filas de IndexedDB guardan lo mismo que el servidor: nada en claro. Con la app bloqueada no se puede leer ni escribir, pero la sincronización sigue (no descifra). Cada cuenta tiene su propia base y cerrar sesión (o que otro dispositivo revoque este) la borra.

**Recuperación.**

- Con la clave de recuperación: se conservan las notas.
- Sin ella: se borran todas las notas del servidor y se empieza con claves nuevas, tras una confirmación explícita.

**Enlaces públicos.** El cliente cifra una copia (título y texto) con una clave propia del enlace y elige el `slug`. La clave va en el fragmento de la URL (`#k=…`), que el navegador no envía. El servidor guarda la copia y la clave del enlace cifrada con la maestra. Revocar borra ambas; volver a compartir crea claves y `slug` nuevos.

## Qué protege y qué no

| Amenaza                                                | ¿Protege?                                                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Filtración de la base del servidor o de sus copias     | Sí                                                                                                             |
| Empleado o proveedor del servidor curioso              | Sí                                                                                                             |
| Otra cuenta en el mismo navegador                      | Sí (base por cuenta, cifrada)                                                                                  |
| Copia del disco tras cerrar sesión                     | Sí (se borra la clave del dispositivo)                                                                         |
| Dispositivo robado con la app **bloqueada**            | Sí                                                                                                             |
| Dispositivo robado con la app **desbloqueada**         | No (mitigación: bloqueo por inactividad)                                                                       |
| XSS en la app                                          | No (mitigación: CSP estricta, fase 9)                                                                          |
| Servidor malicioso que sirve JavaScript alterado (web) | No: límite de todo cifrado de extremo a extremo en la web; las apps de escritorio y móvil empaquetan el código |
| Servidor que devuelve una versión antigua válida       | No se detecta (se acepta)                                                                                      |
| Metadatos                                              | Visibles: nº y tamaño aproximado de notas, fechas, qué nota está en qué carpeta, dispositivos, correo y nombre |

## Consecuencias

- **Olvidar la contraseña y perder la clave de recuperación significa perder las notas.** Es el precio de que nadie más pueda leerlas. La interfaz lo explica al registrarse y al restablecer.
- La búsqueda es solo local (D11): cada dispositivo descarga y descifra todo.
- El servidor no puede deduplicar, indexar ni validar nombres de carpeta; lo hace el cliente.
- Descifrar toda la colección al desbloquear cuesta tiempo (se mide con muchas notas; ver el plan).
- Las apps de escritorio y móvil deberían guardar la clave maestra en el llavero del sistema.
- Cualquier dato nuevo que contenga texto de la persona (p. ej. imágenes) debe cifrarse igual.
- Nunca registrar contraseñas, claves ni textos descifrados.

## Vectores de prueba

Las apps nativas (escritorio Tauri, móvil) tienen que leer y escribir **exactamente el mismo formato** que la web. Para garantizarlo hay un conjunto de vectores fijos en [`docs/api/vectors/`](../api/vectors/README.md): Argon2id + HKDF (salt, derivadas y `kekCheck`), texto cifrado `a1.<iv>.<ct>` con casos de fallo, envoltura de claves, clave de recuperación, relleno, `payload` de nota y carpeta, enlace público y ejemplos de `sync`.

> **SOLO PRUEBAS:** todas las claves, contraseñas y sales de estos archivos son públicas; no usar jamás en una cuenta real.

Se generan de forma determinista con `pnpm vectors:generate` (misma entrada → mismos bytes, sin fechas ni aleatorios) y los comprueba `pnpm test:unit --run`: cada vector se abre con el código actual y se regenera en memoria para compararlo byte a byte. Si el formato cambia, las pruebas fallan hasta regenerar los vectores y revisar el diff, y por tanto hasta actualizar también las apps nativas. El detalle del formato y de cómo verificarlo en otra plataforma está en el README de la carpeta.
