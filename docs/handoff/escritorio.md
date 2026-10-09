# AxoNote · App de escritorio (Tauri 2 · Linux y Windows) — plan y contexto

> Documento de traspaso para una sesión nueva de Claude Code que **crea** el repo `zabaletac3/notify_desktop`.
> Actualizado: 2026-10-08. Todavía no existe código de escritorio. Léelo entero antes de empezar.
> Copia este archivo al repo nuevo como `docs/handoff.md` y deriva de él su `CLAUDE.md`.

## 1. Qué es AxoNote y qué ya existe

App de notas **offline-first con cifrado de extremo a extremo** (Markdown, carpetas, búsqueda, papelera,
enlaces públicos, varios dispositivos). El servidor nunca descifra. UI en **español**.

| Repo                                  | Estado                                        |
| ------------------------------------- | --------------------------------------------- |
| `notify_web` (SvelteKit 3 + Svelte 5) | completa; **es la interfaz que se empaqueta** |
| `notify_backend` (Go + PostgreSQL)    | completo (fases 0–11), sin desplegar todavía  |
| `notify_desktop`                      | **este documento**                            |
| `notify_mobile`                       | por crear (`movil.md`)                        |

Decisión ya tomada (ADR 0001 de `notify_web`): el escritorio **envuelve la web con Tauri 2** sin
reescribir la interfaz. La parte `(app)` de la web ya es SPA (`ssr = false`) para poder usar
`adapter-static`. Cifrado y sincronización son los de la web (IndexedDB funciona en WebView2 y
WebKitGTK); no hay que reimplementarlos.

## 2. Estructura propuesta

Repo aparte (lo pidió la persona) con la web como **submódulo git fijado a un tag**:

```
notify_desktop/
  web/                 submódulo → notify_web (tag vX.Y.Z)
  src-tauri/           Rust: main.rs, comandos (llavero), tauri.conf.json, capabilities/, icons/
  scripts/build-web.sh compila la web en modo escritorio (ver §4)
  .github/workflows/   ci.yml (matriz ubuntu-22.04 + windows-latest), release.yml (tag v*)
```

(Alternativa más simple para una persona: `src-tauri/` dentro de `notify_web`. Se eligió repo aparte
para publicar a su ritmo y aislar los secretos de firma.)

## 3. Cambios previos en `notify_web` (hacerlos allí, con PR/commit propio)

1. **Build estático**: `adapter-static` con `fallback: 'index.html'` cuando `PUBLIC_TARGET=desktop`
   (la web normal sigue con su adaptador). Comprobar que `n/[slug]` (enlace público) funciona en cliente.
2. **`SHARE_ORIGIN` configurable** (`src/lib/data/crypto/share-codec.ts`, hoy fijo en
   `https://apunte.app`): los enlaces compartidos y los de los correos deben apuntar al **dominio web**,
   nunca a `tauri://localhost`.
3. **Detectar Tauri** (`isTauri()` en `core`) y permitir **inyectar el almacén de secretos**:
   `TokenStore` (hoy `localStorage`) y la clave del dispositivo (`data/crypto/device-keys.ts`, hoy
   IndexedDB) deben poder usar el llavero del sistema vía comandos de Tauri.
4. **CSP**: en el webview la política la pone `tauri.conf.json`; mantener `connect-src` solo a la API.
5. Cabeceras de `src/hooks.server.ts` no aplican en Tauri (no hay servidor); revisar el equivalente en
   `tauri.conf.json` donde corresponda.

## 4. Cómo se compila

```bash
cd web && pnpm install && PUBLIC_TARGET=desktop PUBLIC_BACKEND=http \
  PUBLIC_API_URL=https://api.<dominio> pnpm build   # → web/build (estático)
cd .. && pnpm tauri build                              # Linux: AppImage/.deb/.rpm · Windows: NSIS/MSI
```

Desarrollo: `pnpm tauri dev` con `devUrl` apuntando a `pnpm dev` de la web (puerto 5173) y la API local
(`pnpm dev:http` en `notify_web` levanta Postgres + API + web).

## 5. Plan por fases

| Fase                                   | Contenido                                                                                                                                                                                                                                                                                                                                                          | Hecho cuando                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **D0 · Esqueleto**                     | `create-tauri-app` (Tauri 2), submódulo, `build-web.sh`, ventana con tamaño mínimo, instancia única, recordar tamaño/posición, iconos, CI con matriz Linux + Windows que compila                                                                                                                                                                                   | La app abre la web empaquetada                                       |
| **D1 · Ajustes en la web**             | §3 completo                                                                                                                                                                                                                                                                                                                                                        | La web compila en modo escritorio sin tocar su comportamiento normal |
| **D2 · Backend**                       | Añadir a `ALLOWED_ORIGINS` de la API los orígenes de Tauri: `tauri://localhost` (Linux/macOS) y `http://tauri.localhost` (Windows); probar CORS de `/v1/*`                                                                                                                                                                                                         | Login y sync funcionan desde la app contra la API                    |
| **D3 · Seguridad**                     | Comandos Rust para el llavero (crate `keyring`: Credential Manager en Windows, Secret Service en Linux) para tokens y, con la opción «mantener desbloqueado», la clave maestra (ADR 0005). Capabilities mínimas (sin `fs`, `shell` ni `http` genérico), patrón de aislamiento, devtools desactivadas en release, abrir enlaces externos en el navegador (`opener`) | Revisión de capabilities sin permisos sobrantes                      |
| **D4 · Integración**                   | Menú nativo, atajos (`Ctrl N` nueva nota, `Ctrl K` buscar), notificación sin conexión, bandeja opcional, deep link `apunte://` opcional para abrir enlaces de restablecer                                                                                                                                                                                          | Paridad con la web + atajos                                          |
| **D5 · Rendimiento**                   | Medir arranque y descifrado con miles de notas en WebKitGTK (el más lento). Opcional: Argon2id en Rust como comando, con los mismos vectores que la web                                                                                                                                                                                                            | Arranque < 2 s con 5 000 notas                                       |
| **D6 · Empaquetado y actualizaciones** | `tauri-plugin-updater` con firma ed25519 (clave privada solo en secretos de Actions), manifiesto en GitHub Releases. Windows: instalador NSIS con el bootstrapper de WebView2; firma de código (Azure Trusted Signing o certificado OV; sin firma, SmartScreen avisa). Linux: AppImage + .deb + .rpm                                                               | Instalar, actualizar y desinstalar en ambos sistemas                 |
| **D7 · Pruebas y publicación**         | Los e2e siguen en la web (`pnpm exec playwright test`, `pnpm e2e:http`). Humo con `tauri-driver` (WebDriver) en Linux y Windows: abrir, login, crear nota, sincronizar, cerrar sesión. `release.yml` en tag `v*` con aprobación manual                                                                                                                             | Primera versión publicada                                            |

Estimación: 3–4 semanas. Riesgos: diferencias de WebKitGTK (editor TipTap, IndexedDB, Web Locks; el
cliente ya tiene alternativa sin `navigator.locks`), coste/tiempo de la firma en Windows.

## 6. Prerrequisitos

- Para probar contra un servidor de verdad hace falta **QA desplegado** (ver `backend.md` §7.1); antes,
  se trabaja contra la API local.
- Herramientas: Rust estable, Node + pnpm, en Linux `webkit2gtk-4.1`, `libayatana-appindicator3` y
  `librsvg2`; en Windows, WebView2 (viene con Windows 11).

## 7. Reglas que se heredan de la web

- No reimplementar cifrado ni sincronización en Rust salvo lo indicado (llavero, KDF opcional con
  vectores). La interfaz y la lógica viven en `notify_web`.
- Nunca registrar contraseñas, claves, tokens ni textos de notas (tampoco en logs de Rust).
- Todo dato nuevo con texto de la persona va cifrado. UI en español.
- La verificación en dos pasos, el acceso con Google y los dispositivos de confianza ya están en la web y
  en la API; la app de escritorio reutiliza esa lógica. Si guarda la mitad local de la confianza en el
  llavero, debe leer el vector compartido `docs/api/vectors/trusted-device.json` (mismo formato `a1.…`).
