# ADR 0004 — Persistencia local y sincronización

**Estado:** aceptada

**Decisión:**

- La copia local vive en IndexedDB (Dexie, `data/local`). La UI no cambia: solo la raíz de composición elige `persistence: 'indexeddb'`.
- Los identificadores los genera el cliente (UUID v7, `newId()`), así se crea sin conexión.
- Cada nota y carpeta tiene una `revision` que el servidor incrementa en cada escritura aceptada. El servidor numera sus cambios con un contador; el `cursor` del cliente es el último visto.
- Los cambios del cliente van a una cola (outbox) con **una entrada por entidad**: conserva el `baseRevision` más antiguo y los datos más recientes. Crear y borrar sin haber sincronizado se anulan.
- **Conflictos solo en notas:** si el `baseRevision` no coincide, el servidor no aplica el cambio y devuelve su versión; el cliente deja la entrada fuera de los envíos hasta que la persona elige `local`, `remote` o `both`. Las carpetas son «gana el último».
- Los borrados definitivos viajan como lápidas. Mover a la papelera y restaurar son actualizaciones normales (`deletedAt`).
- Sincronización automática unos segundos después de un cambio, al recuperar la conexión y cada minuto con la app abierta; respeta el ajuste de sincronización automática.
- Al cerrar sesión se borra la copia local; el primer arranque de un dispositivo descarga todo.

**Consecuencias:** el backend real implementa `POST /sync` tal como lo hace `MockSyncServer`, que sirve de referencia ejecutable. Pendiente: gestionar el caso de otra cuenta en un navegador con datos locales y sincronizar los ajustes entre dispositivos.
