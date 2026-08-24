#!/bin/sh
# Renders kong.yaml from its template, validates it, then starts Kong.
#
# Kong has no ${VAR} expansion in declarative config, and the fields we need to
# vary per environment (service url, redis host) are not vault-referenceable
# either — so the substitution has to happen before Kong reads the file.
set -eu

: "${WRENCH_API_URL:?WRENCH_API_URL must be set, e.g. http://api.railway.internal:8080}"
: "${REDIS_HOST:?REDIS_HOST must be a hostname only, e.g. redis.railway.internal (not a redis:// URL)}"
: "${REDIS_PASSWORD:?REDIS_PASSWORD must be set}"
: "${REDIS_PORT:=6379}"
export REDIS_PORT

# Named explicitly so envsubst leaves every other $ in the file alone.
envsubst '${WRENCH_API_URL} ${REDIS_HOST} ${REDIS_PORT} ${REDIS_PASSWORD}' \
  < /kong/declarative/kong.yaml.template \
  > "${KONG_DECLARATIVE_CONFIG}"

# Validate at boot rather than at image build, where the variables do not
# exist yet. A bad config fails here with a readable error instead of a
# crash loop.
kong config parse "${KONG_DECLARATIVE_CONFIG}"

# Railway assigns the port at runtime.
export KONG_PROXY_LISTEN="0.0.0.0:${PORT:-8000}"

exec kong start
