#!/usr/bin/env sh
#
# Thin wrapper around golang-migrate, so migrations are always run with the
# right path and against the same database the API itself reads.
#
# Run it through the root package.json rather than directly:
#
#   pnpm migrate:up                 apply everything pending
#   pnpm migrate:down               roll back the most recent migration
#   pnpm migrate:status             print the current version
#   pnpm migrate:create add_users   scaffold a new up/down pair
#   pnpm migrate:force 4            clear a dirty state, see below

set -eu

API_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
MIGRATIONS_DIR="$API_DIR/migrations"
ENV_FILE="$API_DIR/.env"

if ! command -v migrate >/dev/null 2>&1; then
    echo "golang-migrate is not installed. Install it with:" >&2
    echo "" >&2
    echo "  go install -tags postgres github.com/golang-migrate/migrate/v4/cmd/migrate@latest" >&2
    echo "" >&2
    echo "then make sure \$(go env GOPATH)/bin is on your PATH." >&2
    exit 1
fi

# Prefer an already-exported DATABASE_URL (CI, or a one-off against another
# database) and fall back to apps/api/.env — the same file cmd/api reads, so
# the schema can never drift from the database the app is actually using.
#
# Read out rather than sourced. `. .env` runs the file as shell: a connection
# string ending in `?sslmode=require&pgbouncer=true` backgrounds itself at the
# `&` and silently arrives empty, and FROM_EMAIL's angle brackets parse as a
# redirect. Neither is worth debugging twice.
if [ -z "${DATABASE_URL:-}" ]; then
    if [ ! -f "$ENV_FILE" ]; then
        echo "DATABASE_URL is not set, and there is no $ENV_FILE to read it from." >&2
        exit 1
    fi

    DATABASE_URL=$(sed -n 's/^[[:space:]]*\(export[[:space:]][[:space:]]*\)\{0,1\}DATABASE_URL=//p' "$ENV_FILE" | tail -n 1 | tr -d '\r')

    # Tolerate a quoted value, since .env files are written both ways.
    case "$DATABASE_URL" in
        '"'*'"') DATABASE_URL=${DATABASE_URL#'"'}; DATABASE_URL=${DATABASE_URL%'"'} ;;
        "'"*"'") DATABASE_URL=${DATABASE_URL#"'"}; DATABASE_URL=${DATABASE_URL%"'"} ;;
    esac

    export DATABASE_URL
fi

if [ -z "${DATABASE_URL:-}" ]; then
    echo "DATABASE_URL is empty. Set it in $ENV_FILE." >&2
    exit 1
fi

command=${1:-up}
if [ $# -gt 0 ]; then shift; fi

if [ "$command" = "create" ]; then
    name=${1:-}

    if [ -z "$name" ]; then
        echo "Usage: pnpm migrate:create <name>   e.g. pnpm migrate:create create_users" >&2
        exit 1
    fi

    migrate create -ext sql -dir "$MIGRATIONS_DIR" -seq "$name"
    exit 0
fi

# Say which database, with the credentials stripped. DATABASE_URL may well
# point at staging, and "up" is not something you want to discover afterwards.
echo "→ $command on $(printf '%s' "$DATABASE_URL" | sed -E 's#(://)[^@/]*@#\1#')"

migrate -path "$MIGRATIONS_DIR" -database "$DATABASE_URL" "$command" "$@"
