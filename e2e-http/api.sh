#!/usr/bin/env bash
# Levanta la API real (Go + PostgreSQL) para las pruebas e2e contra el servidor de verdad.
#
#   API_DIR            carpeta del repo notify_backend (por defecto ../notify_backend)
#   E2E_PG_HOST/PORT/USER  PostgreSQL de pruebas con un usuario administrador
#                      (por defecto el socket /tmp/pg:5433, como en el entorno de desarrollo)
#
# Crea una base nueva (apunte_e2e) con los roles reales (la API corre SIN privilegios, sujeta a RLS),
# aplica las migraciones y arranca la API en :18080 con el correo en el registro (los códigos se leen de ahí).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
API_DIR="$(cd "${API_DIR:-../notify_backend}" && pwd)"
PGHOST_E2E="${E2E_PG_HOST:-/tmp/pg}"; PGPORT_E2E="${E2E_PG_PORT:-5433}"; PGSUPER="${E2E_PG_USER:-postgres}"
DBNAME=apunte_e2e
LOG="$ROOT/e2e-http/.api.log"
: > "$LOG"
# URL de conexión (socket Unix o host) para un usuario/contraseña dados
DB_URL() { echo "postgres://$1@/$DBNAME?host=$PGHOST_E2E&port=$PGPORT_E2E&sslmode=disable"; }
psqlsuper() { psql "host=$PGHOST_E2E port=$PGPORT_E2E user=$PGSUPER dbname=${1:-postgres}" -v ON_ERROR_STOP=1 -q "${@:2}"; }

psqlsuper postgres -c "DROP DATABASE IF EXISTS $DBNAME WITH (FORCE)"
psqlsuper postgres -c "CREATE DATABASE $DBNAME"
psqlsuper "$DBNAME" -v dbname=$DBNAME -v owner_pw=o -v api_pw=a -v purge_pw=p -v backup_pw=b -f "$API_DIR/deploy/db-roles.sql"

( cd "$API_DIR" && go build -o "$ROOT/e2e-http/.api" ./cmd/api && go build -o "$ROOT/e2e-http/.migrate" ./cmd/migrate )
MIGRATE_DATABASE_URL="$(DB_URL apunte_owner:o)" "$ROOT/e2e-http/.migrate" up >> "$LOG" 2>&1

export APP_ENV=dev PORT=18080 LOG_LEVEL=info TRUST_PROXY=false
export WEB_BASE_URL=http://localhost:4174 ALLOWED_ORIGINS=http://localhost:4174
export DATABASE_URL="$(DB_URL apunte_api:a)"
export JWT_SECRET="e2e-jwt-secret-0123456789abcdef0123456789abcdef"
export PEPPER="e2e-pepper-0123456789abcdef0123456789abcdef-xyz"
export MAIL_PROVIDER=log MAIL_FROM="AxoNote E2E <no-reply@localhost>"
exec "$ROOT/e2e-http/.api" >> "$LOG" 2>&1
