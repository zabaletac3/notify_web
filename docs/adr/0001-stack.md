# ADR 0001 — Stack web

**Estado:** aceptada

**Decisión:** SvelteKit + Svelte 5 (runes) + TypeScript estricto, shadcn-svelte (bits-ui) + Tailwind CSS v4, Lucide, Inter, pnpm.

**Contexto:** una persona desarrolla web, escritorio y móvil. La web debe poder envolverse con Tauri 2 sin reescribir la interfaz.

**Consecuencias:**

- Los componentes shadcn se copian al repositorio (`src/lib/components/ui`); se mantienen y ajustan a los tokens.
- Tailwind v4 se configura en CSS (`@theme`), sin `tailwind.config.js`.
- La app (`(app)`) es una SPA (`ssr = false`) para poder usar `adapter-static` en Tauri.
- El móvil (Flutter) no comparte código con la web: comparte el contrato de la API y datos de prueba de sincronización.
