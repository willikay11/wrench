# Wrench — System Design Document

## Status
Living document — updated as architecture evolves

## Last updated
2026-06-22

---

## 1. Executive Summary

Wrench is an AI-powered project car assistant and
build planner. It allows users to manage a digital
garage — tracking cars, modifications, service
history, build plans, and budgets — and provides
an AI assistant that gives car-specific advice by
retrieving each car's actual history through a
Retrieval-Augmented Generation (RAG) pipeline,
rather than generic automotive knowledge alone.

**Target scale at launch:** 10,000 registered users,
500 concurrent users at peak, 20,000 realistic daily
AI requests (10% daily active assumption — see
capacity-estimation.md for full reasoning and the
theoretical ceiling used for infrastructure sizing).

**Architecture in one sentence:** A well-structured
Go monolith behind Kong API Gateway, backed by
PostgreSQL with pgvector for both relational data
and AI embeddings, Redis for caching and rate
limiting, Cloudinary for media, and Claude (with
OpenAI as automatic fallback) for AI generation —
all instrumented with OpenTelemetry from day one.

**Why this document exists:** This is the single
source of truth tying together every design decision
made during Wrench's Month 1 design phase. Each
section below links to the detailed document or ADR
where that decision is fully reasoned and defended.
No code was written during Month 1 — every decision
here was made deliberately before implementation
began.

---

## 2. Requirements

Full detail: [requirements.md](./requirements.md)

**Functional requirements (32 total):** Authentication
(including Google OAuth, password reset), garage
management (cars, modifications, service records),
build planner (stages, tasks, cost tracking, garage
tools), AI assistant (car-aware chat with RAG,
tool-aware advice, build plan generation from
inspiration images), and media uploads.

**Non-functional requirements (29 total) across six
categories:** Performance (NFR-01 to NFR-05),
Availability (NFR-06 to NFR-08), Scalability
(NFR-09 to NFR-11), Security (NFR-12 to NFR-17,
NFR-25), Data (NFR-18 to NFR-21), Observability
(NFR-22 to NFR-24), and Compliance (NFR-28, NFR-29).

Every functional and non-functional requirement
is identified by ID (FR-XX, NFR-XX) and referenced
directly in the ADRs and API specification below,
so every architectural decision can be traced back
to the requirement that justified it.

---

## 3. Capacity Estimates

Full detail: [capacity-estimation.md](./capacity-estimation.md)

```
                          10K users   100K users   1M users
─────────────────────────────────────────────────────────
Concurrent users (5%)        500         5,000       50,000
Total cars                20,000      200,000    2,000,000
Total embeddings            1.3M         13M          130M
AI requests/sec (peak)       2.3         23           230
─────────────────────────────────────────────────────────
Total storage              ~410 GB      ~4.1 TB       ~41 TB
Claude API/month (realistic) ~$6,030   ~$60,300    ~$603,000
```

These numbers drive three of the most significant
architectural decisions in this document: the
read replica strategy (Section 5), the pgvector
vs dedicated vector database decision (ADR-002),
and the AI endpoint rate limiting design (Section 7).

---

## 4. Architecture Overview

Full diagram: [wrench-system-architecture-v4.png](./architecture/wrench-system-architecture-v4.png)

```
User
  ↓ HTTPS — wrench.ai
CDN ←→ Web Frontend (Next.js, Vercel)
  ↓ HTTPS — api.wrench.ai
DNS / Cloud L4 Load Balancer
  ↓
Kong API Gateway (2-node cluster, active/active)
  SSL Termination · Load Balancing · Rate Limiting
  Channel Auth · CORS Enforcement · Request Logging
  ↓ HTTP (private network)
┌─────────────────────────────────────┐
│  AZ-1 (10.0.1.0/24)  AZ-2 (10.0.2.0/24) │
│  Go API Pods × 3      Go API Pods × 3   │
│  (Monolith — see ADR-009)               │
└──────────────┬───────────────────────┘
               │
   ┌───────────┼────────────┬─────────────┐
   ↓           ↓            ↓             ↓
Postgres    Redis        Cloudinary   Grafana Cloud
Primary +   Cache        (S3-backed)  (OTel traces,
2 Replicas  (rate limit,              metrics, logs)
(pgvector)   cache)
   │
   ↓ HTTPS
┌─────────────────────────────┐
│  Embeddings API (OpenAI)     │
│  AI Models:                  │
│   Primary: Anthropic Claude  │
│   Fallback: OpenAI            │
└─────────────────────────────┘
```

**RAG query flow (the core AI mechanic):**
```
1. User question → Go API
2. Go API → Embeddings API (embed the question)
3. Go API → Read Replica/pgvector
   (similarity search across car profile, car
    knowledge, mods, service records, build notes,
    and garage tools — car profile is always
    included in retrieved context regardless of
    similarity score)
4. Go API → Claude API (with retrieved context)
5. Claude response → SSE stream → Frontend
```

Every component in this diagram, every protocol
label, and every routing decision is the result of
a specific ADR below — nothing here was assumed by
default.

---

## 5. API Design

Full contract: [openapi.yaml](./api/openapi.yaml)
Decision record: [ADR-001](./adr/001-rest-vs-graphql-vs-grpc.md)

**Protocol:** REST over HTTPS, documented as
OpenAPI 3.0. SSE used for AI response streaming.
Standard multipart/form-data for file uploads.

**Resource groups:** Authentication, User Profile,
Cars, Modifications, Service Records, Build Planner
(Stages + Tasks), Budget, Garage Tools, AI Assistant
(Chat + Conversations), Uploads.

**Design conventions applied consistently across
every endpoint:**
- Cursor-based pagination (not offset) — stable
  under inserts, no `COUNT(*)` query required at scale
- RFC 7807 Problem Details for all error responses,
  with a stable `type` URI for machine-readable
  error handling
- 404 (not 403) returned when a resource exists
  but belongs to another user — prevents IDOR
  enumeration
- PATCH (not PUT) for all updates — partial updates
  only, preventing accidental field wipes
- Derived fields (`costFormatted`, `percentComplete`)
  calculated server-side and included in responses —
  enforces DRY across web, iOS, and Android clients
- `source` and `confirmed` fields on AI-generated
  records (mods, build stages, tasks) — distinguishes
  user-entered data from AI-generated suggestions
  pending user review (FR-33)

---

## 6. Database Design

Full schema: [schema.md](./schema.md)
Decision records: [ADR-002](./adr/002-pgvector-vs-dedicated-vector-db.md),
[ADR-004](./adr/004-read-replica-routing.md)

**Engine:** PostgreSQL with pgvector extension.
One primary, two read replicas (Neon).

**Why pgvector over a dedicated vector database:**
Operational simplicity and transactional consistency
between application data and AI embeddings outweigh
the marginal performance advantage of a dedicated
vector store at Wrench's projected scale (under
5 million vectors through approximately 40-50K
users). Full reasoning and migration trigger in
ADR-002.

**Read/write routing:** Writes always go to the
primary. Reads split based on consistency
requirements — auth and financial reads use the
primary (strong consistency required), RAG vector
searches and analytics use replicas (200ms lag
acceptable). Full routing table in ADR-004.

**Notable schema decisions:** UUID primary keys
(prevents resource enumeration), money stored as
BIGINT cents (avoids floating point errors), CHECK
constraints instead of native ENUMs (simpler
migrations), a dedicated `embeddings` table rather
than inline vector columns (supports multiple
embeddings per source record), and `garageTools`
scoped to `userId` rather than `carId` (tools are
reusable across a user's vehicles).

---

## 7. Scalability & Caching

Full detail: [scalability-design.md](./scalability-design.md),
[caching-strategy.md](./caching-strategy.md)
Decision record: [ADR-003](./adr/003-redis-caching.md)

**Horizontal scaling:** The Go API is fully stateless
— all state lives in Postgres and Redis. Multiple
identical pods run across AZ-1 and AZ-2, scaled
independently of any single deployment event.

**Why Redis over an in-process cache:** Rate limiting
correctness requires a shared counter visible to
every pod simultaneously. An in-process cache is
isolated per pod, making per-user rate limits
trivially bypassable by load-balanced traffic
hitting different pods. Full reasoning in ADR-003.

**What is cached:** Car profiles (5 min TTL),
user car lists (2 min TTL), embedding vectors
(24 hour TTL — expensive to regenerate). What is
never cached: AI responses, auth tokens, budget
totals (handled instead via the `budgetTotals`
materialised view on the primary, see schema.md).

**Rate limiting:** Two layers — Kong enforces
coarse per-IP limits at the perimeter (1000 req/hour),
the Go API + Redis enforces precise per-user limits
on the AI endpoint specifically (20 req/hour,
NFR-15) using atomic Redis `INCR` operations.

---

## 8. Security

Full detail: [security/](./security/) directory —
threat-model.md, auth-design.md, network-security.md,
security-design.md, rate-limiting-design.md
Decision records: [ADR-005](./adr/005-jwt-vs-session-auth.md),
[ADR-008](./adr/008-kong-api-gateway.md)

**Authentication:** JWT access tokens (15 min expiry,
stateless validation) with refresh token rotation
(7 day expiry, stored as bcrypt hash, reuse detection
revokes the entire token family on theft). Full
reasoning in ADR-005.

**Authorization:** Every resource ownership check
validated server-side on every request. Resources
return 404 rather than 403 when they exist but
belong to another user, preventing IDOR-style
enumeration attacks.

**Perimeter security:** Kong API Gateway handles
SSL termination, channel token validation, CORS
enforcement, and coarse rate limiting before any
request reaches the Go API. Full reasoning in
ADR-008.

**Threat model:** STRIDE framework applied across
the full system — see threat-model.md for the
complete analysis of spoofing, tampering,
repudiation, information disclosure, denial of
service, and elevation of privilege risks and
their mitigations.

**Top accepted risks (documented, not overlooked):**
- Access tokens cannot be immediately revoked
  before their 15-minute expiry (fundamental JWT
  limitation, mitigated by short expiry window)
- The Kong channel token can be extracted from the
  frontend bundle by a determined attacker (mitigated
  by CORS as a second layer; true security comes
  from per-user JWT validation, not the channel
  token)

---

## 9. Observability & SLOs

Full detail: [observability-design.md](./observability-design.md),
[dashboards-and-alerts.md](./dashboards-and-alerts.md),
[slos.md](./slos.md)
Decision record: [ADR-006](./adr/006-opentelemetry-observability.md)

**Stack:** OpenTelemetry for distributed tracing
and metrics, zerolog for structured logging, Grafana
Cloud (Tempo + Mimir + Loki) as the backend. Chosen
for vendor neutrality — instrumentation never needs
to change if the backend changes — and zero cost
at launch scale within the free tier. Full reasoning
in ADR-006.

**Every request is traceable end-to-end:** Kong →
Go API → Postgres → Redis → pgvector → Claude API,
correlated by a single trace_id that also appears
in every structured log line for that request.

**SLOs:**
```
CRUD API availability:   99.5% (30-day window)
CRUD API latency:        99% < 500ms
AI assistant latency:    95% < 10s
AI assistant availability: 99%
```

**Critical metric:** `wrench_claude_api_cost_usd_total`
— tracked as a first-class metric from day one,
since the AI chat endpoint is the single most
expensive operation in the system by approximately
100x relative to standard CRUD (see
capacity-estimation.md, Section 4).

---

## 10. Resilience & Failure Modes

Full detail: [failure-modes.md](./failure-modes.md)

Every external dependency has a documented failure
behaviour:

```
Dependency       Slow                 Down
─────────────────────────────────────────────────
Postgres primary  5s timeout, 503     Writes fail 503,
                                      reads fall back
                                      to replica
Postgres replica  Fall back to        Fall back to
                  primary             primary
Redis             100ms timeout,      Disable caching,
                  fall back to DB     serve from DB
                                      (rate limiting
                                      degrades to
                                      per-pod —
                                      accepted risk)
Claude API        15s first-token     Circuit breaker
                  timeout, abort      opens after 5
                                      failures, falls
                                      back to OpenAI
Embeddings API    —                   Queue job for
                                      async retry
```

**Rule applied throughout:** Redis failure must
never cause API failure. The AI provider being down
must never prevent core garage management and build
planning features from working (NFR-08).

---

## 11. Architecture Decision Records

All decisions below were defended under direct
follow-up questioning before being finalised —
not generated and accepted without scrutiny.

| ADR | Decision | Summary |
|-----|----------|---------|
| [001](./adr/001-rest-vs-graphql-vs-grpc.md) | REST vs GraphQL vs gRPC | REST for the external API — browser-native, SSE-compatible, simplest fit for the data model. gRPC reserved as the likely choice for future internal service-to-service calls if ADR-009's extraction trigger fires. |
| [002](./adr/002-pgvector-vs-dedicated-vector-db.md) | pgvector vs dedicated vector DB | pgvector in the same Postgres instance — transactional consistency with application data, zero additional infrastructure, sufficient performance to ~40-50K users. |
| [003](./adr/003-redis-caching.md) | Redis vs in-process cache | Redis — required for correct multi-pod rate limiting and cache invalidation; an in-process cache cannot guarantee correctness across multiple stateless pods. |
| [004](./adr/004-read-replica-routing.md) | Read replica routing | Writes to primary always. Reads split by consistency requirement — auth/financial reads to primary, RAG/analytics reads to replicas. |
| [005](./adr/005-jwt-vs-session-auth.md) | JWT vs session-based auth | JWT access tokens (stateless, 15 min) + refresh token rotation (stateful, revocable, 7 days) — avoids Redis as a hard dependency for authentication itself. |
| [006](./adr/006-opentelemetry-observability.md) | OpenTelemetry vs custom | OpenTelemetry + Grafana Cloud — vendor-neutral instrumentation, full distributed tracing, zero cost at launch scale. |
| [007](./adr/007-cloudinary-vs-s3-cloudfront.md) | Cloudinary vs S3 + CloudFront | Cloudinary — single SDK for upload, storage, CDN, and on-the-fly image transformation, eliminating the need for a separate transformation pipeline. |
| [008](./adr/008-kong-api-gateway.md) | Kong API Gateway | Kong (2-node active/active) — perimeter concerns (SSL, CORS, channel auth, coarse rate limiting) centralised and rejected before reaching the Go API. |
| [009](./adr/009-monolith-vs-microservices.md) | Monolith vs microservices | Well-structured monolith with compiler-enforced internal package boundaries — no validated service boundaries exist yet; structure preserves the option to extract services (most likely candidate: the AI/RAG package) without requiring a rewrite. |

---

## 12. What Was Deliberately Not Built Yet

Documenting what was consciously deferred is as
important as documenting what was decided, so
future engineers understand these are informed
omissions, not oversights:

- **Microservices** — no validated boundaries exist;
  see ADR-009's migration trigger
- **A second database read replica** — current
  capacity estimates support a single replica
  comfortably through 10K users; second replica
  trigger documented in ADR-004
- **Dedicated vector database** — pgvector trigger
  is approximately 4M embeddings or 80ms p95 search
  latency, neither of which is expected before
  ~40-50K users; see ADR-002
- **Token blocklist for immediate JWT revocation** —
  accepted risk at current threat model; would
  introduce Redis as a hard auth dependency, the
  exact problem JWT was chosen to avoid; see ADR-005
- **Backend-for-Frontend pattern for the Kong
  channel token** — current channel token + CORS
  layering is accepted as sufficient; BFF migration
  trigger documented in ADR-008

---

## Autoscaling trigger

Wrench's AI chat endpoint holds SSE connections
open for 8-10 seconds per request. Go goroutines
park during this wait, consuming near-zero CPU,
but the open connections accumulate in memory and
against OS file descriptor limits. CPU-based
autoscaling therefore underestimates load from
sustained AI traffic.

Scale out when ANY of the following conditions
are met for more than 2 minutes:
- Pod memory utilisation > 70% of limit
- Concurrent active connections > 400 per pod
- p95 API latency > 500ms (symptom-based trigger)

Metric names (Grafana):
- container_memory_usage_bytes
- wrench_http_active_connections (custom OTel gauge)
- histogram_quantile(0.95, wrench_http_request_duration_seconds)

---

## Graceful shutdown + connection draining

Rolling deployments achieve zero downtime through
coordination between the pod and Kong:

Pod side (graceful shutdown):
1. SIGTERM received → health check returns 503
2. Shutdown() called → idle keep-alive connections
   closed immediately, active requests continue
3. 30s timeout → force kill any remaining goroutines
4. Clean exit → DB connections closed, logs flushed

Kong side (connection draining):
1. Passive health check detects 503 on real traffic
   → Pod ejected from upstream pool immediately
2. Active health check (every 3s) as safety net
3. Failed requests retried once on a healthy pod
   (retries: 1, retry_on_status: [503])
4. Keep-alive connections to ejected pod abandoned

User experience: zero visible errors, at most
a few milliseconds additional latency on
requests that hit the transition window.

---

## References

- Requirements: [requirements.md](./requirements.md)
- Capacity estimates: [capacity-estimation.md](./capacity-estimation.md)
- Database schema: [schema.md](./schema.md)
- API contract: [openapi.yaml](./api/openapi.yaml)
- All ADRs: [/adr](./adr/)
- Security documents: [/security](./security/)