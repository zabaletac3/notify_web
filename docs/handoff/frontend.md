# AxoNote · Web (SvelteKit) — estado y pendientes

> Documento de traspaso para una sesión nueva de Claude Code en el repo **`zabaletac3/notify_web`**.
> Actualizado: 2026-10-08. Léelo entero; después `CLAUDE.md`, `docs/architecture.md` y `docs/conventions.md`.

## 1. Qué es AxoNote

App de notas **offline-first con cifrado de extremo a extremo** (Markdown, carpetas, búsqueda, papelera,
enlaces públicos de solo lectura, varios dispositivos). Cada dispositivo guarda una copia local cifrada
y sincroniza con la API; el servidor solo ve metadatos y textos cifrados. UI en **español**.

| Repo             | Qué                     | Estado                                                       |
| ---------------- | ----------------------- | ------------------------------------------------------------ |
| `notify_web`     | **este**: web SvelteKit | completa con simulador y con la API real                     |
| `notify_backend` | API Go + PostgreSQL     | fases 0–11 hechas; sin desplegar (`docs/handoff/backend.md`) |
| `notify_desktop` | Tauri 2 Linux/Windows   | por crear (`docs/handoff/escritorio.md`)                     |
| `notify_mobile`  | Android/iOS             | por crear (`docs/handoff/movil.md`)                          |

Este repo es la **fuente de verdad compartida**: contrato `docs/api/openapi.yaml`, decisiones
`docs/api/decisions.md`, ADRs `docs/adr/0001…0005`, planes `docs/plans/0005` (cifrado) y `0006` (backend),
`docs/roadmap.md`. Diseño: Figma «AxoNote – App de notas» (35 vistas; no tocar Figma sin que se pida).

## 2. Stack y arquitectura

SvelteKit 3 + Svelte 5 (**runes**), TypeScript estricto, shadcn-svelte (estilo `vega`, base `stone`) +
Tailwind v4 (tokens en `src/lib/styles/tokens.css`, sin colores ni medidas arbitrarias), Lucide vía
`AppIcon`, TipTap (editor Markdown), Dexie (IndexedDB), hash-wasm (Argon2id), Vitest (+ navegador),
Playwright, Storybook. Alias `#lib/...`. pnpm.

Capas (ESLint las verifica): `routes → features → data → fuente`. `domain/` (tipos) y `core/`
(cripto, utilidades) no dependen de la UI. Una feature se importa solo por su `index.ts`.

```
src/lib/domain        tipos (Note, Folder, SyncRequest/Response con hasMore, errores AppError…)
src/lib/core/crypto   Argon2id (worker), HKDF, AES-GCM `a1.`, claves, clave de recuperación, relleno
src/lib/data          contracts.ts (interfaces de repositorios)
  mock/               simulador (MockDatabase, MockSyncServer, escenarios)
  local/              IndexedDB + cola de cambios + LocalSyncRepository (paginado) + createLocalBackend
  crypto/             vault, note-codec, share-codec, account-keys, device-keys
  remote/             HttpClient (refresh en vuelo único + Web Locks), TokenStore, repos HTTP
src/lib/features      auth, vault, notes, folders, search, trash, share, settings, storage, sync
src/lib/app           createApp() + getApp(): la UI obtiene TODO de aquí, nunca de repositorios
src/routes            (app)/notes · (auth) login/register/verify/recovery-key/forgot/reset/unlock ·
                      (intro) welcome/onboarding · (settings)/settings/* · n/[slug] (enlace público) ·
                      (marketing) landing · dev/simulator · dev/design-system
```

Estado: clases `.svelte.ts` inyectadas por contexto; las acciones devuelven `ActionResult` (no lanzan);
los errores de validación son códigos (`validationMessage`). Markdown de usuario siempre sanitizado.

## 3. Modos de datos

| Modo                   | Cómo                                                                  | Para qué                                                                 |
| ---------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Simulado (por defecto) | `pnpm dev`                                                            | UI sin backend; el código de verificación es `123456`                    |
| API real               | `.env`: `PUBLIC_BACKEND=http`, `PUBLIC_API_URL=http://localhost:8080` | desarrollo contra Go                                                     |
| Todo junto             | `pnpm dev:http`                                                       | Postgres en contenedor (docker/podman) + roles + migraciones + API + web |

Al arrancar, `pnpm dev` dice en la terminal a qué backend habla y si la API responde; la consola del
navegador también. Variables `PUBLIC_*` se leen al arrancar/compilar (reiniciar tras cambiarlas).
`persistence: 'indexeddb'` cifra; `'memory'` (pruebas) no cifra.

## 4. Cifrado (resumen; detalle en ADR 0005 y plan 0005)

Contraseña → Argon2id (64 MiB, t=3, p=1, sal 16 B por cuenta) → HKDF-SHA256 → `authKey`
(`apunte/v1/auth`, va al servidor) y KEK (`apunte/v1/kek`). Clave maestra AES-256 envuelta con la KEK y
con la clave de recuperación (52 car. Crockford base32 + control). Cada nota/carpeta tiene su clave,
envuelta con la maestra. Texto cifrado `a1.<iv>.<ct>` (AES-GCM, IV 12 B, AAD que liga cuenta/tipo/id),
contenido JSON rellenado a múltiplos de 256 B. Enlace público: copia cifrada con una clave propia que va
en el fragmento `#k=` (nunca llega al servidor). **Nunca registrar** contraseñas, claves ni textos.

## 5. Calidad y flujo

`pnpm verify` (check + lint + unitarias + build, como la CI) · `pnpm test:unit --run` ·
`pnpm exec playwright test` (32 e2e con simulador; un solo worker porque el KDF es pesado) ·
`pnpm e2e:http` (3 escenarios contra la API Go real: registro + dos dispositivos + enlace público +
dispositivo revocado; conflicto; recuperación) · `pnpm api:lint` · `pnpm storybook`.
Sin Chromium de Playwright: `CHROMIUM_PATH=/ruta/al/chrome`. Se trabaja directo en `main` (commits
pequeños, con husky + lint-staged).

## 6. Lo que falta (por prioridad)

1. **Desplegar en Cloudflare Pages** (decidido: `main` → `app.<dominio>`, `develop` → `qa.<dominio>`;
   ver `docs/handoff/despliegue.md` §6). Hoy usa `adapter-auto` (no despliega en ningún sitio): cambiar a
   `adapter-static` con `fallback`, pasar las cabeceras de `src/hooks.server.ts` y la CSP a `_headers`.
2. **Configuración por entorno**: `SHARE_ORIGIN` está fijo en `https://apunte.app`
   (`src/lib/data/crypto/share-codec.ts`) y el origen de la API por defecto en `vite.config.ts` también;
   volverlos `PUBLIC_*` (QA y prod tienen dominios distintos; el escritorio no debe usar `tauri://`).
3. **Preparar el escritorio** (ver `escritorio.md`): build estático con `fallback`, detectar Tauri
   (`isTauri`), permitir guardar tokens/clave en el llavero del sistema vía una interfaz inyectable en
   `TokenStore` / `device-keys`.
4. **Vectores de prueba compartidos** para el móvil (ver `movil.md` §M0): exportar a
   `docs/api/vectors/*.json` casos de KDF, envoltura de claves, `a1.`, clave de recuperación, enlaces y
   sincronización, y una prueba que los regenere/verifique en la CI. Es lo que garantiza que otra app
   lea las notas escritas aquí.
5. **Tokens fuera de `localStorage`** (hecho para la web en D15): la web usa cookie `HttpOnly`
   (`axonote_rt`) con `X-AxoNote-Session: cookie` y el token de acceso solo en memoria
   (`PUBLIC_SESSION_MODE=cookie`, por defecto). Escritorio/móvil siguen en modo cuerpo
   (`Authorization: Bearer` + `refreshToken` en el cuerpo, `PUBLIC_SESSION_MODE=body`); para ellos
   valorar el llavero del sistema (`TokenStore` inyectable, ver `escritorio.md`).
6. **Pantallas pendientes** (roadmap fase 5): landing por rediseñar, comparación del modo oscuro con
   Figma, imágenes en notas (requiere diseño de cifrado de adjuntos + API).
7. **Calidad** (roadmap fase 6): auditoría de accesibilidad (axe ya está instalado), pruebas de
   pantallas, lista virtualizada para cuentas grandes, medir el primer arranque con miles de notas.
8. **Funciones que esperan al backend**: 2FA (hoy rechazada a propósito), `DELETE /me` pidiendo la
   contraseña, recordatorio al cerrar sesión con cambios sin subir (ya existe «Sincronizar y salir»).
9. **Política de privacidad y términos** (enlazados desde el registro).

## 7. Cómo trabajar

- Si cambias un contrato de `src/lib/data/contracts.ts` o el formato de algo cifrado, actualiza
  `docs/api/openapi.yaml`, el backend y (cuando exista) los vectores compartidos.
- Para ver estados (sin conexión, error, conflicto, vacío) usa `/dev/simulator`; las pruebas de estado
  usan `testApp()` de `#lib/test/test-app.js`.
- Componentes shadcn nuevos: `pnpm dlx shadcn-svelte@latest add <nombre>` y revisar que usen tokens.
