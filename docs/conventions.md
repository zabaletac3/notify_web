# Convenciones

## Código

- TypeScript estricto; sin `any` (ESLint avisa). Tipos del dominio en `src/lib/domain`.
- Svelte 5: usar runes (`$state`, `$derived`, `$props`, `$effect` solo si es imprescindible). Sin `export let`, sin stores `writable` nuevos.
- Imports con alias `#lib/...`. Dentro de una feature se usan imports relativos.
- Una feature se consume por su `index.ts`. Los internos (`state/`, `services/`, `components/`) son privados.
- Nombres: componentes `PascalCase.svelte`; módulos `kebab-case.ts`; estado `*.svelte.ts`; pruebas junto al archivo (`*.spec.ts`, `*.svelte.spec.ts`) y E2E en `*.e2e.ts`.
- Textos de interfaz en español, centralizados (no incrustados en lógica) para poder traducir después.

## Tailwind y estilos

- Todo color sale de tokens (`bg-background`, `text-muted-foreground`, `bg-hover`, `text-tertiary`, `text-success`…). **Prohibido** `bg-[#...]`, `text-[13px]` y medidas arbitrarias sueltas.
- Variantes de un componente con `tailwind-variants` (`tv`), no con condicionales en las clases.
- Clases combinadas con `cn()` (`#lib/utils.js`).
- CSS propio solo para lo que Tailwind no cubre (por ejemplo el contenido del editor), en un archivo aparte y con variables de los tokens.
- Iconos: `@lucide/svelte`, `strokeWidth={1.75}` para igualar el diseño.

## Git

- Commits convencionales: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `style:`.
- Ramas: `feat/<tema>`, `fix/<tema>`. `main` siempre pasa `pnpm verify`.
- El hook de pre-commit formatea y lintea los archivos modificados (husky + lint-staged).

## Pruebas

- Unitarias (Vitest): utilidades, estado (`*.svelte.ts`), servicios.
- Componentes (Vitest browser + `vitest-browser-svelte`): comportamiento visible y accesibilidad.
- E2E (Playwright): flujos completos sobre datos simulados.
- Cada pantalla nueva incluye sus estados (cargando, vacío, error) en el simulador.

## Accesibilidad

- Usar los primitivos de bits-ui (foco, teclado y ARIA ya resueltos).
- Todo control interactivo con nombre accesible; foco visible; contraste revisado en claro **y** oscuro.

## Seguridad

- El Markdown se renderiza siempre **sanitizado**. No usar `{@html}` con contenido de usuario sin pasar por el sanitizador.
- Sin secretos en el cliente: solo variables `PUBLIC_*`.
- CSP definida antes de producción.
