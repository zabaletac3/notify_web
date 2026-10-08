# Apunte · App móvil (Android/iOS) — plan y contexto

> Documento de traspaso para una sesión nueva de Claude Code que **crea** el repo `zabaletac3/notify_mobile`.
> Actualizado: 2026-10-08. Todavía no existe código móvil. Léelo entero antes de empezar.
> Copia este archivo al repo nuevo como `docs/handoff.md` y deriva de él su `CLAUDE.md`.

## 1. Qué es Apunte y qué ya existe

App de notas **offline-first con cifrado de extremo a extremo**: Markdown, carpetas, búsqueda local,
papelera, enlaces públicos de solo lectura, varios dispositivos por cuenta. El servidor **nunca
descifra**: guarda metadatos y dos textos cifrados por elemento. UI en **español**.

| Repo                               | Estado                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `notify_web` (SvelteKit)           | completa; es la **referencia de comportamiento** y la fuente de verdad del contrato y del cifrado |
| `notify_backend` (Go + PostgreSQL) | completo (fases 0–11), sin desplegar todavía                                                      |
| `notify_desktop` (Tauri 2)         | por crear                                                                                         |
| `notify_mobile`                    | **este documento**                                                                                |

Lee en `notify_web`: `docs/api/openapi.yaml` (contrato), `docs/adr/0004-sincronizacion.md`,
`docs/adr/0005-cifrado-extremo-a-extremo.md`, `docs/plans/0005-cifrado-extremo-a-extremo.md`, y el código
de `src/lib/core/crypto/`, `src/lib/data/crypto/`, `src/lib/data/local/local-sync-repository.ts`,
`src/lib/data/remote/`. Diseño: Figma «Apunte – App de notas» (incluye vistas móviles, claro y oscuro).

## 2. Decisión previa (pendiente de la persona)

El ADR 0001 dice **Flutter** (sin código compartido con la web). Alternativa: **Tauri 2 móvil** (o
Capacitor) reutilizando la web, que ya es responsive.

|                       | Flutter                                              | Tauri 2 / Capacitor con la web                      |
| --------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Trabajo (una persona) | 3–5 meses                                            | 3–5 semanas                                         |
| Sensación             | nativa                                               | web (teclado, gestos, editor en teléfonos modestos) |
| Riesgo principal      | reescribir cifrado, sync y editor Markdown idénticos | rendimiento del editor y del KDF en móviles viejos  |
| Mantenimiento         | dos bases de código                                  | una                                                 |

Recomendación: publicar primero con Tauri/Capacitor y dejar Flutter para cuando haya demanda. **Pregunta
a la persona antes de empezar.** Si elige reutilizar la web, aplica solo M0, M4, M7 y M8 de abajo y toma
como base `escritorio.md` (mismo enfoque, otro destino).

## 3. Lo que tiene que ser idéntico a la web (contrato de compatibilidad)

Cualquier diferencia de un byte deja notas ilegibles entre dispositivos. Implementa exactamente esto y
verifícalo con los vectores de M0:

- **KDF**: contraseña normalizada **NFKC**, UTF-8 → Argon2id (`memoryKiB` 65536, `iterations` 3,
  `parallelism` 1, salida 32 B; parámetros y sal de 16 B vienen del servidor en el _bundle_ de claves,
  pueden cambiar) → HKDF-SHA256 (sal = 32 bytes en cero) con `info`:
  `apunte/v1/auth` → 32 B en base64url = `authKey` (lo que se envía al servidor) ·
  `apunte/v1/kek` → clave AES-256-GCM que envuelve la clave maestra.
- **Clave de recuperación**: 32 B aleatorios mostrados como 52 caracteres Crockford base32 +
  1 de control (`ALPHABET+'*~$=U'`, valor mod 37), en grupos de 4 con «-». Al leer: mayúsculas, sin
  espacios ni guiones, O→0, I/L→1. HKDF con `apunte/v1/recovery-auth` (prueba para el servidor) y
  `apunte/v1/recovery-kek` (envuelve la maestra). Ver `src/lib/core/crypto/recovery-key.ts`.
- **Formato cifrado** `a1.<iv>.<ct>`: AES-256-GCM, IV de 12 B, `ct` incluye la etiqueta de 16 B, todo en
  base64url sin relleno. Siempre con AAD (UTF-8):
  - clave maestra: `apunte/v1/mk/{userId}/password` | `/recovery` | `/device`
  - clave de cada elemento (envuelta con la maestra): `apunte/v1/key/{userId}/{note|folder}/{id}`
  - contenido: `apunte/v1/data/{userId}/{note|folder}/{id}`
  - clave de un enlace (envuelta con la maestra): `apunte/v1/sharekey/{userId}/{noteId}`
  - contenido de un enlace: `apunte/v1/share/{slug}`
- **Contenido**: JSON `{title, content, tags, pinned}` (nota) o `{name}` (carpeta), UTF-8, rellenado con
  espacios (0x20) hasta el siguiente múltiplo de 256 B; al leer, `trimEnd`. Copia de un enlace:
  `{title, content}`. Slug: 22 caracteres base64url; clave en el fragmento `#k=` (nunca al servidor).
- **Markdown**: el campo `content` es Markdown tal como lo produce TipTap en la web. El editor móvil debe
  abrir y guardar sin alterar lo que no se tocó (listas de tareas, negritas, enlaces, encabezados…).

## 4. Protocolo de sincronización (ADR 0004)

`POST /v1/sync` con `{deviceId, deviceName, cursor|null, changes[]}`; cada cambio
`{entity: note|folder, id, op: upsert|delete, baseRevision, data?}`. Respuesta
`{cursor, applied[], remoteChanges[], conflicts[], hasMore?}`. Reglas:

- Primer arranque `cursor: null` descarga todo; **mientras `hasMore` sea true, repetir** con el cursor
  recibido y sin cambios (páginas de ≤ 500 elementos / 8 MiB).
- Notas: conflicto si `baseRevision` no es la del servidor → el servidor no pisa y devuelve su versión;
  el cliente ofrece «Esta versión / Versión de la nube / Conservar ambas». Carpetas: gana la última.
- Borrado definitivo = lápida; las carpetas llegan antes que las notas.
- El servidor usa el dispositivo del token, no el `deviceId` del cuerpo.
- `401 {kind:'session-expired'}` → renovar una vez (`POST /auth/refresh`, con rotación) y reintentar;
  `401 {kind:'device-revoked'}` → borrar la copia local y volver al login.

## 5. Plan por fases (Flutter)

| Fase                                            | Contenido                                                                                                                                                                                                                                                                                                             | Hecho cuando                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **M0 · Vectores compartidos** (en `notify_web`) | Exportar a `docs/api/vectors/*.json`: KDF (con parámetros ligeros y reales), HKDF, envolver/desenvolver, `a1.` con IV fijo, relleno, clave de recuperación (formato y parseo), enlace público, notas Markdown «con todo el formato», casos de sync (entrada → salida esperada). Prueba en la CI web que los verifica. | Web y móvil pasan los mismos vectores        |
| **M1 · Esqueleto**                              | Flutter estable, Riverpod, go_router, tema desde los tokens de Figma (claro/oscuro), i18n `es`, cliente generado desde `openapi.yaml`, CI (análisis, pruebas, build Android; iOS en macOS)                                                                                                                            | App vacía con navegación y tema              |
| **M2 · Cifrado**                                | Argon2id nativo (no Dart puro: es lento), HKDF, AES-GCM (`cryptography`/`pointycastle`), misma API que `core/crypto`. Secretos en Keychain/Keystore (`flutter_secure_storage`), desbloqueo con biometría                                                                                                              | 100 % de vectores de cripto                  |
| **M3 · Datos y sync**                           | SQLite (`drift`) con filas cifradas como en la web, cola de cambios, cursor, paginación, conflictos, lápidas, reintentos sin red                                                                                                                                                                                      | Vectores de sync + prueba contra la API real |
| **M4 · Cuenta**                                 | Registro, código por correo, clave de recuperación (mostrar una vez, confirmar), login (`prelogin` → KDF → `login`), olvidé mi contraseña con clave, dispositivos, `device-revoked`                                                                                                                                   | Flujo completo contra QA                     |
| **M5 · Notas**                                  | Lista, carpetas, búsqueda local, papelera, **editor Markdown** (prototipo con `super_editor` / `appflowy_editor` / `flutter_quill` que guarde los vectores Markdown sin cambios antes de elegir)                                                                                                                      | Paridad con la web                           |
| **M6 · Resto**                                  | Compartir con enlace, ajustes, uso de espacio, importar Markdown, accesibilidad (TalkBack/VoiceOver), modo oscuro                                                                                                                                                                                                     | Paridad con la web                           |
| **M7 · Sistema**                                | App Links / Universal Links para enlaces de restablecer y compartidos (la web publica `assetlinks.json` y `apple-app-site-association`); menú «compartir con Apunte»                                                                                                                                                  | Abre los enlaces del correo en la app        |
| **M8 · Publicación**                            | Play Store (25 USD único), App Store (99 USD/año, necesita macOS), ficha de privacidad, capturas, firma, lanzamiento escalonado                                                                                                                                                                                       | En las tiendas                               |

## 6. Cambios necesarios en otros repos

- **notify_web**: M0 (vectores), archivos de App Links en el dominio, `SHARE_ORIGIN` configurable.
- **notify_backend**: ninguno obligatorio (el móvil nativo no usa CORS). Opcional: identificar la
  plataforma del dispositivo en `deviceName`.
- **Contrato**: `docs/api/openapi.yaml` sigue siendo la única fuente; si cambia, regenerar el cliente.

## 7. Prerrequisitos y riesgos

- Necesita una **API desplegada (QA)** para probar en un teléfono real (ver `backend.md` §7.1); en
  local, el emulador Android ve el host en `10.0.2.2`.
- Riesgos: fidelidad del Markdown (el mayor), tiempo de Argon2id 64 MiB en móviles viejos (1–2 s;
  mostrar progreso, nunca bajar parámetros sin cambiar los del servidor), consumo de memoria al
  descifrar miles de notas (descifrar por páginas).
- Seguridad: nunca registrar contraseñas, claves ni textos; bloquear capturas en pantallas de claves
  (`FLAG_SECURE`), borrar la copia local al cerrar sesión o al recibir `device-revoked`.
