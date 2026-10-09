#!/usr/bin/env bash
# Levanta TODO para desarrollar contra el servidor real: PostgreSQL (contenedor) + API Go + web.
#
#   pnpm dev:http
#
# Variables opcionales:
#   API_DIR            repo notify_backend (por defecto ../notify_backend)
#   CONTAINER_ENGINE   docker | podman (por defecto el primero que exista)
#   DEV_PG_PORT        puerto de PostgreSQL en tu máquina (por defecto 5432; ver docker-compose.yml del backend)
#   DEV_API_PORT       puerto de la API (por defecto 8080)
#   DEV_WEB_PORT       puerto de la web (por defecto 5173)
#
# Con MAIL_PROVIDER=log los correos no se envían: el código de verificación y los enlaces salen en el registro
# de la API (.dev-api.log, se muestra aquí con el prefijo [api]).
set -euo pipefail
cd "$(dirname "$0")/.."
WEB_DIR="$PWD"
API_DIR="$(cd "${API_DIR:-../notify_backend}" 2>/dev/null && pwd)" || { echo "No encuentro notify_backend (API_DIR)." >&2; exit 1; }
PG_PORT="${DEV_PG_PORT:-5432}"; API_PORT="${DEV_API_PORT:-8080}"; WEB_PORT="${DEV_WEB_PORT:-5173}"

ENGINE="${CONTAINER_ENGINE:-}"
if [ -z "$ENGINE" ]; then
	if command -v podman >/dev/null 2>&1; then ENGINE=podman
	elif command -v docker >/dev/null 2>&1; then ENGINE=docker
	else echo "Hace falta docker o podman." >&2; exit 1; fi
fi
for tool in go pnpm; do command -v "$tool" >/dev/null || { echo "Falta $tool." >&2; exit 1; }; done
compose() { (cd "$API_DIR" && "$ENGINE" compose "$@"); }

echo "▸ PostgreSQL ($ENGINE)…"
compose up -d postgres
for i in $(seq 1 60); do
	compose exec -T postgres pg_isready -U apunte -d apunte >/dev/null 2>&1 && break
	[ "$i" = 60 ] && { echo "PostgreSQL no arrancó." >&2; exit 1; }
	sleep 1
done

echo "▸ Roles de la base (idempotente)…"
compose exec -T postgres psql -U apunte -d apunte -q -v ON_ERROR_STOP=1 \
	-v dbname=apunte -v owner_pw=o -v api_pw=a -v purge_pw=p -v backup_pw=b \
	< "$API_DIR/deploy/db-roles.sql" >/dev/null

URL() { echo "postgres://$1@localhost:$PG_PORT/apunte?sslmode=disable"; }
echo "▸ Migraciones…"
(cd "$API_DIR" && MIGRATE_DATABASE_URL="$(URL apunte_owner:o)" go run ./cmd/migrate up)

echo "▸ API en :$API_PORT…"
LOG="$WEB_DIR/.dev-api.log"; : > "$LOG"
(cd "$API_DIR" && go build -o "$WEB_DIR/.dev-api" ./cmd/api)
APP_ENV=dev PORT="$API_PORT" LOG_LEVEL=info TRUST_PROXY=false \
	WEB_BASE_URL="http://localhost:$WEB_PORT" ALLOWED_ORIGINS="http://localhost:$WEB_PORT" \
	DATABASE_URL="$(URL apunte_api:a)" \
	JWT_SECRET='dev-jwt-secret-0123456789abcdef0123456789abcdef' \
	PEPPER='dev-pepper-0123456789abcdef0123456789abcdef-xyz' \
	MAIL_PROVIDER=log MAIL_FROM='AxoNote <no-reply@localhost>' \
	"$WEB_DIR/.dev-api" >> "$LOG" 2>&1 &
API_PID=$!
tail -n +1 -F "$LOG" 2>/dev/null | sed -u 's/^/[api] /' &
TAIL_PID=$!
cleanup() { kill "$API_PID" "$TAIL_PID" 2>/dev/null || true; rm -f "$WEB_DIR/.dev-api"; }
trap cleanup EXIT INT TERM
for i in $(seq 1 30); do
	curl -fsS "http://localhost:$API_PORT/health" >/dev/null 2>&1 && break
	kill -0 "$API_PID" 2>/dev/null || { echo "La API no arrancó (mira $LOG)." >&2; exit 1; }
	sleep 1
done

echo "▸ Web en http://localhost:$WEB_PORT  (Ctrl+C apaga la API; la base sigue: make down / make down-podman)"
PUBLIC_BACKEND=http PUBLIC_API_URL="http://localhost:$API_PORT" pnpm dev --port "$WEB_PORT" --strictPort
