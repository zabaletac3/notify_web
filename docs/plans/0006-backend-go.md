# Plan 0006 · Backend de AxoNote en Go + PostgreSQL

Estado: **fases 0–11 aplicadas** (backend en `github.com/zabaletac3/notify_backend`, Go 1.26.8; cliente web en `src/lib/data/remote`; e2e real con `pnpm e2e:http`). Pendiente operativo: primer despliegue real en el VPS y verificaciones marcadas en `docs/deploy.md`.
Contrato: `docs/api/openapi.yaml`. Protocolo: ADR 0004. Cifrado: ADR 0005.
Sustituye a la versión con MongoDB: se elige **PostgreSQL** (D4) y se descarta Meilisearch (la búsqueda es del cliente, D11).

## 1. Principios

1. **El servidor nunca descifra.** Guarda metadatos + `wrappedKey` + `payload` (`a1.<iv>.<ct>`) y solo valida su forma.
2. **El contrato manda**: endpoints de `openapi.yaml`; comportamiento de `/sync` de `MockSyncServer`.
3. **Una cuenta = una persona.** Sin tenants. Toda consulta lleva `user_id` (y hay RLS como segunda barrera, ver §5).
4. **Seguridad por defecto, fallar cerrado.** Si falta un secreto, la API no arranca; si el limitador falla, se rechaza.
5. **Nada sensible en logs ni en errores**: ni `authKey`, ni `payload`, ni códigos, ni tokens, ni correos completos.
6. **Un binario, una imagen**, QA y prod solo difieren en el `.env`.

## 2. Stack

Go 1.25 · chi v5 · pgx v5 (+ pgxpool) · sqlc · goose · caarlos0/env v11 · validator v10 · `log/slog` JSON · golang-jwt v5 (HS256, secreto ≥ 32 bytes) · `crypto/subtle`, `crypto/sha256`, `crypto/hmac` · testcontainers-go (Postgres) · kin-openapi (contrato) · golangci-lint (+ gosec) · govulncheck · restic (backups). Sin Redis al inicio: limitador en Postgres (tabla `rate_limits`), válido para una sola réplica y también para varias.

## 3. Estructura (alineada con tu plantilla)

```
cmd/api/main.go            cmd/purge/main.go     cmd/migrate/main.go
internal/modules/
  auth/      (prelogin, register, verify, login, refresh, logout, reset, middleware)
  account/   (me, email-change, password, delete)
  keys/      (KeyBundle, recovery)
  sync/      (POST /sync, GET notes/folders)
  share/     (enlaces y ruta pública)
  device/    settings/   usage/
internal/platform/
  config/ database/ httpserver/ mailer/ ratelimit/ security/ observability/
migrations/                # goose, solo hacia adelante y compatibles hacia atrás
test/contract/             # casos JSON compartidos con la web
deploy/                    # compose base + qa + prod, Caddyfile, setup-server.sh, backup.sh
.github/workflows/         # ci.yml, deploy-qa.yml, deploy-prod.yml
```

Regla: `modules/` usa `platform/`; `platform/` nunca importa `modules/`. Un módulo no importa a otro salvo por interfaces pequeñas definidas en el que consume.

## 4. Modelo PostgreSQL (migraciones goose)

```sql
users(id uuid pk, email citext unique not null, email_verified_at timestamptz,
      kdf jsonb not null, auth_key_hash bytea not null, recovery_auth_hash bytea,
      keys jsonb not null,           -- KeyBundle (solo claves envueltas)
      settings jsonb not null default '{}', account_seq bigint not null default 0,
      deleted_at timestamptz, created_at timestamptz not null default now())

folders(id uuid pk, user_id uuid not null references users on delete cascade,
        revision int not null, seq bigint not null, created_at, updated_at,
        wrapped_key text not null check (wrapped_key ~ '^a1\.'), payload text not null check (payload ~ '^a1\.'),
        check (length(payload) <= 65536))
notes(id uuid pk, user_id uuid not null references users on delete cascade,
      folder_id uuid null, revision int not null, seq bigint not null, created_at, updated_at,
      deleted_at timestamptz, last_edited_device_id uuid,
      wrapped_key text not null, payload text not null, check (length(payload) <= 1500000))
tombstones(user_id, entity text, id uuid, revision int, seq bigint, primary key (user_id, entity, id))
devices(id uuid pk, user_id, name text, platform text, last_seen_at, revoked_at)
refresh_tokens(id uuid pk, user_id, device_id, family_id uuid, token_hash bytea unique,
               expires_at, used_at, revoked_at, created_at)
share_links(slug text pk check (length(slug)=22), note_id uuid unique references notes on delete cascade,
            user_id, wrapped_key text, payload text, created_at)
verification_codes(id, user_id, purpose, code_hash bytea, attempts int, expires_at, consumed_at)
rate_limits(key text pk, count int, window_start timestamptz, blocked_until timestamptz)
audit_log(id, user_id, event text, ip_hash bytea, at timestamptz)   -- sin contenido
```

Índices: `notes(user_id, seq)`, `folders(user_id, seq)`, `notes(user_id, deleted_at)`, `tombstones(user_id, seq)`, `refresh_tokens(family_id)`, `devices(user_id)`. `seq` por cuenta: `UPDATE users SET account_seq = account_seq + 1 WHERE id=$1 RETURNING account_seq` dentro de la misma transacción del cambio (atómico y sin huecos de concurrencia). Todos los ids los pone el cliente (UUID v7) y se rechaza un id que ya pertenezca a otra cuenta.

## 5. Modelo de amenazas y controles (qué evita que te hackeen)

| Amenaza                      | Control                                                                                                                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Robo de la base de datos     | Solo hay textos cifrados con claves que el servidor no tiene; contraseñas nunca llegan; `auth_key_hash` = Argon2id sobre la `authKey` (el servidor aplica además un _pepper_ en env). Backups cifrados con restic.                      |
| Fuerza bruta de login        | 5 fallos/15 min por correo+IP y 20/h por IP; bloqueo progresivo; Argon2id del cliente encarece cada intento; mismas respuestas y tiempos para correo inexistente (`prelogin` con parámetros falsos derivados de HMAC(email, secreto)).  |
| Enumeración de cuentas       | `register`, `forgot`, `resend-code` responden igual exista o no el correo; comparación en tiempo constante.                                                                                                                             |
| Robo de tokens               | Acceso 15 min; renovación opaca (32 bytes aleatorios, guardada como SHA-256) con **rotación y detección de reutilización** (si se reusa uno, se revoca toda la familia). Cookie `HttpOnly; Secure; SameSite=Strict; Path=/auth` en web. |
| IDOR / acceso a datos ajenos | Todas las consultas filtran `user_id` en sqlc; **RLS de Postgres** (`SET LOCAL app.user_id`) como segunda barrera; tests que intentan leer datos de otra cuenta en cada endpoint.                                                       |
| Inyección                    | Solo consultas parametrizadas (sqlc/pgx); sin SQL por concatenación (regla de lint).                                                                                                                                                    |
| XSS / clickjacking / CSRF    | API solo JSON; `Content-Type` estricto; CORS con lista cerrada de orígenes; SameSite=Strict; `X-Content-Type-Options`, `Cache-Control: no-store` en rutas autenticadas, HSTS desde Caddy.                                               |
| Enlaces públicos             | Slug aleatorio de 22 caracteres; 404 uniforme; límite por IP; `no-store`, `no-referrer`, `X-Robots-Tag: noindex`; la clave solo está en el fragmento de la URL.                                                                         |
| DoS / abuso                  | Límite de cuerpo (nota 1,5 MB, `/sync` 8 MB y 500 cambios), `ReadHeaderTimeout`, `http.MaxBytesReader`, límite de conexiones y de peticiones por IP en Caddy, cuotas por cuenta.                                                        |
| Secretos                     | Solo en `.env` del servidor (0600), distintos por ambiente; la app no arranca sin ellos; rotación documentada del secreto JWT (aceptar dos claves durante la transición).                                                               |
| Cadena de suministro         | `go mod verify`, `govulncheck` y Dependabot en CI; imagen distroless/no-root, solo lectura; `gosec` en lint; acciones de GitHub fijadas por SHA.                                                                                        |
| Infraestructura              | Postgres sin `ports:` y en red interna; `ufw` 22/80/443 (Docker se salta ufw si publicas puertos); SSH solo con llave, sin root; Cloudflare Full (strict); usuario de BD de la API sin superusuario ni DDL (otro rol para migraciones). |
| Cuenta comprometida          | Lista de dispositivos y revocación → 401 `device-revoked`; cambio de contraseña revoca sesiones; `audit_log` de eventos sensibles (login, reset, wipe, borrado).                                                                        |
| Pérdida de datos             | `wipe` pide `confirm`; borrado de cuenta con 30 días de gracia; backup diario probado mensualmente.                                                                                                                                     |

Fuera de alcance (honestidad): un cliente web comprometido (XSS) puede leer la clave maestra en memoria; por eso la web mantiene CSP estricta (ADR 0005). 2FA (D12) queda para una fase posterior.

## 6. Decisiones (cerradas con esta versión)

| #          | Decisión                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D2         | JWT 15 min + renovación opaca con rotación y familias; cookie HttpOnly en web, `Authorization: Bearer` en escritorio/móvil.                                     |
| D4         | **PostgreSQL**, sin tenant, esquema §4.                                                                                                                         |
| D5         | Imágenes: diferidas.                                                                                                                                            |
| D6         | `Mailer` con implementación `log` (dev/QA) y **Resend** (prod). Código 6 dígitos, 10 min, 5 intentos, hash en BD.                                               |
| D7         | `cmd/purge` diario (cron en el host): notas en papelera > 30 días, lápidas > 90, cuentas borradas > 30, tokens y códigos caducados, `rate_limits` viejos.       |
| D8         | Google: diferido.                                                                                                                                               |
| D9         | Límites en §5, todos por variable de entorno.                                                                                                                   |
| D10        | Enlaces sin caducidad; página pública en la web, backend solo sirve el JSON.                                                                                    |
| D12        | 2FA diferido.                                                                                                                                                   |
| Despliegue | Un VPS al inicio (QA y prod en contenedores separados, QA apagable); dos VPS cuando haya usuarios reales. Cloudflare delante; Caddy como único puerto expuesto. |

## 7. Fases (un commit por fase; cada una cierra con `go vet`, `golangci-lint`, `go test -race ./...` y `govulncheck`)

### Fase 0 · Esqueleto y calidad

`go mod init github.com/zabaletac3/notify_backend`; estructura §3; `config` (env v11, falla si faltan secretos o son cortos); `slog` JSON con `traceId`; envoltorio de respuesta y `apperrors` copiados de la plantilla; `/health` (BD) y `/ready`; recover, límite de cuerpo, timeouts, cabeceras de seguridad; `Makefile`; `Dockerfile` multi-etapa (distroless, no-root); `docker-compose` de desarrollo con Postgres; CI (`ci.yml`: build, vet, lint+gosec, test, govulncheck); `.golangci.yml`; `CLAUDE.md` y README del repo.
**Hecho cuando:** `make run` levanta y `curl /health` responde; CI verde.

### Fase 1 · Base de datos y migraciones

goose + `cmd/migrate`; migraciones del §4 con CHECKs (forma `a1.`, tamaños); roles `apunte_app` (sin DDL) y `apunte_migrator`; RLS activado en `notes`, `folders`, `tombstones`, `devices`, `share_links`; sqlc configurado; helper de transacción que fija `app.user_id`; testcontainers.
**Hecho cuando:** test que prueba que, con `app.user_id` de otra cuenta, no se lee ni escribe nada ajeno.

### Fase 2 · Utilidades de seguridad (`platform/security`, `ratelimit`)

Hash de `authKey` (Argon2id + pepper), comparaciones constantes, generador de tokens/códigos, JWT con rotación de claves, `ratelimit` en Postgres (ventana + bloqueo progresivo), hash de IP con sal diaria para `audit_log`, `prelogin` falso (HMAC).
**Hecho cuando:** pruebas unitarias incluyendo tiempos comparables entre cuenta existente e inexistente.

### Fase 3 · Cuentas y sesión

`prelogin`, `register`, `verify-email`, `resend-code`, `login` (devuelve acceso+renovación, crea `device`), `refresh` con rotación y detección de reutilización, `logout`, `session`, middleware de auth (valida JWT + dispositivo no revocado → `device-revoked`), `/devices` (listar/revocar). Mailer `log`.
**Hecho cuando:** contrato de auth pasa; tests de reutilización de refresh, fuerza bruta, enumeración y dispositivo revocado.

### Fase 4 · Claves y recuperación

`GET /keys`, `PUT /keys/recovery`, `/me/password` (nuevo `KeyBundle`; revoca otras sesiones), `forgot`, `reset/bundle`, `reset` en `keep` (exige `recoveryAuth`) y `wipe` (borra notas, carpetas, enlaces y lápidas, con `confirm`), `POST /me/delete` (exige la prueba de la contraseña `authKey`; marca `deleted_at`; gracia de 30 días; D14). `DELETE /me`, sin prueba, queda obsoleto (`Deprecation`/`Sunset`) y se retira 14 días después del despliegue.
**Hecho cuando:** escenarios `keep`/`wipe` del cliente pasan contra el servidor real.

### Fase 5 · Sincronización

`POST /sync` exactamente como `MockSyncServer`: validar forma, idempotencia por id, `baseRevision` solo en notas (conflicto devuelve la versión remota y no pisa), carpetas last-write-wins, borrar carpeta desvincula sus notas, lápidas, `changesSince(cursor)` con carpetas antes que notas, rechazo de ids ajenos, límites. Todo en una transacción con el `seq` atómico. `GET /notes`, `/notes/{id}`, `/folders`.
**Hecho cuando:** los casos de `test/contract` (derivados de `mock-backend.spec.ts` y `local-sync.spec.ts`) pasan en TS y en Go; prueba de concurrencia con dos dispositivos.

### Fase 6 · Compartir

`PUT/GET/DELETE /notes/{id}/share`, `PUT .../share/payload`, `GET /public/notes/{slug}` con cabeceras de §5, límite por IP, 404 uniforme; revocar al borrar la nota.
**Hecho cuando:** test de que un slug inexistente y uno revocado son indistinguibles.

### Fase 7 · Ajustes, correo y uso

`/me`, `/me/email-change` + confirmación, `/settings`, `/storage/usage` (suma de bytes de `payload`), cuotas; proveedor Resend con plantillas en español; `audit_log`.

### Fase 8 · Purga y operación

`cmd/purge` idempotente (D7); `backup.sh` (pg_dump + restic a R2/B2, retención 7/4/6); métricas básicas y alertas por correo; documentación de restauración.

### Fase 9 · Despliegue

`deploy/` con compose base + overrides qa/prod, `Caddyfile` único (`{$API_DOMAIN}`, límites y cabeceras), `setup-server.sh` (ufw, SSH solo llave, Docker, usuario no-root), workflows `deploy-qa.yml` (push a `develop`) y `deploy-prod.yml` (tag `v*`, misma imagen), migraciones como paso previo, rollback documentado, Cloudflare (Full strict, Access para QA), seed `qa.sql` ficticio.

### Fase 10 · Endurecimiento y auditoría

Revisión con `/security-review`, pruebas de abuso (fuzz de `/sync`, cuerpos gigantes, JWT manipulados, `alg=none`), escaneo de logs en busca de secretos, `nuclei`/ZAP básico contra QA, checklist OWASP ASVS nivel 2, prueba de restauración de backup.

### Fase 11 · Cliente web `data/remote`

`HttpAuthRepository`, `HttpSyncTransport`, `HttpShareRepository` tras las mismas interfaces; selector `PUBLIC_BACKEND=mock|http`; manejo de `device-revoked`; e2e Playwright contra el servidor real .

## 8. Pruebas

Unitarias por paquete; integración con Postgres real (testcontainers); contrato compartido con la web; e2e de la web contra la API; pruebas de seguridad de la Fase 10 como parte de CI cuando sea posible.

## 9. Riesgos

- Divergencia entre el mock TS y el servidor Go → contrato compartido.
- RLS mal configurado da falsa seguridad → tests negativos por endpoint y por rol.
- Un solo VPS es punto único de fallo → backups probados y plan de mudanza (<1 h) con `setup-server.sh`.
- Pérdida de contraseña y clave de recuperación = pérdida de notas (asumido por diseño, ADR 0005): debe quedar claro en la UI y la política de privacidad.
- Cumplimiento (Ley 1581): correo y metadatos son datos personales; política de privacidad, retención y derecho de supresión (cubierto por `POST /me/delete` y la purga).
