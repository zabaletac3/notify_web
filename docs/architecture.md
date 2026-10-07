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
