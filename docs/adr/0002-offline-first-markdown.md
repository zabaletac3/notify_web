# ADR 0002 — Offline-first y Markdown como formato de nota

**Estado:** aceptada

**Decisión:**

- Cada dispositivo guarda una copia de trabajo local (IndexedDB en web/Tauri; SQLite en Flutter) y una cola de cambios pendientes. La API (Go + MongoDB) es la copia central.
- El contenido de una nota se guarda y se envía como **Markdown** (CommonMark + GFM: listas de tareas, tablas). Título, carpeta, etiquetas y fijado van en campos aparte.

**Motivos:** la app debe funcionar sin conexión; un formato común evita convertir entre estructuras propias de cada editor (ProseMirror, Delta…), y facilita búsqueda, exportación y compartir.

**Riesgos:** la fidelidad del Markdown depende del editor; se valida con un prototipo (nota con todo el formato escrita en web y abierta en Flutter) antes de la fase de datos reales. Lo que Markdown no cubre (color, alineación, tamaño) queda fuera de alcance.
