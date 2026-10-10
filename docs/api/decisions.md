# Decisiones abiertas del backend

Contrato: [`openapi.yaml`](./openapi.yaml) (borrador). Se valida con `pnpm api:lint`.
Estas decisiones condicionan el servidor; cada una trae mi recomendación. Marca `[x]` al decidir.

## Las que bloquean el diseño de la API

- [x] **D1 · Identificadores generados por el cliente. (Decidido: UUID v7, `newId()`)** Para crear notas y carpetas sin conexión el cliente necesita su propio `id`.
      _Recomendación:_ UUID v7 (ordenable por fecha). El servidor los acepta dentro de `POST /sync` (idempotente: repetir un `upsert` no duplica) y rechaza ids que ya pertenezcan a otra cuenta. Con cifrado de extremo a extremo (D13) el `userId` del registro también lo elige el cliente.
- [ ] **D2 · Sesión y tokens.** (_Ajustes por D13:_ el servidor guarda solo un hash de `authKey`, nunca la contraseña; cerrar sesión desde el cliente puede no llegar al servidor si no hay red, así que la revocación se hace al caducar el token o desde la lista de dispositivos; un dispositivo eliminado recibe `401` con `kind: device-revoked` y borra su copia local.) Token de acceso corto + token de renovación con rotación, o sesión por cookie.
      _Recomendación:_ acceso JWT de 15 min + renovación opaca con rotación y lista de dispositivos (`/devices` ya la espera). Cookie `HttpOnly` para la web, cabecera `Authorization` para escritorio y móvil.
- [x] **D3 · Protocolo de sincronización. (Decidido: ver ADR 0004; implementado en `data/local` y `MockSyncServer`)** El contrato `POST /sync` es un borrador. Se fija tras la capa local (paso 2): cola de cambios, cursor, resolución de conflictos y borrados (lápidas).
      _Recomendación:_ revisión por nota (`revision`, ya existe), cursor por cuenta, el servidor nunca pisa: ante `baseRevision` distinto devuelve `409` con la versión remota y el cliente decide (`local`, `remote`, `both`).
- [ ] **D4 · Modelo en MongoDB y multiempresa.** Tu plantilla (`multitenant-template`) es multiempresa; AxoNote es de un solo usuario por cuenta.
      _Recomendación:_ quitar el tenant: colecciones `users` (con `authKeyHash`, `recoveryAuthHash` y `keys: KeyBundle`), `notes` y `folders` (solo metadatos y textos cifrados), `tombstones`, `devices`, `share_links`, `refresh_tokens`, `verification_codes`. Índices: `notes(userId, seq)` (cursor de `/sync`), `notes(userId, deletedAt)` (purga a 30 días), `share_links(slug)` único y `share_links(noteId)` único. **Sin** índice por nombre de carpeta ni por título: el servidor no puede leerlos (la unicidad de nombres de carpeta la comprueba el cliente).

- [x] **D13 · Cifrado de extremo a extremo. (Decidido: ver ADR 0005; implementado en el cliente y en el servidor simulado)** El servidor nunca recibe la contraseña ni el texto de las notas.
      _Qué cambia en el servidor:_ guarda un hash de la prueba de la contraseña (`authKey`), los parámetros de derivación (`KdfParams`), las claves cifradas de la cuenta (`KeyBundle`) y, de cada nota y carpeta, metadatos más dos textos cifrados (`wrappedKey`, `payload`). Responde a `prelogin` aunque el correo no exista. La escritura de notas y carpetas va solo por `POST /sync`. Los conflictos se resuelven en el cliente. Compartir guarda una copia cifrada con clave propia; la clave va en el fragmento de la URL.
      _Qué asume el producto:_ si se pierden la contraseña **y** la clave de recuperación, las notas no se pueden recuperar; restablecer sin la clave de recuperación borra las notas (a propósito).
- [x] **D14 · Borrado de cuenta exige prueba de contraseña.** `POST /me/delete` con `{authKey}`, mismo error `422 fields.password=wrong-password` y mismo límite de intentos que `/me/password`. Se usa POST porque algunos clientes/proxies descartan el cuerpo de DELETE. `DELETE /me` queda obsoleto 14 días y luego responde `410`.
- [x] **D15 · Sesión web con cookie HttpOnly.** La implementación inicial guardaba en la web el token de acceso y el de renovación en `localStorage`; esta decisión sustituye esa parte y se alinea con la recomendación original de D2: cookie `HttpOnly` para la web, `Authorization: Bearer` para escritorio y móvil. El cliente web activa el modo cookie con `X-AxoNote-Session: cookie` en `login`, `verify-email`, `refresh` y `logout`: el servidor entrega el token de renovación solo como cookie `axonote_rt` (`HttpOnly; Secure; SameSite=Strict; Path=/v1/auth`, sin `Domain` por defecto) y omite `refreshToken` del JSON; el token de acceso sigue en el cuerpo. `POST /auth/refresh` en modo cookie no lleva cuerpo (lee y rota la cookie) y `POST /auth/logout` funciona aunque el token de acceso haya vencido y siempre borra la cookie (`Max-Age=0`). Sin la cabecera nada cambia (escritorio, móvil y bundles web antiguos). La protección CSRF se apoya en la cabecera obligatoria (fuerza el preflight) y en que un `Origin` presente esté en `ALLOWED_ORIGINS` (`403 kind: forbidden`); CORS pasa a permitir credenciales con orígenes explícitos (nunca comodín). La rotación y la detección de reutilización no cambian. Restricción de despliegue: `SameSite=Strict` exige que la web y la API compartan dominio registrable (p. ej. `apunte.app` y `api.apunte.app`); una web en `*.pages.dev` con la API en otro dominio no recibiría la cookie.

## Las que se pueden decidir durante la construcción

- [ ] **D5 · Imágenes en notas.** Dónde se guardan (disco, S3, Mongo GridFS), tamaño máximo y formatos. Hoy no se pueden adjuntar; `imagesBytes` es 0. _Recomendación:_ almacenamiento de objetos con URL firmada, 5 MB por imagen.
- [ ] **D6 · Correo transaccional.** Proveedor para códigos de verificación, cambio de correo y recuperación. Caducidad: código 10 min, enlace de recuperación 1 h.
- [ ] **D7 · Limpieza de la papelera.** Tarea programada diaria que borra lo que lleva 30 días (`TRASH_RETENTION_DAYS`) y las cuentas eliminadas tras 30 días.
- [x] **D8 · Acceso con Google. (Decidido: ver ADR 0006)** Google es **solo identidad**. Toda cuenta, también la creada con Google, tiene contraseña de AxoNote, `authKey`, `KeyBundle` y clave de recuperación; las columnas `NOT NULL` de `users` no cambian.
      _Registro con Google:_ Google entrega el correo ya verificado (sin código de 6 dígitos); la persona crea su contraseña, acepta los términos y ve su clave de recuperación, igual que en el registro normal. _Login con Google:_ abre la sesión **bloqueada**; el servidor entrega sesión y `KeyBundle` y la app pide la contraseña solo si ese dispositivo no tiene con qué descifrar (ver D16). La vinculación es por `sub` de Google, **nunca** por correo: si existe una cuenta verificada con ese correo y aún no está vinculada, se pide la contraseña de AxoNote una vez para vincularla (sin auto-vinculación ni cuenta duplicada). Flujo OAuth de **código de autorización + PKCE por redirección**, con el intercambio en el backend; **sin** ventanas emergentes y **sin** scripts de Google (`G5`).
- [ ] **D9 · Límites de uso.** Intentos de login (hoy 5 y bloqueo), reenvío de código (60 s), tamaño máximo de nota, notas por cuenta, cuota de 1 GB.
- [ ] **D10 · Enlaces públicos.** _Decidido por D13:_ el `slug` lo genera el cliente (16 bytes aleatorios, 22 caracteres), la copia va cifrada y la clave va en el fragmento de la URL. _Falta decidir:_ si el enlace caduca, y si la página pública es de la web (hoy, `/n/[slug]`) o del backend.
- [x] **D11 · Búsqueda. (Decidido: solo en el cliente)** Con cifrado de extremo a extremo el servidor no puede buscar; MiniSearch indexa en el cliente todas las notas descifradas. Es obligatorio que cada dispositivo descargue todo.
- [x] **D12 · Verificación en dos pasos. (Decidido: ver ADR 0006)** TOTP (RFC 6238: SHA-1, 6 dígitos, 30 s, tolerancia ±1 paso) más **10 códigos de respaldo** de un solo uso. Con MFA activo el login es **contraseña + código** (el código **nunca** reemplaza a la contraseña) y también al entrar con Google: **Google → código → contraseña solo si el dispositivo no tiene la llave**; el MFA se exige **siempre que se abre una sesión nueva**, venga por contraseña o por Google, y Google no puede saltárselo.
      `/auth/login` **no** entrega `keys`, tokens ni cookie hasta superar el segundo paso. _Restablecer la contraseña con MFA activo:_ modo `keep` (con clave de recuperación) se permite **sin** código y puede, a petición, desactivar el MFA; modo `wipe` (sin clave de recuperación, borra las notas) **exige** código TOTP o de respaldo; quien perdió contraseña, clave de recuperación, autenticador y códigos de respaldo **no tiene salida automática** (aceptado). El MFA protege la **cuenta y el texto cifrado** (descarga, borrado, dispositivos), **no** las notas: eso ya lo hace la contraseña.

- [x] **D16 · Dispositivos de confianza. (Decidido: ver ADR 0006)** Se adopta el «dispositivo de confianza», **solo para quien entra con Google** (quien entra con correo y contraseña ya escribe la contraseña en el login). Objetivo: la contraseña se pide **una vez por dispositivo**; después, en ese dispositivo, entrar es «el botón de Google y listo», **incluso tras cerrar sesión**. La llave va **partida en dos**: el dispositivo guarda una clave propia **no exportable** (IndexedDB) y el servidor guarda la MK cifrada con esa clave y solo la entrega a una sesión válida; ninguna mitad sirve sola y revocar el dispositivo desde otro lo deja inservible. El cierre de sesión ofrece **«Cerrar sesión»** (el dispositivo sigue de confianza) y **«Cerrar sesión y olvidar este dispositivo»** (la próxima vez pide contraseña).
      _Supuestos aceptados:_ **S1** bloquear la app (`VaultState.lock()`) borra también la clave local de confianza (se recrea al desbloquear con la contraseña); de lo contrario se podría saltar el bloqueo con «cerrar sesión → botón de Google». **S2** en un dispositivo donde se entra con Google por primera vez, las preferencias locales de bloqueo arrancan en `lockOnExit: false` y `lockTimeout: 'never'` (la persona puede subirlas en Ajustes → Privacidad, con aviso de que se pedirá la contraseña). **S6** máximo **10 dispositivos de confianza** por cuenta; la purga borra los revocados a los 30 días y los no usados en 180 días.

## Fuera del contrato (solo cliente)

- Exportar e importar notas en Markdown se hace en el navegador.
- El bloqueo biométrico depende del cliente. El cifrado de las notas ya no es un ajuste: es siempre obligatorio (D13).

## Vectores nuevos (fase 1 del plan 0007)

- [x] **`markdown.json`: la valla anidada es bloque opaco.** `canonical = serializar(analizar(input))` con
      TipTap 3 (sin interfaz) es idempotente para todos los casos soportados salvo un bloque de código con
      una valla de 4 comillas que contiene otra de 3: el serializador de TipTap no elige una valla más larga y
      el resultado no vuelve a leerse igual. Se trata como bloque opaco (`supported: false`) y el móvil lo
      conservará intacto. Se documenta aquí porque es la alternativa de la §12 del plan (serializador que no
      iguala `canonical`). El resto del corpus (incluido un bloque de código con comillas invertidas simples
      dentro) sí es idempotente.
- [x] **`sync-behavior.json`: esquema y generación.** Cada escenario es `{name, initial, steps[], expected[]}`;
      cada `step` lleva `op` y `device` (`a` es el observado), y `expected[i]` es el estado lógico de `a` tras el
      paso `i` (id, título, texto, revisión, estado, cola, conflictos, cursor; nunca bytes cifrados). Se genera
      ejecutando `outbox.ts` + `LocalSyncRepository` + `MockSyncServer` con reloj fijo y `crypto.getRandomValues`
      parcheado con una secuencia determinista (los ids del cliente salen de ahí). Como `MockSyncServer` no pagina,
      el escenario de paginación envuelve su transporte con un decorador que parte `remoteChanges` en páginas y
      encadena `hasMore`/`cursor`. La cuenta del servidor es vacía: se fija la sesión a la cuenta de prueba porque
      el servidor simulado decide la cuenta por la sesión, no por el cliente.

## Vectores nuevos (fase 1b del plan 0007)

- [x] **`markdown.json`: la sangría de más de 2 espacios (o un tabulador) en la continuación de un
      elemento de lista no es idempotente.** `- uno\n    continua` (4 espacios) y `- uno\n\tcontinua`
      (tabulador) se leen como un único párrafo con esa sangría dentro del texto; al releer el resultado
      ya serializado (`- uno\n  continua`, 2 espacios) el analizador la recorta más todavía
      (`- uno\ncontinua`, sin sangría). Son casos de lectura (`cases`) con `supported: false`; el móvil no
      tiene que reproducir este recorte progresivo, solo lo documenta.
- [x] **`markdown.json`: un `orderedList` con `start` en su valor por defecto (1) no reaparece con
      `attrs` al releer.** El analizador de `@tiptap/markdown` solo añade `attrs: { start }` cuando
      `start !== 1`; con `start: 1` el nodo reaparece sin `attrs` en absoluto. Por eso varios casos de
      `serialize` con una lista numerada que empieza en 1 (listas contiguas, numerada dentro de
      viñetas y viceversa) traen `reparses: false` aunque el Markdown emitido sea correcto: es un
      artefacto de comparar el JSON byte a byte contra lo que de verdad editaría TipTap (que sí
      incluiría `start: 1`), no una pérdida de datos real.
- [x] **`sync-behavior.json`: el borrado remoto de una nota en conflicto no se aplica mientras el
      conflicto esté abierto.** Escenario `borrado-remoto-de-una-nota-en-conflicto`: con la nota en
      conflicto (tiene una entrada en la cola, aunque esa entrada no se envíe), `LocalSyncRepository`
      comprueba primero si hay una entrada pendiente (`if (pending) continue`) **antes** de comprobar si
      el cambio remoto es un borrado; como la entrada sigue ahí mientras no se resuelva el conflicto, el
      borrado se ignora: la nota sigue en conflicto con la versión remota antigua, nunca con la que la
      borró. El plan (§7) describe «borrado remoto borra nota y conflicto» como regla general; en
      presencia de un conflicto abierto el código no la aplica. No se corrige aquí (regla 4 de la §0);
      el móvil debe reproducir este mismo comportamiento para no divergir de la web.
- [x] **`sync-behavior.json`: una carpeta borrada en remoto puede «resucitar» si otro dispositivo tiene
      un cambio local pendiente para ella.** Escenario `carpeta-borrada-en-remoto-con-cambio-local-pendiente`:
      las carpetas no tienen conflictos (gana el último cambio, §7); un cambio pendiente local siempre
      se envía y, si el servidor ya no tiene esa carpeta (la borró otro dispositivo), `MockSyncServer` la
      trata como una creación nueva en vez de rechazarla. El resultado es que la carpeta vuelve a
      existir con el nombre que puso quien la tenía pendiente, revisión 1, sin que quede rastro del
      borrado. La regla «cambio pendiente local gana salvo que el remoto sea un borrado» (§7) no evita
      esto: esa comprobación solo mira los cambios remotos que **no** se acaban de enviar en la misma
      petición, y el cambio pendiente de la carpeta siempre viaja en la misma petición que hizo que el
      servidor la recreara.
- [x] **`sync-behavior.json`: borrar una carpeta con notas ya no produce un conflicto de la nota con
      ella misma (corregido).** Escenario `borrar-una-carpeta-con-notas`: al borrar una carpeta
      localmente, la nota que contenía queda «sin carpeta» y pendiente de subir (con la `baseRevision`
      que tenía antes del borrado). Esa nota y el borrado de la carpeta se mandan en la misma petición;
      `MockSyncServer` procesa primero el borrado de la carpeta y, como parte de él, sube la revisión de
      cada nota que apuntaba a esa carpeta (le pone `folderId: null`). Antes, cuando el servidor procesaba
      después el `upsert` de esa misma nota, su `baseRevision` ya no coincidía con la revisión que el
      servidor acababa de subir y lo rechazaba como conflicto, con la versión remota y la local con el
      mismo contenido. Regla aplicada (solo dentro de la misma petición): `applyFolder` anota, por nota
      afectada, la revisión que tenía justo antes de esa subida de rebote; `applyNote` acepta el
      `upsert` (o `delete`) de esa nota cuando su `baseRevision` coincide con esa revisión anotada, aunque
      ya no coincida con la revisión actual. Ningún otro caso se relaja: un cambio hecho por otro
      dispositivo u otra petición antes de este borrado de carpeta sigue siendo un conflicto real. El
      mismo ajuste se hizo en `notify_backend` (`internal/modules/notesync/service.go`).
