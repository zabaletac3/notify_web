#!/usr/bin/env bash
# Levanta la API real (Go + PostgreSQL) para las pruebas e2e contra el servidor de verdad.
#
#   API_DIR            carpeta del repo notify_backend (por defecto ../notify_backend)
#   E2E_PG_HOST/PORT/USER/PASSWORD  PostgreSQL de pruebas con un usuario administrador
#                      (por defecto TCP en localhost:5432, usuario apunte/apunte).
#   E2E_PG_CONTAINER   contenedor PostgreSQL de desarrollo que se usa cuando no hay `psql` local
#                      (por defecto notify_backend_postgres_1).
#
# Crea una base nueva (apunte_e2e) con los roles reales (la API corre SIN privilegios, sujeta a RLS),
# aplica las migraciones y arranca la API en :18080 con el correo en el registro (los códigos se leen de ahí).
# El proveedor de Google es `fake` (solo dev): el bloque de pruebas de Google no habla con Google de verdad.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
API_DIR="$(cd "${API_DIR:-../notify_backend}" && pwd)"
PGHOST_E2E="${E2E_PG_HOST:-localhost}"; PGPORT_E2E="${E2E_PG_PORT:-5432}"
PGSUPER="${E2E_PG_USER:-apunte}"; PGSUPER_PW="${E2E_PG_PASSWORD:-apunte}"
PG_CONTAINER="${E2E_PG_CONTAINER:-notify_backend_postgres_1}"
DBNAME=apunte_e2e
LOG="$ROOT/e2e-http/.api.log"
: > "$LOG"
# URL de conexión (socket Unix o host) para un usuario/contraseña dados. El proceso de la API corre en el
# host, así que las claves de la URL (host, port) apuntan al PostgreSQL publicado en TCP.
DB_URL() { echo "postgres://$1@/$DBNAME?host=$PGHOST_E2E&port=$PGPORT_E2E&sslmode=disable"; }

# `psql` local si existe; si no (sandbox), el que trae el contenedor de desarrollo vía podman/docker.
PG_IN_CONTAINER=0
if command -v psql >/dev/null 2>&1; then
	:
else
	ENGINE=""
	if command -v podman >/dev/null 2>&1; then ENGINE=podman
	elif command -v docker >/dev/null 2>&1; then ENGINE=docker
	fi
	if [ -n "$ENGINE" ] && "$ENGINE" ps --format '{{.Names}}' 2>/dev/null | grep -qx "$PG_CONTAINER"; then
		PG_IN_CONTAINER=1
	else
		echo "Hace falta el binario psql o un contenedor PostgreSQL de desarrollo ($PG_CONTAINER)." >&2
		exit 1
	fi
	PG_ENGINE="$ENGINE"
fi
export PGPASSWORD="$PGSUPER_PW"

# psqlsuper <dbname> [args…]: administrador. En el contenedor se usa el socket local (sin host/port).
psqlsuper() {
	local db="${1:-postgres}"; shift || true
	if [ "$PG_IN_CONTAINER" = 1 ]; then
		"$PG_ENGINE" exec -i "$PG_CONTAINER" psql -U "$PGSUPER" -d "$db" -v ON_ERROR_STOP=1 -q "$@"
	else
		psql "host=$PGHOST_E2E port=$PGPORT_E2E user=$PGSUPER dbname=$db" -v ON_ERROR_STOP=1 -q "$@"
	fi
}

psqlsuper postgres -c "DROP DATABASE IF EXISTS $DBNAME WITH (FORCE)"
psqlsuper postgres -c "CREATE DATABASE $DBNAME"
# db-roles.sql se lee por stdin (`-f -`) para que sirva tanto con psql local como dentro del contenedor.
psqlsuper "$DBNAME" -v dbname=$DBNAME -v owner_pw=o -v api_pw=a -v purge_pw=p -v backup_pw=b -f - \
	< "$API_DIR/deploy/db-roles.sql"

( cd "$API_DIR" && go build -o "$ROOT/e2e-http/.api" ./cmd/api && go build -o "$ROOT/e2e-http/.migrate" ./cmd/migrate )
MIGRATE_DATABASE_URL="$(DB_URL apunte_owner:o)" "$ROOT/e2e-http/.migrate" up >> "$LOG" 2>&1

export APP_ENV=dev PORT=18080 LOG_LEVEL=info TRUST_PROXY=false
export WEB_BASE_URL=http://localhost:4174 ALLOWED_ORIGINS=http://localhost:4174
export DATABASE_URL="$(DB_URL apunte_api:a)"
export JWT_SECRET="e2e-jwt-secret-0123456789abcdef0123456789abcdef"
export PEPPER="e2e-pepper-0123456789abcdef0123456789abcdef-xyz"
export MAIL_PROVIDER=log MAIL_FROM="AxoNote E2E <no-reply@localhost>"
# Google simulado (solo dev): el bloque de pruebas usa el código `fk.…` que no sale a internet.
export GOOGLE_PROVIDER=fake
export GOOGLE_REDIRECT_URL="http://localhost:$PORT/v1/auth/google/callback"
exec "$ROOT/e2e-http/.api" >> "$LOG" 2>&1
