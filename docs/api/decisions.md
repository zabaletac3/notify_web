# Decisiones abiertas del backend

Contrato: [`openapi.yaml`](./openapi.yaml) (borrador). Se valida con `pnpm api:lint`.
Estas decisiones condicionan el servidor; cada una trae mi recomendación. Marca `[x]` al decidir.

## Las que bloquean el diseño de la API

- [ ] **D1 · Identificadores generados por el cliente.** Para crear notas y carpetas sin conexión el cliente necesita su propio `id`.
      _Recomendación:_ UUID v7 (ordenable por fecha). El servidor los acepta en `PUT /notes/{id}` y `PUT /folders/{id}` (idempotentes) y rechaza duplicados de otra cuenta. Hoy el simulador los genera en el "servidor"; hay que cambiarlo.
- [ ] **D2 · Sesión y tokens.** Token de acceso corto + token de renovación con rotación, o sesión por cookie.
      _Recomendación:_ acceso JWT de 15 min + renovación opaca con rotación y lista de dispositivos (`/devices` ya la espera). Cookie `HttpOnly` para la web, cabecera `Authorization` para escritorio y móvil.
- [ ] **D3 · Protocolo de sincronización.** El contrato `POST /sync` es un borrador. Se fija tras la capa local (paso 2): cola de cambios, cursor, resolución de conflictos y borrados (lápidas).
      _Recomendación:_ revisión por nota (`revision`, ya existe), cursor por cuenta, el servidor nunca pisa: ante `baseRevision` distinto devuelve `409` con la versión remota y el cliente decide (`local`, `remote`, `both`).
- [ ] **D4 · Modelo en MongoDB y multiempresa.** Tu plantilla (`multitenant-template`) es multiempresa; Apunte es de un solo usuario por cuenta.
      _Recomendación:_ quitar el tenant: colecciones `users`, `notes`, `folders`, `devices`, `share_links`, `refresh_tokens`, `verification_codes`. Índices: `notes(userId, updatedAt)`, `notes(userId, deletedAt)`, `folders(userId, nameFolded)` único, `share_links(slug)` único.

## Las que se pueden decidir durante la construcción

- [ ] **D5 · Imágenes en notas.** Dónde se guardan (disco, S3, Mongo GridFS), tamaño máximo y formatos. Hoy no se pueden adjuntar; `imagesBytes` es 0. _Recomendación:_ almacenamiento de objetos con URL firmada, 5 MB por imagen.
- [ ] **D6 · Correo transaccional.** Proveedor para códigos de verificación, cambio de correo y recuperación. Caducidad: código 10 min, enlace de recuperación 1 h.
- [ ] **D7 · Limpieza de la papelera.** Tarea programada diaria que borra lo que lleva 30 días (`TRASH_RETENTION_DAYS`) y las cuentas eliminadas tras 30 días.
- [ ] **D8 · Acceso con Google.** El botón existe sin flujo. Definir OAuth y cómo se vincula con cuentas de correo.
- [ ] **D9 · Límites de uso.** Intentos de login (hoy 5 y bloqueo), reenvío de código (60 s), tamaño máximo de nota, notas por cuenta, cuota de 1 GB.
- [ ] **D10 · Enlaces públicos.** Formato del `slug` (aleatorio, no secuencial), si el enlace caduca y si la página pública es del backend o de la web.
- [ ] **D11 · Búsqueda.** Hoy es local (MiniSearch). El servidor no necesita buscar mientras el cliente tenga todas las notas.
- [ ] **D12 · Verificación en dos pasos.** El ajuste existe como booleano; faltan los endpoints de alta (TOTP) y recuperación.

## Fuera del contrato (solo cliente)

- Exportar e importar notas en Markdown se hace en el navegador.
- Cifrado local (`encryptLocal`) y bloqueo biométrico dependen del cliente.
