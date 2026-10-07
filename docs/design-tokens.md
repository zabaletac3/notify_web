# Tokens de diseño: Figma → CSS

Fuente: archivo de Figma "Apunte – App de notas", colecciones **Apunte / Color** (claro) y **Apunte / Color oscuro**.
Implementación: `src/lib/styles/tokens.css` (valores) y `theme.css` (utilidades Tailwind).

| Token en Figma     | Variable CSS             | Utilidad Tailwind                    | Claro     | Oscuro    |
| ------------------ | ------------------------ | ------------------------------------ | --------- | --------- |
| `bg/editor`        | `--background`           | `bg-background`                      | `#FFFDF8` | `#262522` |
| `bg/app`           | `--card`, `--muted`      | `bg-card`, `bg-muted`                | `#F6F2EA` | `#1B1A18` |
| `bg/sidebar`       | `--sidebar`              | `bg-sidebar`                         | `#EDE7DC` | `#222120` |
| `bg/selected`      | `--accent`               | `bg-accent`                          | `#DCE7F5` | `#26364D` |
| `bg/hover`         | `--secondary`, `--hover` | `bg-secondary`, `bg-hover`           | `#E6DFD3` | `#2E2C29` |
| `bg/input`         | `--input-fill`           | `bg-input-fill`                      | `#EAE4D9` | `#2A2826` |
| `border/default`   | `--border`               | `border-border`                      | `#E2DACD` | `#3A3733` |
| `text/primary`     | `--foreground`           | `text-foreground`                    | `#1F1D1A` | `#F1EDE6` |
| `text/secondary`   | `--muted-foreground`     | `text-muted-foreground`              | `#6F685E` | `#A39C91` |
| `text/tertiary`    | `--tertiary`             | `text-tertiary`                      | `#9C958A` | `#7C766D` |
| `accent/default`   | `--primary`              | `bg-primary`, `text-primary`         | `#2A5DB0` | `#7BA7E6` |
| `accent/on`        | `--primary-foreground`   | `text-primary-foreground`            | `#FFFFFF` | `#0F1E36` |
| `tag/amber`        | `--tag-amber`            | `text-tag-amber`                     | `#B7791F` | `#E3B062` |
| `tag/plum`         | `--tag-plum`             | `text-tag-plum`                      | `#7B4B8A` | `#C49AD3` |
| `status/danger`    | `--destructive`          | `text-destructive`, `bg-destructive` | `#B3382C` | `#E88A7E` |
| `status/danger-bg` | `--destructive-soft`     | `bg-destructive-soft`                | `#F8E3E0` | `#3B2421` |
| `status/success`   | `--success`              | `text-success`                       | `#2F7D5C` | `#6CC79C` |

Otros valores de diseño: fuente **Inter**; radios 8/12/14 px (base `--radius: 0.75rem`); iconos Lucide con trazo 1.75.

**Para cambiar un color:** editarlo en Figma y en `tokens.css`, y actualizar esta tabla.
