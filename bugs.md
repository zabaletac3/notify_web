# Bugs

Análisis hecho leyendo el código con codebase-memory (sin ejecutar la app). Rutas relativas a `notify_web/`.
Segunda revisión: corrige la causa de 4b y replantea 1, 2, 4a y 6.

## 1. El tiempo de bloqueo no persiste al cerrar sesión

- [x] Hecho — preferencias del dispositivo en `localStorage` por cuenta (`data/local/device-prefs.ts`); `LocalSettingsRepository` lee/escribe ahí con migración desde `meta.settings`; se cargan antes de desbloquear (`beforeUnlock`); cerrar sesión no las borra y eliminar la cuenta sí. Pruebas: `device-prefs.spec.ts`, `device-prefs.svelte.spec.ts`.
- [x] Ajuste — **al cerrar sesión se borra la marca `apunte-active-<userId>`** (`DevicePrefs.removeActiveAt` desde `onSignedOut`); las preferencias `apunte-prefs-<userId>` se conservan. Prueba en `device-prefs.svelte.spec.ts`.
- [x] Ajuste — **`SettingsState.reset()`** olvida el `userId` y vuelve a `DEFAULT_SETTINGS` al cerrar sesión o borrar la cuenta, para que un cambio sin sesión no se escriba en las preferencias de la cuenta anterior. Prueba en `device-prefs.svelte.spec.ts`.

**Causa (confirmada en el código):** los ajustes se guardan en la base local de la cuenta
(`LocalSettingsRepository` → `db.setMeta('settings')`). Al cerrar sesión, `onSignedOut` hace `local.destroy()`
(`src/lib/app/create-app.svelte.ts:151`) y borra esa base, ajustes incluidos. Al volver a entrar se cargan
`DEFAULT_SETTINGS` (`lockTimeout: '1m'`). Afecta a todos los ajustes, no solo al bloqueo.

**Problema relacionado:** los ajustes solo se cargan en `doLoadData()`, después de iniciar sesión. Pero `login`
decide si recordar la clave con `rememberDevice()` = `!settings.values.lockOnExit` **antes** de esa carga, así que
usa el valor por defecto. Si solo se arregla la persistencia, "Bloquear al salir" desactivado no se respetaría
tras iniciar sesión.

**Arreglo:** un almacén de preferencias del dispositivo fuera de la base de la cuenta (`localStorage`, clave por
`userId`), que se lee de forma síncrona en cuanto se conoce el `userId` (arranque e inicio de sesión), antes de
desbloquear el cofre. Cerrar sesión no lo borra; eliminar la cuenta sí.
No se sincroniza con el servidor: los ajustes de bloqueo son por dispositivo y, en un modelo E2EE, el servidor no
debe poder cambiarlos. (`docs/api/openapi.yaml` define `/settings`, pero el backend no lo implementa; si algún día
se sincronizan preferencias, que sean solo las de apariencia.)

## 2. El botón rojo "Mover a la papelera" se desborda de la modal

- [x] Hecho — el `AlertDialog` de `trash` usa ahora `AlertDialog.Footer` (apila los botones en móvil y los alinea a la derecha en escritorio), como las otras modales. Causa confirmada leyendo el flujo: el `<div>` a mano era `flex` en fila también en móvil. Nota: `Mover a carpeta`/`Nueva carpeta` siguen con el patrón a mano porque son `Dialog`/`Sheet`, no `AlertDialog`.

**Causa (probable, falta verlo en pantalla):** el `AlertDialog` de `trash` en
`src/routes/(app)/note-dialogs.svelte` usa un `<div class="flex gap-3 *:flex-1 …">` hecho a mano en vez de
`AlertDialog.Footer`, que ya existe y ya apila los botones en móvil (`flex-col-reverse … sm:flex-row sm:justify-end`).
Las otras modales (`notes/+page.svelte`, `settings/storage`) sí usan el `Footer`.

**Arreglo:** sustituir ese `div` por `AlertDialog.Footer`. Validar a 360, 390, 768 y ≥1280 px, y comparar con Figma.

## 3. Poder deshabilitar el tiempo de bloqueo

- [x] Hecho — `'never'` añadido a `LockTimeout`/`LOCK_TIMEOUT_MS` (distinto de `immediately`), opción «Nunca» con aviso en Privacidad, `never` en el enum de `openapi.yaml` y valores desconocidos caen al defecto. Pruebas: `settings.spec.ts`, `auto-lock.svelte.spec.ts`.

**Estado actual:** `LockTimeout = 'immediately' | '1m' | '5m' | '15m'`, y `LOCK_AFTER_MS` usa `0` para
"inmediatamente", que `armLock` interpreta como "no armar temporizador".

**Arreglo:** añadir `'never'` al tipo, a `LOCK_AFTER_MS` (como `null`, distinto de `immediately`), a `armLock`, a
las opciones de `settings/privacy` ("Nunca", con una línea de aviso) y al enum de `docs/api/openapi.yaml`.

## 4. Al recargar pide la contraseña y luego aparece un error con "Reintentar"

- [x] Hecho — **4a:** interruptor renombrado y descripción del tiempo de bloqueo; al bloquear (inactividad/inmediato) se borra la clave del dispositivo; `lastActiveAt` en preferencias (con límite de escritura) decide si restaurar al recargar; `never` restaura siempre. **4b:** `doLoadData` no carga si el cofre está bloqueado y el efecto de desbloqueo recarga si el estado no es `ready`. Pruebas: `vault-lock.spec.ts`, `restore-timeout.svelte.spec.ts`, `unlock-bootstrap.svelte.spec.ts`.
- [x] Ajuste — **al ocultar o cerrar la pestaña (`visibilitychange`/`pagehide`) la actividad se guarda sin el límite de 15 s**, para que el dato al recargar sea exacto y no se pida la contraseña hasta 15 s antes de tiempo con `lockTimeout: '1m'`. El resto de eventos mantiene el límite. Prueba en `auto-lock.svelte.spec.ts`.

**4a. Pide contraseña aunque no haya pasado el tiempo.** Es el diseño: `lockOnExit` es `true` por defecto, la
clave no se guarda en el dispositivo y cualquier recarga pide contraseña. `lockTimeout` solo cuenta inactividad con
la pestaña abierta. Son dos ajustes que parecen uno.

- **Arreglo de producto:** renombrar el interruptor a algo como "Pedir contraseña al recargar o cerrar la pestaña"
  y explicar que el tiempo de bloqueo es por inactividad. El valor por defecto es decisión de producto.
- **Fallo real encontrado:** con `lockOnExit = false`, el bloqueo por inactividad se salta recargando.
  `VaultState.lock()` no borra la clave guardada, y `restore()` la vuelve a cargar al recargar.
  **Arreglo:** al bloquear por inactividad, borrar la clave guardada del dispositivo; y guardar `lastActiveAt` para
  que `restore()` no restaure (y borre la clave) si pasó el tiempo de bloqueo con la pestaña cerrada.

**4b. Error tras desbloquear (causa muy probable, sin reproducir).** No es un problema de red.
Al recargar bloqueado, `bootstrap()` llama a `loadData()` aunque el cofre esté bloqueado; `notes.load()` no puede
descifrar y deja `notes.status = 'error'`. Al desbloquear, el efecto de `create-app.svelte.ts` solo recarga si
`notes.status === 'idle'`, así que no recarga y `/notes` muestra el error hasta pulsar "Reintentar".
El bloqueo por inactividad no falla porque ahí sí se hace `notes.reset()` (vuelve a `idle`).

**Arreglo:** no cargar notas, carpetas ni sincronizar mientras el cofre esté bloqueado (`doLoadData` sale antes),
y al desbloquear recargar si el estado no es `ready`. Prueba con `testApp()`: recarga bloqueada → desbloqueo →
notas `ready` sin error.

## 5. Los campos de contraseña no tienen el icono de ojo

- [x] Hecho — `AuthField` añade un botón de ojo (iconos `eye`/`eye-off` en `AppIcon`) que alterna `password`/`text` sin cambiar `autocomplete` ni perder el valor; `aria-label`/`aria-pressed` y área de 44 px. Las 7 pantallas ya usaban `AuthField`, así que no hubo que migrar ninguna. Prueba: `auth-field.svelte.spec.ts`.

**Causa:** `src/lib/components/app/auth-field.svelte` pasa `type` directo a `Input`. Hay 7 pantallas con
`type="password"`: login, register, reset-password, unlock, recovery-key, settings/account, settings/delete-account.

**Arreglo:** en `AuthField` con `type="password"`, botón ojo (usando `ui/input-group`) que alterna a `text`, con
`aria-label` "Mostrar/Ocultar contraseña" y `aria-pressed`; `autocomplete` no cambia. Comprobar qué pantallas usan
`Input` directo y pasarlas a `AuthField`. Añadir `eye`/`eye-off` a `AppIcon` si faltan.

## 6. Autocompletado de palabras tipo WhatsApp

- [x] Descartado (decisión de producto)

**Estado actual:** el editor es TipTap (contenteditable) y el título un `<textarea>`. Ninguno desactiva la
corrección ni las sugerencias, así que el teclado del móvil ya debería ofrecerlas. Añadir `spellcheck` /
`autocorrect` casi seguro no cambia nada (son los valores por defecto).

- Si se probó en **escritorio**: los navegadores no tienen predicción de palabras; no es un bug.
  Hacerla propia es una funcionalidad grande y de poco valor; no se recomienda.
- Si se probó en **móvil** y no salen sugerencias: sí hay algo que investigar (teclado + TipTap), con el
  dispositivo y el navegador concretos.
