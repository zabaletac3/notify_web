# AxoNote · web

App de notas **original** (cálida, tipo "papel", acento azul) para web, escritorio (Tauri 2) y, por separado, móvil (Flutter).
Este repositorio contiene la **web** y es la base de la app de escritorio.

> Estado: andamiaje, sistema de diseño base, **tipos, datos simulados y estado** listos. Falta construir las pantallas (con Figma). Las pantallas se construyen en las fases siguientes — ver [`docs/roadmap.md`](docs/roadmap.md).

## Stack

| Capa            | Tecnología                                                                   |
| --------------- | ---------------------------------------------------------------------------- |
| Framework       | SvelteKit + Svelte 5 (runes) + TypeScript estricto                           |
| UI              | shadcn-svelte (bits-ui) + Tailwind CSS v4                                    |
| Iconos / fuente | Lucide (`@lucide/svelte`, trazo 1.75) · Inter                                |
| Tema            | `mode-watcher` (claro/oscuro) · tokens en `src/lib/styles/`                  |
| Calidad         | ESLint · Prettier · svelte-check · Vitest · Playwright · husky + lint-staged |
| Datos (después) | IndexedDB (Dexie) · cliente de la API en Go (generado desde OpenAPI)         |

## Requisitos

- Node `>= 22` (ver `.nvmrc`) y pnpm `>= 10`.

## Empezar

```sh
pnpm install
cp .env.example .env
pnpm dev            # http://localhost:5173
```

Solo en desarrollo: catálogo de tokens y componentes <http://localhost:5173/dev/design-system> · simulador de escenarios (sin conexión, errores, conflictos…) <http://localhost:5173/dev/simulator>

Si las pruebas de navegador no encuentran Chromium, apunta a uno instalado: `CHROMIUM_PATH=/ruta/al/chrome pnpm test:unit`.

## Scripts

| Comando                          | Qué hace                                               |
| -------------------------------- | ------------------------------------------------------ |
| `pnpm dev` / `build` / `preview` | Desarrollo, build de producción, vista previa          |
| `pnpm check`                     | Tipos (svelte-check)                                   |
| `pnpm lint` / `format`           | Prettier + ESLint (incluye límites de arquitectura)    |
| `pnpm test:unit`                 | Vitest (unitarias y de componentes)                    |
| `pnpm test:e2e`                  | Playwright                                             |
| `pnpm verify`                    | check + lint + unit + build (lo mismo que corre la CI) |

## Estructura

```
src/
├─ routes/
│  ├─ (marketing)/   landing (prerenderizada)
│  ├─ (auth)/        login, register, verify, forgot-password, reset-password
│  ├─ (app)/         la app: notes, trash, settings (SPA, sin SSR)
│  └─ dev/           catálogo del sistema de diseño (solo dev)
└─ lib/
   ├─ components/
   │  ├─ ui/         shadcn-svelte (código propio, generado)
   │  └─ app/        componentes compuestos de AxoNote (NoteCard, SidebarItem…)
   ├─ app/           raíz de composición (createApp) y contexto (getApp)
   ├─ features/      notes · folders · search · trash · settings · auth · sync · share (estado con runes)
   ├─ data/          contratos (repositorios) + implementaciones: mock (hecho) · local · remote
   ├─ domain/        tipos de dominio y reglas puras, sin dependencias
   ├─ core/          formato, mensajes, attempt() (luego HTTP, config)
   ├─ dev/           panel del simulador de escenarios (solo desarrollo)
   ├─ hooks/         hooks de UI
   └─ styles/        tokens.css (claro/oscuro) + theme.css (utilidades Tailwind)
```

Alias de importación: `#lib/...` (equivale a `src/lib/...`). Reglas y capas: [`docs/architecture.md`](docs/architecture.md).

## Añadir componentes de shadcn-svelte

Configuración en `components.json` (estilo `vega`, base `stone`, icon library `lucide`).

```sh
pnpm dlx shadcn-svelte@latest add <componente>
```

Después de añadir uno, revisa que use los tokens (`bg-background`, `text-primary`…) y no colores sueltos.

## Documentación

- [`docs/architecture.md`](docs/architecture.md) — capas, carpetas, patrón de repositorios y estado.
- [`docs/conventions.md`](docs/conventions.md) — nombres, commits, Tailwind, pruebas, accesibilidad, seguridad.
- [`docs/design-tokens.md`](docs/design-tokens.md) — mapa Figma → variables CSS.
- [`docs/data-and-state.md`](docs/data-and-state.md) — tipos, contratos de datos, datos simulados, simulador y estado.
- [`docs/components.md`](docs/components.md) — componentes base, escala tipográfica, contraste y pendientes de validar con Figma.
- [`docs/roadmap.md`](docs/roadmap.md) — fases del trabajo.
- [`docs/adr/`](docs/adr) — decisiones de arquitectura.
