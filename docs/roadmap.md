# Roadmap (web)

| Fase | Contenido                                                                                                                                                                 | Estado    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 0    | Figma listo: componentes con variantes, nombres alineados con shadcn, mapa de tokens e iconos                                                                             | pendiente |
| 1    | **Andamiaje**: repositorio, herramientas, calidad, CI, estructura                                                                                                         | ✅ hecho  |
| 2    | Sistema de diseño: tokens verificados, componentes base ajustados, catálogo `/dev/design-system`, Storybook                                                               | pendiente |
| 3    | Shell de la app: 3 paneles redimensionables, navegación, cajón en móvil, atajos (`Ctrl K`, `Ctrl N`), paleta de comandos                                                  | pendiente |
| 4    | Dominio y datos simulados: tipos, repositorios, estado con runes, simulador de escenarios                                                                                 | pendiente |
| 5    | Pantallas: notas + editor (TipTap/Markdown), carpetas, búsqueda, papelera, menús y modales, ajustes, autenticación, onboarding, estados del sistema, modo oscuro, landing | pendiente |
| 6    | Calidad: accesibilidad, rendimiento (lista virtualizada), pruebas unitarias/componentes/E2E                                                                               | pendiente |
| 7    | Datos reales: IndexedDB (Dexie), cliente de la API (OpenAPI), sincronización, empaquetado con Tauri 2                                                                     | pendiente |

Flujo por pantalla (con el MCP de Figma): leer el diseño → adaptarlo a Svelte con los componentes y tokens existentes → conectarlo a datos simulados → comparar con captura (claro y oscuro) → añadir prueba.
