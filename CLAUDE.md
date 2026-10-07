# Apunte web — guía para asistentes

App de notas (SvelteKit + Svelte 5 + shadcn-svelte + Tailwind v4). Lee `docs/architecture.md` y `docs/conventions.md` antes de añadir código.

## Reglas clave

- Svelte 5 con **runes**; TypeScript estricto. Alias `#lib/...`.
- Capas: `routes → features → data → fuente`. `domain` y `core` no dependen de la UI. Una feature se importa solo por su `index.ts`. ESLint lo verifica.
- **Sin colores ni medidas arbitrarias**: solo tokens (`src/lib/styles/tokens.css`, mapa en `docs/design-tokens.md`).
- Los componentes de presentación no cargan datos; los datos llegan por repositorios (`src/lib/data`), primero simulados.
- Markdown de usuario siempre sanitizado (nunca `{@html}` directo).
- UI en español.

## Comandos

`pnpm dev` · `pnpm storybook` · `pnpm check` · `pnpm lint` · `pnpm test:unit --run` · `pnpm build` · `pnpm verify` (todo junto, como la CI).

## shadcn-svelte

`components.json` fija estilo `vega`, base `stone`, Lucide. Añadir con `pnpm dlx shadcn-svelte@latest add <nombre>`; luego revisar que use tokens y no colores sueltos.

## Diseño

Fuente de verdad: archivo de Figma "Apunte – App de notas" (35 vistas, escritorio y móvil, claro y oscuro). No tocar Figma sin que se pida.

## Sistema de diseño

Ver `docs/components.md`: escala tipográfica (`text-title/heading/body/label/caption`), radios, ajustes a shadcn y pendientes con Figma. Iconos solo vía `AppIcon` (`src/lib/components/app`).
Pruebas de navegador: si no hay Chromium de Playwright, usar `CHROMIUM_PATH=/ruta/al/chrome`.

## Datos y estado

Ver `docs/data-and-state.md`. La UI obtiene todo con `getApp()` (`#lib/app/index.js`); nunca llama a repositorios directamente. Las acciones de estado devuelven `ActionResult` (no lanzan) y los errores de validación son códigos (`validationMessage`). Para ver estados (sin conexión, error, conflicto, vacío) usar el simulador en `/dev/simulator`. Las pruebas de estado usan `testApp()` de `#lib/test/test-app.js`.

## API del backend

Borrador del contrato HTTP en `docs/api/openapi.yaml` (`pnpm api:lint` lo valida) y decisiones abiertas en `docs/api/decisions.md`. Si cambias un contrato de `src/lib/data/contracts.ts`, actualiza la especificación.
