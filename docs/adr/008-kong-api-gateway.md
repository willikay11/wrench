# ADR-008: API Gateway — Kong

## Status
Accepted

## Date
2026-06-22

## Context
Wrench requires a layer between the public internet
and the Go API that handles cross-cutting concerns
before requests reach application code:

- SSL/TLS termination (HTTPS in, HTTP out internally)
- Load balancing across Go API pods in AZ-1 and AZ-2
- Rate limiting (coarse-grained, perimeter level)
- Channel authorization — verifying requests
  originate from the Wrench frontend, not an
  arbitrary third party
- CORS enforcement
- Request/response logging at the perimeter

A standalone load balancer alone (e.g. a basic
AWS ALB or Nginx) would handle SSL termination
and load balancing, but channel authorization,
perimeter rate limiting, and CORS enforcement
would need to be implemented as custom middleware
in the Go API itself, duplicating logic that an
API gateway provides out of the box.

## Decision
Use **Kong API Gateway** deployed as a 2-node
cluster in active/active configuration, positioned
between Kong DNS resolution and the Go API
application tier.

### Architecture position
```
User
  ↓ HTTPS — api.wrench.ai (DNS resolution)
DNS / Cloud L4 Load Balancer
  ↓ distributes connections across Kong nodes
  ↓ (simple TCP-level distribution — no HTTP
  ↓  inspection, no plugin logic; Kong nodes
  ↓  are identical and stateless, so any node
  ↓  can serve any request)
Kong API Gateway (2-node cluster, active/active)
  ├── SSL Termination
  ├── Load Balancing (L7, least-connections,
  │   with active health checks against Go API pods)
  ├── Rate Limiting (coarse-grained, per-IP and per-route)
  ├── Channel Auth (X-Channel-Token validation)
  ├── CORS Enforcement
  └── Request Logging
  ↓ HTTP (private network) — 10.0.1.0/24, 10.0.2.0/24
Go API pods (AZ-1, AZ-2)
```

Note the distinction between the two load balancing
layers in this diagram. The DNS/Cloud L4 layer in
front of Kong solves a simple problem — distribute
connections across two interchangeable, stateless
Kong nodes — and does not need to understand HTTP,
rate limiting, or auth to do so correctly. Kong's
own load balancing of the Go API tier is L7
(application-aware): it inspects each HTTP request,
applies perimeter plugins, and tracks the live
health of each Go API pod before routing. The
sophistication of load balancing decreases moving
toward the edge of the system, with each layer
using the simplest mechanism that correctly solves
its specific distribution problem.

### Responsibility split

Kong handles **perimeter concerns** — is this a
legitimate request reaching us at all:
- SSL termination
- Load balancing across healthy Go API pods
- Channel token validation (X-Channel-Token header)
- CORS policy enforcement (only allow
  https://wrench.ai origin)
- Coarse-grained rate limiting (per-IP, protects
  against basic abuse and DDoS-style traffic)
- Request/response logging at the edge

The Go API retains **identity and business concerns**
— is this a legitimate request from this specific
authenticated user, for this specific resource:
- JWT validation (user identity, see ADR-005)
- Ownership checks (does this user own this car?)
- Business-level rate limiting (per-user AI quotas
  in Redis, see ADR-003 — requires user identity
  which Kong does not have)
- Application logic and data validation

This split exists because Kong operates before
user identity is established. Kong can verify
"this request came from our frontend" but cannot
verify "this request came from user X" without
decoding and validating the JWT itself, which
would duplicate auth logic across two layers
and create two sources of truth for token validation.

### Channel authorization design
```
Every request from the Wrench frontend includes:
X-Channel-Token: {static channel token}

Kong validates this header before forwarding
any request to the Go API. Missing or invalid
token → Kong returns 401 directly, Go API never
receives the request.

This is a layered defence, not a complete one:
- Channel token lives in the Next.js application
  and is visible in browser DevTools to a
  determined attacker (accepted limitation,
  documented below)
- Combined with CORS enforcement (Origin header
  must be https://wrench.ai) as a second layer
- The channel token's purpose is to filter casual
  abuse and direct API probing, not to be a
  cryptographically unbreakable barrier
- True security against impersonation comes from
  per-user JWT validation in the Go API, which
  the channel token does not replace
```

### Rate limiting split
```
Kong (coarse, perimeter):
  per-IP: 1000 requests / hour across all endpoints
  Purpose: blunt instrument against basic abuse,
           scraping, or misconfigured clients
           hammering the API

Go API + Redis (fine-grained, identity-aware):
  per-user AI chat: 20 requests / hour (NFR-15)
  per-IP auth endpoints: 5 attempts / 15 min (NFR-16)
  Purpose: precise business rule enforcement that
           requires knowing WHO is making the request,
           which Kong does not know
```

Kong's rate limiting protects infrastructure.
The Go API's rate limiting protects business
rules and cost (Claude API spend).

## Reasoning

### Why an API gateway instead of a basic load balancer

A basic load balancer (raw AWS ALB, Nginx) provides
SSL termination and traffic distribution but
nothing else in the request flow above. Every
additional concern — channel auth, CORS, perimeter
rate limiting — would need to be implemented as
Go middleware, meaning:

- Every request pays the cost of TLS handshake,
  then travels all the way to application code,
  then gets rejected by middleware for failing
  a perimeter check that could have been rejected
  before reaching the Go process at all
- Kong rejecting invalid requests at the gateway
  means Go API compute resources are never spent
  processing requests that were never going to
  succeed
- Centralising these concerns in Kong means a
  single configuration change (e.g. updating the
  rate limit threshold) does not require a Go API
  deployment

### Why Kong specifically

**Plugin ecosystem matches Wrench's exact needs:**
Kong's rate limiting, CORS, and request
transformation plugins are configuration, not
custom code. Wrench's perimeter requirements
(documented above) map directly onto existing
Kong plugins rather than requiring custom
gateway logic to be written and maintained.

**Mature, widely adopted, well documented:**
Kong is used in production at significant scale
by companies with API-first products. Documentation,
community support, and operational knowledge are
abundant — important for a solo developer who
needs to move quickly without becoming an expert
in gateway internals.

**Open source core with managed hosting options:**
Kong's open source edition covers all of Wrench's
current requirements at zero licensing cost. If
Wrench later needs advanced features (Kong's
paid Enterprise tier — advanced analytics,
developer portal), a migration path exists
without re-architecting the gateway layer.

### Why a 2-node active/active cluster

A single Kong instance is a single point of
failure for the entire API — if Kong is down,
every Wrench request fails regardless of Go API
health.

Active/active across two nodes means:
- Either node can serve any request independently
- A node failure does not interrupt service —
  traffic continues flowing through the
  remaining node
- DNS or an upstream load balancer distributes
  traffic across both Kong nodes, similar to
  how Kong itself distributes traffic across
  Go API pods

This mirrors the same redundancy principle
applied to the Go API tier (AZ-1, AZ-2) and the
database tier (primary, replicas) — no single
component in the request path is a single point
of failure.

## Consequences

### Positive
- Perimeter security concerns (SSL, CORS, channel
  auth, coarse rate limiting) are centralised and
  configured declaratively, not scattered across
  Go middleware
- Invalid or abusive requests are rejected before
  consuming Go API compute resources
- Kong's load balancing replaces the need for a
  separate load balancer product
- 2-node active/active cluster eliminates Kong
  as a single point of failure
- Configuration changes to perimeter rules
  (rate limits, CORS policy) do not require a
  Go API deployment

### Negative — accepted trade-offs

**Additional infrastructure component:**
Kong itself must be deployed, monitored, and
kept healthy. This is additional operational
surface area beyond the Go API and database
tier. Mitigated by Kong's maturity and the
relatively low maintenance burden of a
gateway whose configuration changes infrequently
compared to application code.

**Channel token is not a strong security boundary:**
As documented above, the channel token can be
extracted from the Next.js frontend bundle by
a determined attacker. This is an accepted risk
at Wrench's current stage — the channel token's
purpose is to filter casual abuse and direct
API probing, not to prevent a sophisticated
attacker who has already decided to target Wrench
specifically. True security against
impersonation and unauthorized access comes
from JWT validation and per-user authorization
checks in the Go API, layers that remain
intact regardless of channel token exposure.

**Slight latency overhead:**
Kong adds approximately 1-2ms per request for
plugin execution (channel auth check, rate limit
check, CORS headers). This is acceptable within
the NFR-01 latency budget (CRUD endpoints
p95 < 200ms).

## Migration Trigger
This decision is expected to remain stable.
Kong's plugin ecosystem and open source licensing
model scale well beyond Wrench's projected growth.

Re-evaluate if:
1. Wrench requires advanced API monetization,
   developer portal, or analytics features only
   available in Kong Enterprise — evaluate cost
   of Enterprise licensing versus building
   equivalent features independently
2. Channel token security needs strengthening
   beyond the accepted risk documented above —
   evaluate migrating to a Backend-for-Frontend
   (BFF) pattern where the channel token lives
   server-side in Next.js and never reaches
   the browser, eliminating the exposure risk
   entirely

## Alternatives Rejected

**Basic load balancer (AWS ALB / Nginx) +
custom Go middleware:**
Would require implementing channel auth, CORS,
and perimeter rate limiting as Go middleware,
duplicating functionality Kong provides as
configuration. Every request pays full TLS and
network cost before being evaluated and
potentially rejected, rather than being rejected
at the gateway. Rejected in favour of centralising
perimeter concerns in a purpose-built gateway.

**AWS API Gateway:**
Fully managed alternative with similar
capabilities. Rejected due to tighter coupling
to AWS infrastructure (Wrench's deployment
target is Railway/Fly.io per the scalability
design, not raw AWS), and Kong's plugin
ecosystem provides equivalent functionality
with deployment flexibility across hosting
providers.

**Envoy Proxy:**
Powerful, widely used at large scale (originated
at Lyft, used extensively in service mesh
architectures). Rejected as over-engineered for
Wrench's current needs — Envoy's primary strength
is service-to-service communication in complex
microservice topologies. Wrench is a monolith
at this stage (see ADR-009); Envoy's capabilities
would be substantially underutilized relative to
its configuration complexity (typically managed
via xDS APIs or a control plane such as Istio).

## References
- Scalability design: /docs/scalability-design.md
- Security design: /docs/security/security-design.md
- Rate limiting design: /docs/rate-limiting-design.md
- Requirements: NFR-12, NFR-15, NFR-16
- Related ADRs: ADR-003 (Redis rate limiting),
  ADR-005 (JWT auth), ADR-009 (monolith vs microservices)