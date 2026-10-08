# Arquitectura

## Principios

1. **La UI no habla con datos directamente.** Habla con interfaces de repositorio (`NoteRepository`, `FolderRepository`…). Las implementaciones cambian por fase: `mock` → `local` (IndexedDB) → `remote` (API). La interfaz no cambia.
2. **Los estados son pantallas de primera clase:** cargando, vacío, error, sin conexión y conflicto se diseñan y prueban desde el inicio.
3. **Un solo origen de diseño:** los tokens vienen de Figma (`docs/design-tokens.md`). Nada de colores, tamaños o espaciados arbitrarios.
4. **Svelte 5 con runes y TypeScript estricto.** El estado compartido vive en clases `.svelte.ts`, inyectado por contexto (sin singletons globales mutables).

## Capas

```
pantalla (routes/)  →  feature (state, services, components)  →  repositorio (data/)  →  fuente (mock | IndexedDB | API)
```

Cada capa solo conoce a la de abajo. `domain/` (tipos) y `core/` (infraestructura) son transversales y no dependen de la UI.

| Carpeta           | Responsabilidad                                  | Puede importar                                                                                 | No puede importar                |
| ----------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------- |
| `routes/`         | Pantallas, layouts, composición                  | todo lo público de `lib/`                                                                      | —                                |
| `features/<x>/`   | Casos de uso, estado y componentes de un dominio | `domain`, `data` (interfaces), `core`, `components`, otras features **solo por su `index.ts`** | internos de otra feature         |
| `components/app/` | Componentes compuestos de Apunte (presentación)  | `components/ui`, `domain`, `core`                                                              | `data`                           |
| `components/ui/`  | Primitivos shadcn-svelte                         | `core` (utilidades)                                                                            | `features`, `data`, `domain`     |
| `data/`           | Contratos e implementaciones de datos            | `domain`, `core`                                                                               | `features`, `components`         |
| `core/`           | HTTP, errores, config, utilidades sin dominio    | —                                                                                              | `features`, `components`, `data` |
| `domain/`         | Tipos puros                                      | —                                                                                              | todo lo demás                    |

Estas reglas se **verifican con ESLint** (`no-restricted-imports` en `eslint.config.js`): `pnpm lint` falla si se rompen.

## Componentes por niveles

- **Nivel 0 — `components/ui/`:** primitivos de shadcn-svelte (button, dialog, sheet…). Se editan para ajustarlos a los tokens, pero se mantienen genéricos.
- **Nivel 1 — `components/app/`:** envoltorios con el estilo de Apunte (`SettingRow`, `SwitchRow`, `FormField`…).
- **Nivel 2 — `features/*/components/`:** componentes de dominio (`NoteCard`, `NoteList`, `FolderPicker`, `ConflictDialog`…).
- **Nivel 3 — `routes/`:** pantallas que componen lo anterior.

Los componentes de presentación reciben props y emiten eventos; **no cargan datos**.

## Estado con runes

```ts
// features/notes/state/notes.svelte.ts  (ejemplo)
export class NotesState {
	notes = $state<Note[]>([]);
	status = $state<'idle' | 'loading' | 'error'>('idle');

	constructor(private repo: NoteRepository) {}

	async load() {
		/* … */
	}
}
```

Se crea una vez en el layout `(app)` y se comparte con `setContext`/`getContext`. En pruebas se inyecta un repositorio mock.

## Composición y contexto

`src/lib/app/create-app.svelte.ts` es la **raíz de composición**: crea los repositorios (hoy los simulados), los estados (`NotesState`, `AuthState`, …) y los conecta (p. ej. sincronizar recarga las notas; una sesión vencida avisa a `AuthState`). El layout raíz llama `setApp(createApp())` y cualquier componente usa `getApp()`. Es el único lugar que cambia al pasar a datos reales.

## Errores

Los repositorios lanzan `AppFailure` con un `AppError` tipado (`network`, `server`, `session-expired`, `validation`, `conflict`…). El estado los atrapa con `attempt()` y devuelve `ActionResult`, así las pantallas no usan `try/catch`. Los textos están en `core/messages.ts`.

## Rutas

- `(marketing)`: prerenderizada (`prerender = true`).
- `(auth)`: formularios de cuenta.
- `(app)`: SPA (`ssr = false`), lo que permite empaquetarla con Tauri (adapter-static) sin cambios.
- `dev/`: catálogo de componentes; devuelve 404 fuera de desarrollo.

## Responsive en lugar de apps separadas

La web es responsiva: ≥ md usa 3 paneles redimensionables (barra lateral, lista, editor); en pantallas estrechas la barra lateral pasa a un cajón y lista/editor se alternan. Las vistas Android del diseño son la referencia para ese modo.

## Hacia offline-first

1. Fases 1–5: `data/mock` (en memoria) con un simulador de escenarios (sin conexión, error 500, sesión expirada, conflicto).
2. Después: `data/local` (IndexedDB con Dexie) como copia de trabajo + cola de cambios pendientes.
3. Después: `data/remote` (cliente generado desde OpenAPI) y el motor de sincronización en `features/sync`.

Ver `docs/adr/` para las decisiones.

## Seguridad

Las notas, las carpetas y los enlaces se cifran en el cliente (ver [ADR 0005](adr/0005-cifrado-extremo-a-extremo.md)); la clave maestra vive en memoria. Lo que podría leerla es código ajeno ejecutándose en la página (XSS), así que la web se sirve con una política de contenido estricta y cabeceras de seguridad. El formato que comparten la web y las apps nativas queda fijado en [`docs/api/vectors/`](api/vectors/README.md) (vectores de prueba compartidos).

**Política de seguridad de contenido (CSP)** — se define en `vite.config.ts` (`cspDirectives`) y SvelteKit la añade como cabecera (páginas dinámicas, con _nonce_) o como `<meta>` (páginas prerenderizadas, con _hash_):

| Directiva                                 | Valor                                                 | Por qué                                                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `default-src`                             | `'self'`                                              | Todo lo demás, solo del propio origen                                                                                                                  |
| `script-src`                              | `'self' 'wasm-unsafe-eval'` + nonce/hash de SvelteKit | Sin scripts en línea ni de terceros. `wasm-unsafe-eval` es para Argon2id (WebAssembly); **no** permite `eval` de texto                                 |
| `style-src`                               | `'self' 'unsafe-inline'`                              | Vite (en desarrollo), bits-ui y sonner crean `<style>` al ejecutarse y no admiten nonce. Riesgo bajo: no ejecuta código y no hay por dónde sacar datos |
| `img-src` / `font-src`                    | `'self' data: blob:` / `'self' data:`                 | Sin cargar nada de fuera                                                                                                                               |
| `connect-src`                             | `'self' https://api.apunte.app`                       | Solo el propio origen y la API (en desarrollo, también `ws:` y `http:` para Vite)                                                                      |
| `worker-src`                              | `'self' blob:`                                        | El worker de Argon2id                                                                                                                                  |
| `base-uri` / `form-action` / `object-src` | `'none'` / `'self'` / `'none'`                        |                                                                                                                                                        |
| `frame-ancestors`                         | `'none'`                                              | Que nadie incruste la app. Solo vale como cabecera, no en `<meta>`                                                                                     |

Reglas para no romperla: **no** añadir scripts en línea (el del tema es un archivo, `static/theme-init.js`), ni librerías que carguen scripts, fuentes o imágenes de otros orígenes, ni `eval`. Si hay que abrir algo, se añade a `cspDirectives` y se anota aquí. `e2e/cifrado.e2e.ts` y `e2e/seguridad.e2e.ts` fallan si el navegador reporta cualquier violación.

**Cabeceras** (`src/hooks.server.ts`): `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` (sin cámara, micrófono ni ubicación), `Cross-Origin-Opener-Policy: same-origin-allow-popups` y, solo en producción, `Strict-Transport-Security`. Si la web se sirve como archivos estáticos (sin servidor de SvelteKit), el alojamiento debe poner **las mismas cabeceras más la CSP**; por ejemplo, con nginx:

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-<hash del inline de SvelteKit>'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.apunte.app; worker-src 'self' blob:; base-uri 'none'; form-action 'self'; object-src 'none'; frame-ancestors 'none'" always;
add_header Referrer-Policy "no-referrer" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
```

Con archivos estáticos, copia la política (con el `sha256` del script de arranque) de la etiqueta `<meta http-equiv="content-security-policy">` que SvelteKit deja en el HTML generado (`.svelte-kit/output/prerendered/`). El adaptador de escritorio (Tauri) y la app móvil empaquetan el código, así que no dependen de esto.

**Pendiente — Trusted Types.** Se probó `require-trusted-types-for 'script'` (con `trusted-types svelte-trusted-html dompurify`) y se revirtió: la app dejaba de cargar por una violación en un fragmento del cliente (hace falta identificar la librería, o una política `default`). Se reevalúa cuando haya tiempo; DOMPurify y TipTap deben funcionar con una política propia.
