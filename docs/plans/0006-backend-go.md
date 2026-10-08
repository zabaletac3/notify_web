# Plan 0006 · Backend de Apunte en Go

Estado: **propuesta** (nada ejecutado). Contrato: `docs/api/openapi.yaml`. Protocolo: ADR 0004. Cifrado: ADR 0005.
Referencia de estilo: `multitenant-template` (chi, mongo-driver v2, env, slog, envoltorio de respuesta).

## 1. Principios

1. El servidor **nunca descifra**. Guarda metadatos + `wrappedKey` + `payload` (formato `a1.<iv>.<ct>`), y solo comprueba su forma (`isSealed`).
2. El contrato manda: cada endpoint sale de `openapi.yaml`; el comportamiento de `/sync` sale de `MockSyncServer` (`src/lib/data/mock/mock-sync-server.ts`).
3. Una cuenta = una persona. **Sin tenants** (D4).
4. Nada sensible en logs: ni `authKey`, ni `payload`, ni códigos, ni tokens.
5. Se reutiliza el estilo de la plantilla; se elimina lo que no aplica (gRPC, Kafka, WebSocket, permisos, posiciones, multiempresa).

## 2. Repositorio y stack

- Repo nuevo `notify_api` (módulo `github.com/zabaletac3/notify_api`), copiando de la plantilla solo: `apperrors`, `response`, `config`, `platform/mongo`, `middleware` (trace id, logs, recover), `observability`, `Makefile`, `docker/`.
- Go **1.24** (el instalado; la plantilla pide 1.27.1, que no existe en el entorno).
- chi v5, mongo-driver v2, caarlos0/env v11, validator v10, swaggo (o validar contra `openapi.yaml` con `kin-openapi` en tests), `golang.org/x/crypto` (comparaciones), testcontainers-go.
- Redis opcional (limitador distribuido), igual que la plantilla; sin Redis, memoria.

```
cmd/server  cmd/purge
internal/{config,apperrors,response,httpserver,middleware,observability}
internal/platform/{mongo,redis,mailer}
internal/{auth,account,keys,notes,folders,sync,share,devices,settings,jobs}
test/contract     # pruebas de contrato compartidas con el cliente
```

## 3. Modelo en MongoDB (D4)

| Colección            | Campos clave                                                                                                                                                           | Índices                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `users`              | `_id` (uuid v7 del cliente), `email`, `emailVerified`, `kdf` (KdfParams), `authKeyHash`, `recoveryAuthHash`, `keys` (KeyBundle), `settings`, `deletedAt`, `accountSeq` | `email` único                                 |
| `notes`              | `_id`, `userId`, `folderId`, `revision`, `seq`, `createdAt`, `updatedAt`, `deletedAt`, `lastEditedDeviceId`, `wrappedKey`, `payload`                                   | `(userId, seq)`, `(userId, deletedAt)`        |
| `folders`            | igual, sin conflictos                                                                                                                                                  | `(userId, seq)`                               |
| `tombstones`         | `userId`, `entity`, `id`, `revision`, `seq`                                                                                                                            | `(userId, seq)`, único `(userId, entity, id)` |
| `devices`            | `_id`, `userId`, `name`, `platform`, `lastSeenAt`, `revokedAt`                                                                                                         | `(userId)`                                    |
| `refresh_tokens`     | `tokenHash` (SHA-256), `userId`, `deviceId`, `family`, `expiresAt`, `revoked`                                                                                          | `tokenHash` único, TTL `expiresAt`            |
| `share_links`        | `slug` (22 car.), `noteId`, `userId`, `wrappedKey?`, `payload`, `createdAt`                                                                                            | `slug` único, `noteId` único                  |
| `verification_codes` | `userId`/`email`, `purpose`, `codeHash`, `attempts`, `expiresAt`                                                                                                       | TTL                                           |

`seq` por cuenta: contador atómico en `users.accountSeq` (`$inc` con `findOneAndUpdate`). Cada escritura de nota/carpeta/lápida toma el siguiente `seq`. Sin índices por título ni nombre de carpeta.

## 4. Decisiones propuestas (confirmar)

| #   | Propuesta                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D2  | Acceso JWT HS256 15 min (claims: `sub`, `did` dispositivo, `jti`) + renovación opaca con rotación y detección de reutilización (familia). Cookie `HttpOnly; Secure; SameSite=Strict` en web, `Authorization: Bearer` en escritorio/móvil. Dispositivo revocado → 401 `device-revoked`. |
| D4  | Sin tenant, colecciones de la sección 3.                                                                                                                                                                                                                                               |
| D5  | **Diferir** imágenes: no entra en el MVP; se decide cuando el cliente las cifre.                                                                                                                                                                                                       |
| D6  | Interfaz `Mailer` con implementación `log` (dev) y **Resend** (prod, HTTP simple). Códigos 6 dígitos, 10 min, hash en BD, 5 intentos. Enlace de recuperación 1 h.                                                                                                                      |
| D7  | Comando `cmd/purge` (cron/Job de Kubernetes diario): borra notas con `deletedAt` > 30 días (`TRASH_RETENTION_DAYS`), lápidas > 90 días, cuentas con `deletedAt` > 30 días. Idempotente.                                                                                                |
| D8  | **Diferir** Google (el cliente deriva claves de la contraseña; Google exige un diseño aparte).                                                                                                                                                                                         |
| D9  | Login: 5 fallos/15 min por correo+IP; reenvío de código 60 s; nota ≤ 1 MiB cifrada; `/sync` ≤ 500 cambios y 8 MiB por petición; 10 000 notas por cuenta; cuota 1 GB. Todo por env.                                                                                                     |
| D10 | Enlaces sin caducidad (se revocan a mano); página pública sigue en la web `/n/[slug]`, el backend solo sirve `GET /public/notes/{slug}` con `Cache-Control: no-store` y `Referrer-Policy: no-referrer`.                                                                                |
| D12 | **Diferir** 2FA (TOTP) a una fase posterior; el ajuste queda sin efecto hasta entonces.                                                                                                                                                                                                |

## 5. Fases (un commit por fase; cada una con tests y `go vet`, `golangci-lint`, `go test -race`)

0. **Esqueleto**: módulo, config, mongo con reintentos, `/healthz`, envoltorio de respuesta, trace id, logs slog, Dockerfile, docker-compose (mongo), CI.
1. **Cuentas y sesión**: `prelogin` (parámetros KDF estables y falsos para correos inexistentes, derivados con HMAC del correo), `register`, `verify-email`, `resend-code`, `login` (compara `authKey` con hash de servidor, tiempo constante), `refresh` con rotación, `logout`, `session`, dispositivos (`/devices`), limitador.
2. **Claves**: `GET /keys`, `PUT /keys/recovery`, `/me/password` (cambio con nuevo `KeyBundle`), `forgot`, `reset/bundle`, `reset` en modos `keep` (exige `recoveryAuth`) y `wipe` (borra notas y carpetas, confirma), `DELETE /me`.
3. **Sync**: `POST /sync` replicando `MockSyncServer`: validación de forma, idempotencia por id, `baseRevision` solo en notas (conflicto devuelve la versión remota sin pisar), carpetas last-write-wins, borrar carpeta desvincula sus notas en servidor, lápidas, `changesSince(cursor)` con carpetas antes que notas, rechazo de ids ajenos. `GET /notes`, `/notes/{id}`, `/folders` solo lectura.
4. **Compartir**: `PUT/GET/DELETE /notes/{id}/share`, `PUT .../share/payload`, `GET /public/notes/{slug}` (404 uniforme, sin enumeración).
5. **Ajustes y uso**: `/settings`, `/me`, `/me/email-change` (+ confirmación), `/storage/usage`.
6. **Purga y correo**: `cmd/purge`, proveedor Resend, plantillas en español.
7. **Contrato y endurecimiento**: tests de contrato contra `openapi.yaml`, escaneo de logs (sin secretos), CORS cerrado al origen de la web, límites de cuerpo, cabeceras de seguridad, `govulncheck`.
8. **Cliente web `data/remote`**: `HttpAuthRepository`, `HttpSyncTransport`, `HttpShareRepository` detrás de la misma interfaz; selector por `PUBLIC_BACKEND=mock|http`; e2e contra el servidor real.

## 6. Pruebas

- Unitarias por paquete con repositorios en memoria.
- Integración con testcontainers (Mongo real): índices, `seq` concurrente, rotación de tokens, purga.
- **Contrato compartido**: los escenarios de `mock-backend.spec.ts` y `local-sync.spec.ts` se traducen a casos JSON (`test/contract/*.json`) que ejecutan tanto el mock TS como el servidor Go.
- E2E: Playwright de la web contra el servidor Go (registro → sincronizar en dos dispositivos → conflicto → recuperación `keep`/`wipe` → enlace público).

## 7. Riesgos

- Dos implementaciones del protocolo pueden divergir → mitigado con el contrato compartido.
- `prelogin` falso mal hecho permite enumerar cuentas → test que compara tiempos y forma de respuesta.
- Pérdida de datos en `wipe` → exige `confirm: true` y se registra en logs sin contenido.
- Sin Redis, el limitador en memoria no escala a varias réplicas → documentado; Redis para producción.
