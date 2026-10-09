# ADR 0006 — Acceso con Google, verificación en dos pasos y dispositivos de confianza

**Estado:** aceptada (implementada en el backend Go y en la web; el contrato vive en `docs/api/openapi.yaml`)

**Contexto:** AxoNote es una app de notas **offline-first con cifrado de extremo a extremo (E2EE)**. La contraseña hace **dos trabajos**: autentica ante el servidor y descifra las notas en el cliente (produce `authKey` y `kek`; ver [ADR 0005](0005-cifrado-extremo-a-extremo.md)). Cualquier mecanismo nuevo de acceso solo puede participar en el primero: **Google y el MFA autorizan; solo la contraseña, la clave de recuperación o una clave guardada en el propio dispositivo descifran.**

- **Google** dice quién es la persona, pero no entrega ningún secreto que el servidor no vea: no puede abrir el cofre.
- El **código TOTP** lo verifica el servidor, así que el servidor conoce ese secreto: tampoco puede abrir el cofre.

Este ADR cierra la decisión **D8** (Acceso con Google), la **D12** (Verificación en dos pasos) y añade la **D16** (Dispositivos de confianza), y resuelve los pendientes B-2 / W-2 de `faltantes-sin-despliegue.md`.

## Decisión

### Google (D8)

- **Solo identidad.** Toda cuenta, también la creada con Google, tiene contraseña de AxoNote, `authKey`, `KeyBundle` y clave de recuperación; las columnas `NOT NULL` de `users` no cambian.
- **Registro con Google.** Google entrega el correo ya verificado (no hay código de 6 dígitos). La persona crea su contraseña, acepta los términos y ve su clave de recuperación, igual que en el registro normal.
- **Login con Google.** Abre la sesión **bloqueada**. El servidor entrega sesión y `KeyBundle`; la app pide la contraseña solo si ese dispositivo no tiene con qué descifrar (dispositivo de confianza, D16).
- **Vinculación por `sub`, nunca por correo.** Si ya existe una cuenta verificada con ese correo y aún no está vinculada, **no hay auto-vinculación**: se pide la contraseña de AxoNote una vez («ya tienes cuenta, escribe tu contraseña para vincularla»). No se crea una cuenta duplicada.
- **Flujo OAuth de código de autorización + PKCE por redirección**, con el intercambio en el backend. Sin ventanas emergentes y sin scripts de Google (la web es el origen que tiene la clave maestra en memoria; no se carga JavaScript de terceros).

### Verificación en dos pasos (D12)

- **TOTP** (RFC 6238: SHA-1, 6 dígitos, 30 s, tolerancia ±1 paso) más **10 códigos de respaldo** de un solo uso.
- Con MFA activo el login es **contraseña + código**. El código **nunca reemplaza** a la contraseña.
- Con MFA activo y login por Google: **Google → código → contraseña solo si el dispositivo no tiene la llave**. El MFA se exige **siempre que se abre una sesión nueva**, venga por contraseña o por Google; Google no puede saltarse el MFA.
- `/auth/login` no entrega `keys`, tokens ni cookie hasta superar el segundo paso.
- **Restablecer la contraseña con MFA activo:** modo `keep` (con clave de recuperación) se permite **sin** código y puede, a petición, desactivar el MFA; modo `wipe` (sin clave de recuperación, borra las notas) **exige** código TOTP o de respaldo; quien perdió contraseña, clave de recuperación, autenticador y códigos de respaldo **no tiene salida automática** (aceptado).
- El MFA protege la **cuenta y el texto cifrado** (descarga, borrado, dispositivos). No protege las notas: eso ya lo hace la contraseña.

### Dispositivos de confianza (D16)

- **Solo para quien entra con Google.** Quien entra con correo y contraseña no lo usa (ya escribe la contraseña en el login).
- **Objetivo de experiencia:** la contraseña se pide **una vez por dispositivo**; después, entrar es «el botón de Google y listo», **incluso después de cerrar sesión**.
- **Llave partida en dos (T3):** el dispositivo guarda una clave propia **no exportable**; el servidor guarda la MK cifrada con esa clave y solo la entrega a una sesión válida. Ninguna mitad sirve sola, y revocar el dispositivo desde otro lo deja inservible. Datos asociados del cifrado: `apunte/v1/mk/<userId>/trusted/<trustId>`.
- **Cierre de sesión con dos opciones:** «Cerrar sesión» (el dispositivo sigue de confianza) y «Cerrar sesión y olvidar este dispositivo» (la próxima vez pide contraseña).
- **Supuestos aceptados:** S1 (bloquear la app borra la clave local de confianza), S2 (en un dispositivo de Google, las preferencias locales de bloqueo arrancan en `lockOnExit: false`, `lockTimeout: 'never'`) y S6 (máximo 10 dispositivos; purga a los 30/180 días).

### Tabla de comportamiento esperado (criterio de aceptación)

| Situación                                                                | Qué pide                                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Registro con correo                                                      | correo, contraseña, código del correo                      |
| Registro con Google                                                      | Google, crear contraseña (una vez en la vida)              |
| Login con correo, sin MFA                                                | correo + contraseña                                        |
| Login con correo, con MFA                                                | correo + contraseña, luego código                          |
| Google, dispositivo nuevo, sin MFA                                       | Google + contraseña                                        |
| Google, dispositivo nuevo, con MFA                                       | Google + código + contraseña                               |
| Google, dispositivo de confianza (incluso tras «Cerrar sesión»), sin MFA | solo el botón de Google                                    |
| Google, dispositivo de confianza, con MFA                                | Google + código                                            |
| Google, tras «olvidar este dispositivo» o revocación                     | Google (+ código) + contraseña                             |
| Google con un correo que ya tiene cuenta sin vincular                    | Google + contraseña (vincula; después aplica lo de arriba) |
| App bloqueada (inactividad, bloqueo manual, «bloquear al salir»)         | contraseña, siempre                                        |

## Qué protege y qué no

Actualiza la tabla del [ADR 0005](0005-cifrado-extremo-a-extremo.md):

| Amenaza                                                | ¿Protege?                                                                                                                                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filtración de la base del servidor o de sus copias     | Sí (sigue siendo texto cifrado y hashes)                                                                                                                                                                             |
| Empleado o proveedor del servidor curioso              | Sí                                                                                                                                                                                                                   |
| Otra cuenta en el mismo navegador                      | Sí (base por cuenta, cifrada)                                                                                                                                                                                        |
| Copia del disco tras cerrar sesión                     | Sí si se eligió «olvidar este dispositivo»; con un dispositivo de confianza la clave local sola no sirve (falta la mitad del servidor), pero quien tenga el navegador **y** la sesión de Google abierta puede entrar |
| Dispositivo robado con la app **bloqueada**            | Sí                                                                                                                                                                                                                   |
| Dispositivo robado con la app **desbloqueada**         | No (mitigación: bloqueo por inactividad)                                                                                                                                                                             |
| XSS en la app                                          | No (mitigación: CSP estricta siguiendo el ADR 0005)                                                                                                                                                                  |
| Servidor malicioso que sirve JavaScript alterado (web) | No: límite de todo cifrado de extremo a extremo en la web                                                                                                                                                            |
| Servidor que devuelve una versión antigua válida       | No se detecta (se acepta)                                                                                                                                                                                            |
| **Cuenta de Google comprometida**                      | El atacante puede abrir sesión y bajar o borrar texto cifrado; **no** puede leer notas; con MFA activo ni siquiera abre sesión                                                                                       |
| **Correo comprometido con MFA activo**                 | Ya no basta para quedarse con la cuenta (respuesta `wipe` exige código; D12/M5)                                                                                                                                      |
| Metadatos                                              | Visibles: nº y tamaño aproximado de notas, fechas, qué nota está en qué carpeta, dispositivos, correo y nombre; con Google también un identificador de proveedor                                                     |

## Consecuencias

- **El lema no cambia:** para recuperar las notas hay que tener la contraseña o la clave de recuperación. Google y el MFA no son una vía de recuperación.
- Los dispositivos de confianza **acortan la segunda petición de contraseña**, no la eliminan en dispositivos nuevos; por eso el bloqueo local (S1) gana a la confianza.
- El almacenamiento de confianza es **independiente** del `DeviceKeyStore` (que sirve para reabrir la app dentro de una sesión viva y se borra al bloquear y al cerrar sesión). El de confianza solo interviene al iniciar sesión con Google.
- La lista de plataformas de los dispositivos de confianza es la de `devices`; las apps nativas (escritorio y móvil) quedan fuera de alcance pero el diseño por redirección los admite después (el callback redirigiría a un enlace profundo).
- Las etiquetas criptográficas nuevas empiezan por `apunte/v1/`; las existentes **no** cambian.
