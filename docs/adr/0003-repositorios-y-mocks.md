# ADR 0003 — Interfaces de repositorio y datos simulados primero

**Estado:** aceptada

**Decisión:** la UI depende de interfaces (`NoteRepository`, `FolderRepository`…) definidas en `src/lib/data`. Se implementan primero en memoria (`data/mock`), con un simulador de escenarios; luego `data/local` y `data/remote`.

**Consecuencias:** se pueden construir y probar las 35 vistas sin backend, incluidos los estados de error, sin conexión y conflicto; el cambio a datos reales no toca pantallas ni componentes.
