# Apunte · Despliegue de QA y producción — decisiones y pasos

> Documento de traspaso para una sesión de Claude Code que haga el **primer despliegue**.
> Actualizado: 2026-10-08. Nada de esto se ha ejecutado todavía en un servidor real.
> Fuentes detalladas en `notify_backend`: `docs/deploy.md`, `docs/operations.md`, `docs/security.md`
> y la carpeta `deploy/`. Este documento reúne las decisiones; si algo choca, manda el código de `deploy/`.

## 1. Decisiones tomadas

| Tema          | Decisión                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Servidor      | **Un solo VPS** Ubuntu al inicio con QA y producción. Cuando haya usuarios reales, QA se muda a su propio VPS (solo cambian los secretos de GitHub)                                                                                                     |
| Aislamiento   | Dos proyectos de Docker Compose separados (`apunte-qa`, `apunte-prod`): **no** comparten red de base de datos, volúmenes, contraseñas ni secretos                                                                                                       |
| Entrada       | **Cloudflare** delante (DNS con proxy, SSL «Full (strict)», anti-DDoS, WAF). **Caddy** es el único contenedor con puertos publicados (80/443) y atiende los dos ambientes                                                                               |
| QA privado    | `qa` y `api-qa` detrás de **Cloudflare Access** (solo tú y tus testers)                                                                                                                                                                                 |
| Web           | **Cloudflare Pages**: rama `main` → `app.<dominio>`, rama `develop` → `qa.<dominio>` (ver §6: falta implementarlo)                                                                                                                                      |
| API           | Imagen Docker distroless sin root (`api`, `migrate`, `purge`) publicada en **GHCR** (`ghcr.io/zabaletac3/notify_backend`)                                                                                                                               |
| Base de datos | PostgreSQL 17 por ambiente, sin puertos publicados, red `internal` **sin salida a internet**, `scram-sha-256`, RLS, cuatro roles de mínimo privilegio (owner / api / purge / backup)                                                                    |
| Secretos      | Solo en el servidor, en `/etc/apunte/*.env` (`0600`, root). **La API solo lee `<amb>.api.env`** (nunca ve la contraseña del dueño del esquema ni del superusuario). GitHub solo guarda la llave SSH de despliegue                                       |
| Correo        | **Resend** detrás de la interfaz `mailer.Mailer` (patrón adaptador para cambiar de proveedor). Prod: `MAIL_PROVIDER=resend` (la API se niega a arrancar con `log` en prod). QA: `log` (los códigos salen en el log), o Resend con un dominio de pruebas |
| Ramas y flujo | `feature/x` → PR → `develop` (**despliega solo a QA**) → PR → `main` → **etiqueta `v*`** → aprobación manual → producción                                                                                                                               |
| Migraciones   | Siempre **antes** de arrancar la API nueva; solo hacia adelante y **compatibles hacia atrás** (la reversión no deshace migraciones)                                                                                                                     |
| Reversión     | `release.sh` vuelve solo a la versión anterior si la API no queda sana en 90 s; manual con `rollback.sh`                                                                                                                                                |
| Copias        | Solo prod: `pg_dump` (rol `apunte_backup`) → **restic** cifrado → bucket R2 o B2 exclusivo de prod. Retención 7 diarias / 4 semanales / 6 mensuales. Prueba de restauración mensual en QA                                                               |
| Purga         | `cmd/purge` diario por timer systemd (papelera > 30 días, cuentas borradas > 30 días, lápidas > 90, etc.)                                                                                                                                               |
| Alertas       | Gratis y externas: UptimeRobot/Better Stack sobre `/ready`; latidos (healthchecks.io) de copia y purga                                                                                                                                                  |
| Datos de QA   | **Nunca datos reales**. Cuentas de prueba creadas desde la app (el servidor no puede fabricar notas cifradas). `reset-qa.sh --yes` lo deja vacío                                                                                                        |

## 2. Esquema

```
                Cloudflare (DNS, HTTPS Full strict, WAF, anti-DDoS)
   app.<dominio>  (Pages, main)                 qa.<dominio>  (Pages, develop)   ← Access
   api.<dominio>                                api-qa.<dominio>                 ← Access
                         │
                VPS Ubuntu — ufw: SSH limitado; 80/443 solo desde rangos de Cloudflare
                         │
                Caddy :80/:443 (red apunte_edge)
                  ├── apunte-prod:  api ── postgres (red internal, volumen propio)
                  └── apunte-qa:    api ── postgres (red internal, volumen propio)
```

Límites de memoria: prod API 512 MB / Postgres 768 MB; QA 384 MB / 384 MB; Caddy 128 MB. Un VPS de
2 vCPU y 4 GB alcanza para empezar.

## 3. Seguridad por capa (ya implementada en `deploy/`)

- **Cloudflare**: regla de limitación sugerida `POST /v1/auth/*` 20 peticiones/min por IP.
- **Servidor** (`setup-server.sh`): ufw + regla `DOCKER-USER` (Docker se salta ufw), SSH solo con llave
  y sin root, `fail2ban`, actualizaciones automáticas, usuario `deploy`.
- **Caddy**: confía solo en Cloudflare para la IP real (`CF-Connecting-IP`) y entrega a la API **una
  sola IP** en `X-Forwarded-For` (por eso `TRUST_PROXY=true` en el servidor); cuerpo máx. 9 MB; tiempos
  máximos; HSTS; sin cabecera `Server`; los logs redactan los slugs de enlaces públicos.
- **Contenedores**: `read_only`, `cap_drop: ALL`, `no-new-privileges`, sin `ports:`, límites de memoria
  y procesos, imagen sin shell.
- **API**: falla cerrado sin secretos válidos; JWT y pepper distintos por ambiente; CORS solo para el
  dominio de su web.

## 4. Archivos de secretos (en `/etc/apunte/`, a partir de los `.example` de `deploy/`)

| Archivo          | Variables                                                                                                                                                                                               | Quién lo lee                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `<amb>.env`      | `ENV_NAME`, `API_ENV_FILE`, `POSTGRES_PASSWORD`, `OWNER_PASSWORD`, `API_PASSWORD`, `PURGE_PASSWORD`, `BACKUP_PASSWORD`, `MIGRATE_DATABASE_URL`                                                          | Compose, `init-db.sh`, migraciones |
| `<amb>.api.env`  | `APP_ENV`, `PORT`, `LOG_LEVEL`, `TRUST_PROXY=true`, `WEB_BASE_URL`, `ALLOWED_ORIGINS`, `DATABASE_URL` (rol `apunte_api`), `JWT_SECRET`, `PEPPER`, `MAIL_PROVIDER`, `MAIL_FROM`, `RESEND_API_KEY` (prod) | **solo la API**                    |
| `caddy.env`      | `ACME_EMAIL`, `API_DOMAIN_PROD`, `API_DOMAIN_QA`, `CLOUDFLARE_RANGES`                                                                                                                                   | Caddy                              |
| `prod.purge.env` | `PURGE_DATABASE_URL`, `PURGE_PING_URL`                                                                                                                                                                  | timer de purga                     |
| `backup.env`     | `BACKUP_PASSWORD`, `RESTIC_REPOSITORY`, `RESTIC_PASSWORD_FILE`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BACKUP_PING_URL`                                                                         | timer de copias                    |

Genera cada secreto con `openssl rand -base64 48`, **distinto en QA y prod**. Guarda en tu gestor de
contraseñas al menos la contraseña de restic (sin ella las copias no se abren, a propósito).

## 5. Primer despliegue paso a paso

**Lo que necesitas comprar o crear:** un VPS Ubuntu 24.04 (Hetzner, DigitalOcean…), un dominio en
Cloudflare, cuenta de Resend con el dominio verificado (SPF, DKIM, DMARC), un bucket R2 o B2 para
copias, cuentas gratuitas de UptimeRobot y healthchecks.io.

1. **DNS en Cloudflare**: registros `A` con proxy para `api` y `api-qa` → IP del VPS; SSL/TLS
   **Full (strict)**; Cloudflare Access sobre `api-qa` y `qa`.
2. **Servidor**: `sudo DEPLOY_USER=deploy DEPLOY_PUBKEY="ssh-ed25519 …" ./deploy/setup-server.sh`.
   Antes de cerrar la sesión, comprueba en otra terminal que entras como `deploy` con tu llave.
3. **Secretos**: copiar los `.example` a `/etc/apunte/` (tabla §4), rellenar y `chmod 600`.
4. **Caddy**: `cd deploy/caddy && docker network create apunte_edge && docker compose up -d`, y
   `caddy validate` con las variables reales.
5. **Base de cada ambiente**:
   `docker compose -p apunte-<amb> --env-file /etc/apunte/<amb>.env -f deploy/docker-compose.yml -f deploy/compose.<amb>.yml up -d postgres`
   y después `deploy/init-db.sh <amb>` (crea los roles; repetirlo rota las contraseñas).
6. **Primera versión**: `deploy/release.sh <amb> <etiqueta>` (descarga la imagen, migra, arranca,
   espera a que esté sana). Empieza por **QA**.
7. **GitHub** (`notify_backend` → Settings): secretos de Actions `SSH_HOST`, `SSH_USER`, `SSH_KEY`
   (llave ed25519 **solo** para desplegar), `SSH_KNOWN_HOSTS` (`ssh-keyscan -t ed25519 <host>`);
   entornos `qa` (sin aprobación) y `production` (**aprobación manual obligatoria**); proteger `main` y
   `develop` (PR + CI en verde). Crear la rama `develop` si no existe.
8. **Timers** (prod): `apunte-purge.{service,timer}` y `apunte-backup.{service,timer}` a
   `/etc/systemd/system/` y `systemctl enable --now …`.
9. **Alertas**: `/ready` de cada API en UptimeRobot; latidos de copia y purga.
10. **Comprobaciones**: `curl https://api-qa.<dominio>/ready`; desde la web de QA, registro + código +
    nota + segundo dispositivo; `deploy/restore-test.sh`; forzar un fallo para ver la reversión
    automática; ZAP, nuclei y testssl contra QA (runbook en `docs/security.md`). Marcar la checklist
    previa a producción de `docs/security.md` antes de abrir prod.

## 6. Lo que falta implementar antes de poder desplegar la web

El backend está listo para desplegarse; **la web no**:

1. Cambiar `adapter-auto` por **`adapter-static`** (con `fallback`) en `notify_web` y comprobar que
   todas las rutas funcionan como SPA, incluido `/n/[slug]`.
2. Pasar las cabeceras de `src/hooks.server.ts` (Referrer-Policy, nosniff, Permissions-Policy,
   COOP, HSTS, `frame-ancestors`) y la CSP a un archivo **`_headers`** de Pages.
3. Variables por entorno en Pages: `PUBLIC_BACKEND=http`, `PUBLIC_API_URL=https://api[-qa].<dominio>`
   y un `PUBLIC_SHARE_ORIGIN` nuevo (hoy `SHARE_ORIGIN` está fijo en `https://apunte.app` en
   `src/lib/data/crypto/share-codec.ts`).
4. Conectar el repo a Pages: `main` → producción, `develop` → vista previa con dominio `qa.<dominio>`.
5. En las APIs: `ALLOWED_ORIGINS` = dominio de su web (`https://app.<dominio>` en prod,
   `https://qa.<dominio>` en QA) y `WEB_BASE_URL` igual (los enlaces de los correos apuntan ahí).

## 7. Operación diaria

- **Desplegar QA**: merge a `develop` → automático (imagen `sha-<commit>`).
- **Desplegar prod**: merge a `main`, `git tag v1.2.0 && git push --tags` → aprobar en GitHub.
- **Revertir**: `ssh deploy@<servidor> /opt/apunte/deploy/rollback.sh prod`.
- **Logs**: `docker compose -p apunte-prod logs api | jq 'select(.level=="ERROR")'` (nunca contienen
  contraseñas, claves, textos ni correos completos).
- **Mudar de servidor** (< 1 h): `setup-server.sh` → copiar `/etc/apunte` → Caddy → `init-db.sh` →
  restaurar la copia → `release.sh` → cambiar la IP en Cloudflare.
- **Problemas típicos**: `429` masivos → revisar `TRUST_PROXY` (solo `true` detrás de Caddy);
  `503` en `/ready` → la base no responde (la API falla cerrado).

## 8. Abierto / por decidir

- Proveedor del VPS y del bucket de copias (R2 o B2).
- Dominio definitivo (los ejemplos usan `tudominio.com`; el código usa `apunte.app` como provisional).
- Si QA usa Resend con un dominio de pruebas o se queda con `MAIL_PROVIDER=log`.
- Fijar las acciones de GitHub por SHA (hoy por versión).
- Orígenes de Tauri en `ALLOWED_ORIGINS` cuando exista la app de escritorio
  (`tauri://localhost`, `http://tauri.localhost`).
