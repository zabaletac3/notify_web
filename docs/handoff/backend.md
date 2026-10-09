# AxoNote · Backend (Go + PostgreSQL) — estado y pendientes

> Documento de traspaso para una sesión nueva de Claude Code en el repo **`zabaletac3/notify_backend`**.
> Actualizado: 2026-10-09. Léelo entero antes de tocar código; después lee el `CLAUDE.md` del repo.

## 1. Qué es AxoNote

App de notas **offline-first con cifrado de extremo a extremo**. El servidor **nunca descifra**: guarda
metadatos (ids, fechas, carpeta, revisión, papelera) y dos textos cifrados por elemento (`wrappedKey`,
`payload`, formato `a1.<iv>.<ct>`). La contraseña tampoco llega: el cliente deriva un `authKey` con
Argon2id + HKDF y lo envía en su lugar.

Repos del proyecto (una sola persona, `zabaletac3`):

| Repo             | Qué                     | Estado                                                                   |
| ---------------- | ----------------------- | ------------------------------------------------------------------------ |
| `notify_backend` | API Go + PostgreSQL     | **este documento**: fases 0–11 + MFA, Google y dispositivos de confianza |
| `notify_web`     | SvelteKit (web)         | completa con datos simulados y con la API real                           |
| `notify_desktop` | Tauri 2 (Linux/Windows) | por crear (`docs/handoff/escritorio.md` en `notify_web`)                 |
| `notify_mobile`  | Android/iOS             | por crear (`docs/handoff/movil.md` en `notify_web`)                      |

Fuentes de verdad que viven en **`notify_web`** (no en este repo):

- Contrato HTTP: `docs/api/openapi.yaml` (si cambias una ruta, cámbiala allí también).
- Decisiones de la API: `docs/api/decisions.md`.
- Plan del backend por fases: `docs/plans/0006-backend-go.md`.
- Protocolo de sincronización: `docs/adr/0004-sincronizacion.md`. Cifrado: `docs/adr/0005-cifrado-extremo-a-extremo.md`.

## 2. Stack y estructura

Go **1.26.8** (imagen `golang:1.27-alpine` → distroless nonroot) · chi v5 · pgx v5 (SQL a mano,
parametrizado; sin sqlc) · goose (migraciones embebidas) · caarlos0/env · golang-jwt (HS256, rotación por
`kid`) · x/crypto argon2 · slog JSON · Resend por HTTP detrás de `mailer.Mailer`.

```
cmd/api        API (subcomando -healthcheck para Docker)
cmd/migrate    migraciones (MIGRATE_DATABASE_URL, rol dueño)
cmd/purge      limpieza diaria (PURGE_DATABASE_URL, rol de mantenimiento)
internal/platform/  apperrors, response, config (+dotenv), database, httpserver, security,
                    ratelimit, mailer (log|resend|memory), observability, testdb
internal/modules/   auth (cuenta, sesión, claves, recuperación, perfil, cambio de correo,
                    MFA en dos pasos y acceso con Google, dispositivos de confianza),
                    notesync (/sync), share (enlaces públicos), account (ajustes, uso)
internal/jobs/purge
internal/testutil   monta la API completa para pruebas de integración
internal/hardening  pruebas de abuso (logs sin secretos, cadenas/cuerpos hostiles, cabeceras)
migrations/         00001_init … 00011_trusted_devices
deploy/             compose base + qa/prod, Caddy, scripts y timers systemd
docs/               deploy.md, operations.md, security.md
```

Reglas (ver `CLAUDE.md`): `platform` nunca importa `modules`; los módulos no se importan entre sí;
errores siempre con `apperrors.*` y `response.Error`; JSON estricto; fallar cerrado; **nunca registrar**
contraseñas, `authKey`, tokens, códigos ni textos de personas.

## 3. API (todo bajo `/v1`)

Cuerpos sin envoltorio. Errores: `{kind, code?, fields?, entity?, retryAfterSec?}` con
`kind ∈ validation | unauthorized | forbidden | not-found | conflict | rate-limited | session-expired | device-revoked | server`.

| Grupo        | Rutas                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Salud        | `GET /health`, `GET /ready` (fuera de `/v1`)                                                                                                                       |
| Cuenta       | `POST /auth/prelogin`, `/auth/register`, `/auth/verify-email`, `/auth/resend-code`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/session`            |
| Recuperación | `POST /auth/password/forgot`, `/auth/password/reset/bundle`, `/auth/password/reset` (`keep` con clave de recuperación o `wipe`)                                    |
| Claves       | `GET /keys`, `PUT /keys/recovery`, `POST /me/password`                                                                                                             |
| Perfil       | `GET/PATCH /me`, `DELETE /me`, `POST /me/email-change`, `POST /me/email-change/confirm`                                                                            |
| Dispositivos | `GET /devices`, `DELETE /devices/{deviceId}`                                                                                                                       |
| Sync         | `POST /sync` (paginado: `hasMore`), `GET /notes`, `GET /notes/{id}`, `GET /folders`                                                                                |
| Compartir    | `GET/PUT/DELETE /notes/{id}/share`, `PUT /notes/{id}/share/payload`, `GET /public/notes/{slug}`                                                                    |
| Ajustes      | `GET/PATCH /settings`, `GET /storage/usage`                                                                                                                        |
| MFA          | `POST /auth/login/mfa`, `GET /mfa`, `POST /mfa/totp/setup`, `/mfa/totp/enable`, `/mfa/totp/disable`, `POST /mfa/recovery-codes`                                    |
| Google       | `POST /auth/google/start`, `GET /auth/google/callback`, `POST /auth/google/exchange`, `/auth/google/link`, `/auth/google/register`, `DELETE /me/identities/google` |
| Confianza    | `GET/POST /trusted-devices`, `GET/DELETE /trusted-devices/{id}`                                                                                                    |

Seguridad ya implementada: anti-enumeración (register/resend/forgot/prelogin/email-change responden igual;
correo en segundo plano), hash ficticio para cuentas inexistentes, límites en PostgreSQL con bloqueos
progresivos (login 60/min por IP antes de hashear, verificación 15/h por cuenta…), rotación de refresh con
detección de reuso (revoca familia y dispositivo), comprobación del dispositivo en cada petición
(`device-revoked`), tokens/códigos guardados con hash, IP real solo vía `httpserver.ClientIP`, CORS sin
credenciales, logs por patrón de ruta (sin ids ni slugs), límites de cuerpo por ruta, NUL rechazado.

## 4. Base de datos

Cuatro roles (`deploy/db-roles.sql`, idempotente con `\gexec`, contraseñas por `psql -v`):
`apunte_owner` (migraciones), `apunte_api` (la API: sin DDL, **sujeta a RLS**), `apunte_purge`
(grupo `apunte_maint`), `apunte_backup` (BYPASSRLS + `pg_read_all_data`, solo copias).
RLS en notes/folders/tombstones/devices/share_links con `app_user_id()`; la API usa
`database.WithUser / WithoutUser / WithPublicSlug` (siempre `SET LOCAL`). `seq` por cuenta con `next_seq()`.

**Nunca** pongas el superusuario o `apunte_owner` en `DATABASE_URL`: RLS no se aplicaría.

## 5. Ejecutar en local

```bash
make up            # Docker   (o make up-podman)  → Postgres 17 en 127.0.0.1:5432, usuario apunte/apunte
# una vez: roles + migraciones
docker compose exec -T postgres psql -U apunte -d apunte -v ON_ERROR_STOP=1 \
  -v dbname=apunte -v owner_pw=o -v api_pw=a -v purge_pw=p -v backup_pw=b < deploy/db-roles.sql
MIGRATE_DATABASE_URL='postgres://apunte_owner:o@localhost:5432/apunte?sslmode=disable' make migrate
make run           # carga .env si existe (el entorno del proceso manda)
```

`.env` mínimo: `APP_ENV=dev`, `DATABASE_URL=postgres://apunte_api:a@localhost:5432/apunte?sslmode=disable`,
`JWT_SECRET` y `PEPPER` (≥ 32 caracteres, distintos), `ALLOWED_ORIGINS=http://localhost:5173`,
`WEB_BASE_URL=http://localhost:5173`, `MAIL_PROVIDER=log`, `MAIL_FROM=…`. Con `MAIL_PROVIDER=log` los
correos (códigos, enlaces) salen en la terminal en texto legible.

Todo junto con la web: en `notify_web`, `pnpm dev:http` (Postgres en contenedor + roles + migraciones + API + web).

Calidad (cada cambio): `make test` (con `TEST_DATABASE_URL` de administrador, p. ej. `make test-db`),
`make lint`, `go vet ./...`, `make vuln`. La CI (`.github/workflows/ci.yml`) corre todo con Postgres.
Flujo: **una rama + PR por cambio**, squash merge cuando la CI está verde.

## 6. Despliegue (preparado, nunca ejecutado)

Un VPS con dos pilas Compose (`apunte-qa`, `apunte-prod`), Caddy como único contenedor expuesto (confía en
Cloudflare), Postgres en red `internal` sin salida, la API solo lee `<env>.api.env`. GitHub Actions:
`deploy-qa.yml` (push a `develop`), `deploy-prod.yml` (tag `v*`, entorno `production` con aprobación).
`deploy/release.sh` (migra, despliega y revierte solo si falla el healthcheck), `rollback.sh`,
`setup-server.sh` (ufw, SSH por llave, Docker), `backup.sh` (pg_dump → restic → R2/B2) +
`restore-test.sh`, timers systemd para purga y copias. Guías: `docs/deploy.md`, `docs/operations.md`.

Verificado en local: `caddy validate` (Caddy 2.10), `docker compose config` de qa y prod, ciclo restic
(volcado con `apunte_backup` → copia → `restic check` → restauración con recuentos iguales).

## 7. Lo que falta (por prioridad)

1. **Primer despliegue en QA** (lo bloquea casi todo lo demás): VPS, dominio, Cloudflare (Full strict,
   Access para QA), secretos de GitHub Actions, `setup-server.sh`, `init-db.sh`, primera `release.sh`,
   probar la reversión automática. Seguir `docs/deploy.md` y marcar la checklist de `docs/security.md`.
2. **Correo real**: dominio en Resend (SPF, DKIM, DMARC), `MAIL_PROVIDER=resend` en QA y prueba de
   cada plantilla (verificación, restablecer, cambios de credenciales, cambio de correo).
3. **Copias contra el bucket real** y `restore-test.sh` con datos reales; latidos (`*_PING_URL`).
4. **Auditoría dinámica contra QA**: ZAP, nuclei, testssl (runbook en `docs/security.md`).
5. **CORS para las apps de escritorio**: añadir los orígenes de Tauri (`tauri://localhost` en Linux y
   `http://tauri.localhost` en Windows) a `ALLOWED_ORIGINS` cuando exista la app (ver `escritorio.md`).
   El móvil nativo no necesita CORS.
6. **Endurecimiento pendiente**: fijar las acciones de GitHub por SHA; revisar que `DELETE /me` pida la
   prueba de la contraseña (hoy no la pide porque el contrato no la incluye: cambiar contrato + web).
7. **Verificación en dos pasos y Google**: **hechos** (ADR 0006): TOTP + códigos de respaldo, login en dos pasos, OAuth de Google y dispositivos de confianza. Pendiente solo la revisión de seguridad del conjunto (fase 7 del plan `plan-google-mfa.md`).
8. **Observabilidad**: métricas básicas y alertas (hoy solo logs JSON, `/ready` y latidos).
9. **Política de privacidad** (Ley 1581): correo y metadatos son datos personales; el contenido está cifrado.

## 8. Cómo trabajar

- Antes de cambiar una ruta: actualizar `docs/api/openapi.yaml` en `notify_web` (`pnpm api:lint`) y el
  cliente `src/lib/data/remote`.
- Prueba e2e de la web contra esta API: en `notify_web`, `pnpm e2e:http` (necesita este repo al lado y un
  Postgres; ver `e2e-http/api.sh`). Cubre registro, dos dispositivos, conflicto, recuperación, enlace
  público, dispositivo revocado, **verificación en dos pasos** (TOTP generado en la prueba) y **Google**
  (con `GOOGLE_PROVIDER=fake`, que `e2e-http/api.sh` activa solo en dev).
- Las migraciones nuevas: solo hacia adelante, compatibles con la versión anterior; si añaden datos de
  personas, decidir su purga y su política RLS para `apunte_maint`.
