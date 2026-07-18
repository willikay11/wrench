# Wrench

Wrench is an AI-powered project car assistant and build planner.
It helps enthusiasts manage a digital garage, track modifications
and service history, plan staged builds, and get car-specific AI
guidance grounded in their own vehicle data.

This repository is design-first: the docs capture architecture,
requirements, ADRs, reliability strategy, and operational runbooks
for implementation and scaling.

## What The Product Does

- Manages garage data: cars, modifications, service records, and budgets.
- Supports staged build planning with tasks and cost tracking.
- Provides an AI assistant with RAG so responses use each user car's real history.
- Handles inspiration image uploads for AI-assisted build planning.
- Keeps core CRUD workflows available even when AI providers degrade.

Primary source: [docs/requirements.md](docs/requirements.md)

## Architecture At A Glance

The target architecture described in the docs is:

- Web frontend behind CDN.
- Go API monolith behind Kong API Gateway.
- PostgreSQL + pgvector with one primary and two read replicas.
- Redis for cache and per-user AI rate limiting.
- Cloudinary for media.
- Anthropic Claude as primary AI provider with OpenAI fallback.
- OpenTelemetry + Grafana stack for logs, metrics, and traces.

Primary source: [docs/system-design.md](docs/system-design.md)

## Reliability, Security, And Ops

- Failure-mode runbooks for database, cache, API pods, gateway, and AI vendors.
- Defined SLOs, alerting strategy, and error-budget policy.
- Security design covering auth, threat model, network controls, and rate limiting.
- Capacity planning from launch assumptions to larger-scale growth.

Start here:

- [docs/failure-modes.md](docs/failure-modes.md)
- [docs/slos.md](docs/slos.md)
- [docs/dashboards-and-alerts.md](docs/dashboards-and-alerts.md)
- [docs/security/security-design.md](docs/security/security-design.md)
- [docs/capacity-estimation.md](docs/capacity-estimation.md)

## Documentation Map

- System overview: [docs/system-design.md](docs/system-design.md)
- Product and technical requirements: [docs/requirements.md](docs/requirements.md)
- Database operations and replication: [docs/database-design.md](docs/database-design.md)
- Schema details: [docs/schema.md](docs/schema.md)
- Caching and rate-limiting behavior: [docs/caching-strategy.md](docs/caching-strategy.md)
- Load balancing and traffic routing: [docs/load-balancer-design.md](docs/load-balancer-design.md)
- Observability architecture: [docs/observability-design.md](docs/observability-design.md)
- OpenAPI contract: [docs/api/openapi.yaml](docs/api/openapi.yaml)
- ADRs: [docs/adr](docs/adr)

## Suggested Reading Order

1. [docs/system-design.md](docs/system-design.md)
2. [docs/requirements.md](docs/requirements.md)
3. [docs/schema.md](docs/schema.md)
4. [docs/failure-modes.md](docs/failure-modes.md)
5. [docs/adr](docs/adr)

## Current Repository Layout

- [docs](docs): System design and decision records.
- [apps/web](apps/web): Frontend built using Next JS.
- [apps/api](apps/api): Backend service API built using GO Chi.
- [apps/infra](apps/infra): Declarative config for railway, kong...
- [packages](packages): Shared types & packages

## Project Status

Wrench has a comprehensive architecture and operations blueprint in place,
including explicit failure handling and recovery targets. Use the docs as
the source of truth when implementing or evolving services in this repository.
