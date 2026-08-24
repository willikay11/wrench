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

# Set here rather than inherited: the container runs as the unprivileged
# `kong` user, and /kong/declarative is root-owned because the template is
# COPYed in as root. An inherited KONG_DECLARATIVE_CONFIG pointing there — a
# leftover Railway service variable, say — makes the render below fail with
# "Permission denied". Deciding the path in the entrypoint makes that
# impossible regardless of what the environment says.
KONG_DECLARATIVE_CONFIG=/tmp/kong.yaml
export KONG_DECLARATIVE_CONFIG

# Named explicitly so envsubst leaves every other $ in the file alone.
envsubst '${WRENCH_API_URL} ${REDIS_HOST} ${REDIS_PORT} ${REDIS_PASSWORD}' \
  < /kong/declarative/kong.yaml.template \
  > "${KONG_DECLARATIVE_CONFIG}"

# Validate at boot rather than at image build, where the variables do not
# exist yet. A bad config fails here with a readable error instead of a
# crash loop.
kong config parse "${KONG_DECLARATIVE_CONFIG}"

# Railway assigns the port at runtime, and its private network — which is
# where healthchecks arrive — is IPv6-only. Binding 0.0.0.0 alone leaves Kong
# unreachable there and the deploy fails on "Healthcheck failure" even though
# Kong started correctly.
export KONG_PROXY_LISTEN="0.0.0.0:${PORT:-8000}, [::]:${PORT:-8000}"

exec kong start
