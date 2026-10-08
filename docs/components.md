# Componentes base y sistema de diseño

Estado de la **Fase 2** (la parte que no requiere el MCP de Figma). Catálogo vivo: `pnpm dev` → `/dev/design-system`; Storybook: `pnpm storybook`.

## Lo que ya está

| Pieza               | Dónde                                        | Notas                                                                                                        |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Tokens claro/oscuro | `src/lib/styles/tokens.css`                  | Mapa en `docs/design-tokens.md`. Prueba de contraste WCAG en `tokens.spec.ts`                                |
| Utilidades Tailwind | `src/lib/styles/theme.css`                   | Colores propios (`bg-hover`, `bg-input-fill`, `text-tertiary`, `text-success`…), radios y escala tipográfica |
| Variantes de shadcn | `src/lib/styles/shadcn.css`                  | `data-checked:`, `data-open:`, `data-active:`… (necesarias para los componentes)                             |
| Componentes base    | `src/lib/components/ui/`                     | shadcn-svelte ajustado al diseño (ver abajo)                                                                 |
| Iconos              | `src/lib/components/app/icons.ts`, `AppIcon` | Claves = componentes `icon/*` de Figma → Lucide, trazo 1.75                                                  |
| Tema                | `ThemeToggle`                                | Claro/oscuro con mode-watcher                                                                                |

### Escala tipográfica (Inter)

| Clase                        | Tamaño  | Uso                             |
| ---------------------------- | ------- | ------------------------------- |
| `text-title font-bold`       | 28 / 34 | Títulos de pantalla             |
| `text-heading font-semibold` | 18 / 24 | Encabezados, títulos de diálogo |
| `text-body`                  | 15 / 22 | Texto base, botones, campos     |
| `text-label font-medium`     | 13 / 18 | Etiquetas de campo              |
| `text-caption`               | 12 / 16 | Ayudas, metadatos               |

### Radios

`rounded-sm` 8 · `rounded-lg` 12 (campos, botones) · `rounded-xl` 14 (botón grande) · `rounded-2xl` 20 (diálogos) · `rounded-3xl` 24 (bottom sheet).

### Ajustes hechos a shadcn

- **Button:** primario azul, `outline` = botón secundario del diseño (borde, sin relleno), `destructive` sólido y `destructive-soft` tintado. Alturas 46 (`default`) y 54 (`lg`) como en Figma (`h-11.5`, `h-13.5`).
- **Input / Textarea:** rellenos (`bg-input-fill`), sin borde, foco con borde azul de 2 px; error con borde `destructive`.
- **Checkbox:** circular (las tareas del diseño tienen check redondo). **Radio:** mismo estilo de borde.
- **Switch:** 44×26 con 3 px de margen; apagado en `tertiary`.
- **Input OTP:** casillas separadas y rellenas, foco azul (como la pantalla de verificación).
- **Badge:** variantes `amber`, `plum` (etiquetas) y `success`.
- **Dialog / Sheet:** radios 20 y 24, scrim sin desenfoque, títulos 18 bold.
- **Skeleton:** `bg-hover`.
- Se eliminaron los marcadores de estilo del CLI de shadcn que no aplican (`cn-menu-*`, `cn-font-heading`, `cn-rtl-flip`).

## Contraste (resultado de `tokens.spec.ts`)

Cumplen AA (≥ 4.5): texto principal y secundario sobre fondos, botón primario, enlaces, peligro, éxito. Por debajo, **por decisión del diseño actual**, a revisar con Figma:

| Par                                 | Claro | Oscuro | Nota                                                                     |
| ----------------------------------- | ----- | ------ | ------------------------------------------------------------------------ |
| `text/tertiary` sobre `bg/editor`   | 2.92  | 3.41   | Placeholders y texto deshabilitado. Sobre `bg/input` baja a 2.34 (claro) |
| `tag/amber` sobre `bg/editor`       | 3.58  | 7.77   | Texto pequeño de etiqueta en claro queda bajo 4.5                        |
| `text/secondary` sobre `bg/sidebar` | 4.47  | 5.91   | Roza el mínimo en claro                                                  |

## Medidas base validadas contra Figma

Se leyeron las medidas de los componentes base y de sus instancias en las vistas del archivo de Figma y se compararon con el código:

| Componente                     | Figma                                                          | Código                                                                                              | Resultado                                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button `sm` / `default` / `lg` | 36 / 46 / 54 de alto; relleno 14 / 20 / 24; radio 12 / 12 / 14 | `h-9` / `h-11.5` / `h-13.5`; `px-3.5` / `px-5` / `px-6`; `rounded-lg` / `rounded-lg` / `rounded-xl` | ✓ (el tamaño `xs` y los `icon-*` de shadcn no existen en Figma: no se usan en las pantallas)                                                        |
| Input                          | 52 de alto, radio 12, relleno 14                               | `h-13 rounded-lg px-3.5`                                                                            | ✓                                                                                                                                                   |
| Switch · Checkbox · Radio      | 44×26 · 20 · 20                                                | igual                                                                                               | ✓                                                                                                                                                   |
| OTP slot · Badge               | 48×60 radio 12 · 20 de alto                                    | `h-15` · `h-5`                                                                                      | ✓                                                                                                                                                   |
| NoteCard                       | 80 de alto, radio 10, relleno 12/14, hueco 4                   | `h-20 rounded-[10px] px-3.5 py-3 gap-1`                                                             | ✓                                                                                                                                                   |
| BottomSheet                    | relleno 12/20/36/20, hueco 16                                  | `px-5 pt-3 pb-9 gap-4`                                                                              | ✓                                                                                                                                                   |
| MenuItem                       | 38 de alto, relleno 9/12, hueco 12                             | `py-2.25 px-3 gap-3`                                                                                | ✓                                                                                                                                                   |
| **SidebarItem**                | 34 de alto, **radio 8**, relleno 7/10, hueco 10                | `rounded-lg` (12)                                                                                   | **Corregido** → `rounded-sm`                                                                                                                        |
| **ToolbarButton**              | 32 (40 en móvil), **radio 8**                                  | `rounded-lg` (12)                                                                                   | **Corregido** → `rounded-sm`                                                                                                                        |
| Diálogo (base)                 | 420, relleno 24, hueco 16, radio 20                            | `p-7` (28), `gap-4`, anchos 420/440/480/520                                                         | El código sigue las **vistas** (28, hueco 16, radio 20, esos anchos); el componente base de Figma quedó con 24 y 420: pendiente de igualar en Figma |
| Toast                          | 360                                                            | 380                                                                                                 | El código sigue la vista (380)                                                                                                                      |

Además, comparando la vista de escritorio en modo oscuro con la app:

- **Cita (`blockquote`)**: Figma («Callout») tiene fondo `bg/app`, **solo una barra de acento a la izquierda de 3 px**, radio 10 y relleno 12/16; el código dibujaba un borde de 1 px alrededor. **Corregido** (`prose.css`).
- **Nota fijada**: Figma pone el icono de fijado **antes del título**, de 13 px y color `tag/amber`; el código lo ponía a la derecha y gris. **Corregido** (`NoteCard`).
- Colores, tipografía, listas, etiquetas y la barra lateral coinciden en claro y en oscuro.

## Pendiente de validar con Figma

- Tamaño del icono por contexto y el estilo final de Toaster (sonner), Command y Sidebar de shadcn.
- Igualar en Figma el componente base «Dialog» con las vistas (relleno 28).

### Cifrado de extremo a extremo (sin diseño en Figma todavía)

Pantallas y piezas construidas con componentes existentes; hay que diseñarlas en Figma y reconciliar medidas y textos:

- `/unlock` (desbloquear con la contraseña) y `/recovery-key` (mostrar o crear la clave de recuperación).
- `RecoveryKeyPanel` (`components/app`): clave en bloque monoespaciado (`font-mono` de Tailwind, falta un token de fuente), botones Copiar y Descargar, casilla «La guardé en un lugar seguro».
- Reset de contraseña: elección «Sí, la tengo» / «No la tengo», campo de clave y aviso de borrado.
- Privacidad: filas «Cifrado de extremo a extremo» (informativa) y «Clave de recuperación» (reemplazan al interruptor «Cifrar notas en este dispositivo»).
- Cerrar sesión con cambios sin sincronizar (diálogo de tres botones).

## Tamaño del texto y accesibilidad automática

- **Tamaño del texto** (Ajustes → General): `data-text-size` en `<html>` fija `--text-scale` (0,9 · 1 · 1,15, en `tokens.css`) y **todos** los tamaños de letra lo multiplican (`theme.css`: escala de Apunte y las `text-sm`, `text-xl`… de Tailwind; `prose.css`: el editor). Solo crece la letra, no los espacios ni los anchos. Se recuerda en `localStorage` (`apunte-text-size`) y `static/theme-init.js` lo aplica antes de pintar. Un tamaño nuevo se escribe siempre en `rem` y dentro de `calc(… * var(--text-scale))`.
- **Accesibilidad automática:** `e2e/accesibilidad.e2e.ts` pasa axe-core (WCAG 2.1 A y AA, incluido el contraste) por las pantallas principales, el diálogo de compartir y los ajustes, en claro y en oscuro. Una pantalla o componente nuevo se añade ahí. Encontró que el área de escritura del editor no tenía nombre (`aria-label` «Contenido de la nota»).
- Los menús de lista de los ajustes (`ChoiceRow`) se cierran al elegir una opción.
