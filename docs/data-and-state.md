# Datos, tipos y estado (sin backend)

Todo lo necesario para construir las 35 vistas con datos de mentira. Cuando existan IndexedDB y la API en Go, **solo cambia la raíz de composición** (`src/lib/app/create-app.svelte.ts`); pantallas y estado no se tocan.

```
domain/  tipos y reglas puras          core/  formato, mensajes, attempt()
data/    contratos + mock/             features/*/state  estado con runes
app/     raíz de composición + contexto        dev/  panel del simulador
```

## Dominio (`src/lib/domain`)

| Archivo                              | Contenido                                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `note.ts`, `folder.ts`               | `Note` (Markdown, etiquetas, fijada, papelera `deletedAt`, `revision`, `syncStatus`), `Folder`, filtros (`NotesFilter`), conteos |
| `auth.ts`, `user.ts`, `device.ts`    | `Session`, `User`, entradas de registro/login, `Device`                                                                          |
| `sync.ts`, `share.ts`, `settings.ts` | Fase de sincronización, `Conflict` y resoluciones, `ShareLink`, `AppSettings` con valores por defecto                            |
| `errors.ts`                          | `AppError` (unión por `kind`), `AppFailure` (lo que lanzan los repositorios), `ActionResult`                                     |
| `validation.ts`                      | Reglas puras con **códigos** (`invalid-email`, `name-taken`…) y `passwordStrength` (0–4, el medidor del diseño)                  |
| `note-text.ts`, `note-groups.ts`     | Vista previa sin Markdown, etiquetas, agrupación "Fijadas · Hoy · Esta semana · mes", días para vaciar la papelera               |

Regla: el dominio no importa nada de la app. Los textos en español viven en `core/messages.ts` (código → frase), no en la lógica.

## Contratos de datos (`src/lib/data/contracts.ts`)

`NoteRepository`, `FolderRepository`, `AuthRepository`, `DeviceRepository`, `SettingsRepository`, `SyncRepository`, `ShareRepository` y `Repositories` (el conjunto). Devuelven la entidad; ante un fallo **lanzan `AppFailure`**. Las implementaciones: `data/mock` (hoy), luego `local` y `remote`.

## Datos simulados (`src/lib/data/mock`)

- **Fixtures deterministas** que reproducen los contadores del diseño: 48 notas activas (Universidad 12 · Personal 9 · Ideas 5 · Recetas 4 · sin carpeta 18), 5 carpetas (`Proyectos` vacía), 3 fijadas, etiquetas `parcial` 6 · `proyecto-final` 3 · `lecturas` 8, y 3 notas en la papelera que vencen en 29, 16 y 9 días. Incluye "Resumen: Bases de datos II" con su contenido en Markdown.
- **Datasets:** `normal`, `first-time` (cuenta vacía) y `large` (2.000 notas).
- **Usuario demo:** `ana@correo.com` / `Secret123!` · código de verificación `123456` · token de recuperación `token-de-prueba` · 3 dispositivos (Laptop Fedora actual, Pixel 8, PC de la universidad).
- **Comportamientos realistas:** las notas se guardan "en local" y quedan `pending` hasta sincronizar; la papelera se vacía sola a los 30 días; mismo error para correo inexistente y contraseña errónea; bloqueo tras 5 intentos fallidos; el enlace de recuperación nunca revela si el correo existe.

## Simulador de escenarios

`app.scenario` (reactivo) + panel en **`/dev/simulator`** (solo en desarrollo). Cada interruptor existe para poder ver pantallas del diseño:

| Interruptor                            | Vistas que habilita                                    |
| -------------------------------------- | ------------------------------------------------------ |
| `offline`                              | 29 banner sin conexión (y los avisos de red en toasts) |
| `injectConflict` + "Sincronizar ahora" | 30 conflicto de sincronización                         |
| `sessionExpired`                       | 31 sesión expirada                                     |
| `serverError`                          | 32 error de servidor                                   |
| `latencyMs` alto (3000)                | 33 skeletons de carga                                  |
| `dataset: first-time`                  | 22 vacío: primera vez                                  |
| carpeta `Proyectos`                    | 21 vacío: carpeta sin notas                            |
| filtro `trash`                         | 23 papelera                                            |

Las demás vistas (autenticación 5–10, ajustes 11–17, menús y modales 24–28, búsqueda 19–20) se ven con los datos normales y el estado correspondiente.

## Estado (`src/lib/features/*/state`, runes)

| Clase                           | Qué expone                                                                                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NotesState`                    | `all`, `visible`, `groups`, `counts`, `tags`, `selected`, `filter`, `sort`, `status`/`error`; acciones `create`, `update` (optimista, con reversión), `togglePin`, `moveToFolder`, `duplicate`, `moveToTrash`, `restore`, `deleteForever`, `emptyTrash` |
| `FoldersState`                  | `list`, `name(id)`; `create`/`rename` con validación en cliente, `remove` (recarga las notas)                                                                                                                                                           |
| `SearchState`                   | `query`, `scope`, `results`, `status` (`idle`/`results`/`empty`), `terms` (para resaltar). Sin tildes ni mayúsculas, prefijos y tolerancia a errores de tipeo                                                                                           |
| `AuthState`                     | `status` (`unknown`/`anonymous`/`authenticated`/`expired`), `fieldErrors`, `pendingEmail`, enfriamiento de reenvío; `register`, `verify`, `resendCode`, `login`, `logout`, `forgotPassword`, `resetPassword`                                            |
| `SyncState`                     | `phase` (`idle`/`syncing`/`offline`/`error`), `pendingCount`, `firstConflict`; `syncNow`, `resolve`                                                                                                                                                     |
| `SettingsState`, `DevicesState` | Ajustes con cambio optimista; dispositivos (actual / otros)                                                                                                                                                                                             |
| `ShareState`                    | Enlaces de solo lectura por nota                                                                                                                                                                                                                        |

Convenciones:

- Las acciones **no lanzan**: devuelven `ActionResult` (`{ ok: true, value }` o `{ ok: false, error }`). `lastError`/`error` quedan en el estado para avisos y pantallas de error.
- Los errores de validación son **códigos**; el texto sale de `validationMessage(code)` / `errorMessage(error)`.
- Si una llamada remota responde `session-expired`, el estado avisa a `AuthState` (el diálogo de sesión vencida se abre solo).

## Cómo se usa desde una pantalla

```svelte
<script lang="ts">
	import { getApp } from '#lib/app/index.js';
	import { formatNoteDate, validationMessage } from '#lib/core/index.js';

	const { notes, folders, sync } = getApp();
</script>

{#if notes.status === 'loading'}
	<!-- skeletons -->
{:else if notes.status === 'error'}
	<!-- error de servidor -->
{:else if notes.isFirstTime}
	<!-- primera vez -->
{:else}
	{#each notes.groups as group (group.key)}
		<h3>{group.label}</h3>
		{#each group.notes as note (note.id)}
			{note.title} · {formatNoteDate(note.updatedAt, new Date())}
		{/each}
	{/each}
{/if}
```

## Pruebas

`pnpm test:unit`: dominio, formato y mensajes, backend simulado (contadores del diseño, papelera, cuentas, sincronización, escenarios), estado de notas/búsqueda/cuenta y la composición completa (sincronización, carpetas, ajustes, dispositivos, compartir) más una prueba en navegador de la reacción a los escenarios.

## Persistencia local y sincronización

`createApp({ persistence: 'indexeddb' })` (el layout raíz) guarda notas, carpetas y ajustes en IndexedDB (`data/local`) y los sincroniza con `MockSyncServer`. `persistence: 'memory'` (por defecto, usado en las pruebas) mantiene todo en el simulador. Protocolo y decisiones en `docs/adr/0004-sincronizacion.md`; pruebas en `src/lib/data/local/local-sync.spec.ts`.

**Cifrado de extremo a extremo (modo `indexeddb`).** Las notas y carpetas se guardan **cifradas** en IndexedDB y viajan cifradas a `POST /sync`; el servidor solo ve metadatos (id, carpeta, fechas, papelera, revisión) y dos textos cifrados por elemento. La clave sale de la sesión (`VaultState`); bloqueada la app, los repositorios locales lanzan `locked` pero la sincronización sigue subiendo y bajando filas cifradas. Cifrar es asíncrono y no cabe en una transacción de IndexedDB, así que cada operación de escritura pasa por una cola (`Mutex`): lee, cifra y escribe de principio a fin. Una fila que no se puede descifrar sale como «Nota ilegible» en vez de romper la lista. El modo `memory` (pruebas y simulador por defecto) **no cifra**: solo sirve para la interfaz. Plan completo en `docs/plans/0005-cifrado-extremo-a-extremo.md`.

**Servidor real (`PUBLIC_BACKEND=http`).** Con `PUBLIC_BACKEND=http` y `PUBLIC_API_URL=https://…` (variables de compilación; el CSP `connect-src` se calcula de esa URL) el layout pasa `api` a `createApp` y `createLocalBackend({ remote })` cambia solo las fuentes remotas: `HttpAuthRepository`, `HttpDeviceRepository`, `HttpShareRepository`, `HttpStorageRepository` y `HttpSyncTransport` (`src/lib/data/remote`). `HttpClient` renueva el token de acceso una sola vez a la vez (también entre pestañas, con Web Locks), guarda los tokens en `TokenStore` y traduce los errores `{kind, code?, …}` del servidor a `AppFailure`; nunca muestra texto del servidor. `LocalSyncRepository.run` repite `POST /sync` mientras `hasMore` sea verdadero. Con `mock` (por defecto) nada cambia. Desarrollo local completo con un solo comando: `pnpm dev:http` (base en contenedor, sin instalar PostgreSQL; `CONTAINER_ENGINE=podman` o `docker`). E2E contra la API de verdad: `pnpm e2e:http` (necesita el repo `notify_backend` y un PostgreSQL de pruebas; ver `e2e-http/api.sh`).

## Importar notas (Markdown)

Ajustes → Almacenamiento → «Importar notas» abre un selector de archivos `.md`, `.markdown` o `.txt` (varios a la vez, hasta 2 MB cada uno). `parseMarkdownNote` (`domain/markdown-import.ts`) convierte cada archivo en una nota: si empieza con `# título` (como escribe la exportación de Apunte) ese es el título y se quita del texto; si no, el título es el nombre del archivo. Sin carpetas ni etiquetas; las imágenes enlazadas quedan como texto. `NotesState.importNotes` crea las notas por el camino normal (en modo `indexeddb` quedan cifradas y se sincronizan) y cuenta cuántas se crearon y cuántas fallaron; los archivos demasiado grandes o ilegibles se omiten y se avisa.
