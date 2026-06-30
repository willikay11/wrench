# ADR-003: Caching Layer — Redis vs In-Process Memory Cache

## Status
Accepted

## Date
2026-06-22

## Context
Wrench requires a caching layer to serve two distinct
purposes:

**Purpose 1 — Application data caching:**
Reduce database load and improve response times for
frequently read, rarely changed data. The primary
candidates are car profiles (car details with recent
mods and service records) and user car lists, both
of which are read on every page load but change
only when the user adds or modifies data.

**Purpose 2 — Rate limiting:**
Enforce per-user request limits on the AI chat
endpoint (20 requests per hour, NFR-15) and per-IP
limits on authentication endpoints (5 attempts per
15 minutes, NFR-16). Rate limiting requires a
shared counter that is consistent across all API
instances.

Two options were evaluated:
1. Redis (external shared cache)
2. In-process memory cache (Go sync.Map or similar)

The Go API is deployed as multiple instances across
two availability zones (AZ-1: 10.0.1.0/24,
AZ-2: 10.0.2.0/24) behind the Kong API Gateway.
Any caching solution must function correctly in
this multi-instance environment.

## Decision
Use **Redis** as a shared external cache for both
application data caching and rate limiting.

### Cache key design

**Car profile cache:**
```
key:   car:{carId}:profile
value: JSON-serialised CarDetail response
TTL:   5 minutes
invalidation: on any write to cars, carMods,
              or carService for this carId
```

**User car list cache:**
```
key:   user:{userId}:cars
value: JSON-serialised CarSummary array
TTL:   2 minutes
invalidation: on any car created or deleted
              for this userId
```

**Embedding vector cache:**
```
key:   embedding:{sourceType}:{sourceId}
value: JSON-serialised float32 array (1536 dims)
TTL:   24 hours
reason: embeddings are expensive to regenerate
        and rarely change after creation
```

**Rate limit counters:**
```
key:    ratelimit:{userId}:chat
value:  integer counter
TTL:    1 hour (sliding window)
algo:   token bucket implemented in Redis
        using atomic INCR + EXPIRE commands

key:    ratelimit:{ip}:auth
value:  integer counter
TTL:    15 minutes
```

### Cache invalidation strategy
Cache invalidation follows the cache-aside pattern:

1. Read: check Redis first. On hit, return cached
   value. On miss, query Postgres and populate cache.
2. Write: write to Postgres first. On success,
   delete the relevant cache keys. Next read
   repopulates from the updated DB record.

Invalidation on write (delete then repopulate)
is used instead of update-on-write to avoid
race conditions between concurrent writes.

### What is deliberately NOT cached
- AI chat responses: must always reflect the
  latest car context. Caching would return stale
  AI answers after new mods or service records
  are added.
- Auth tokens: the refresh token table in Postgres
  is the source of truth. Caching tokens risks
  serving revoked tokens after logout or rotation.
- Budget totals: financial figures must always
  be accurate. A stale cached total could mislead
  the user about their actual spend.

## Reasoning

### Why Redis over in-process cache

**Rate limiting correctness — the critical reason:**

In a multi-instance deployment, an in-process cache
is isolated to each pod. Rate limit counters stored
in memory are per-pod, not per-user:

```
Without Redis (in-process cache):

User sends 20 AI requests in one hour:
- Requests 1-7:   routed to Pod A
  Pod A counter: 7
- Requests 8-14:  routed to Pod B
  Pod B counter: 7
- Requests 15-20: routed to Pod A
  Pod A counter: 13 ← limit not reached

User has sent 20 requests.
Neither pod ever saw 20.
Rate limit is never enforced.
User consumes 20x their allowed quota.
Claude API cost spikes with no protection.
```

With Redis, all pods share one counter:

```
With Redis (shared cache):

User sends 20 AI requests in one hour:
- Request 1:  any pod → Redis counter: 1
- Request 10: any pod → Redis counter: 10
- Request 20: any pod → Redis counter: 20
- Request 21: any pod → Redis counter: 21
              → 21 > 20 limit → 429 returned

Rate limit enforced correctly regardless
of which pod handles each request.
```

This is not a theoretical concern — the Kong
API Gateway uses least-connections load balancing,
meaning consecutive requests from the same user
frequently hit different pods.

**Cache consistency across pods:**

Application data cached in-process has the same
problem. If Pod A caches a car profile and the
user adds a modification (handled by Pod B), Pod B
invalidates its own cache but Pod A still serves
the stale version. The user sees their new
modification disappear on the next page load.

With Redis, one invalidation clears the cache
for all pods simultaneously.

**Survival across pod restarts:**

In-process caches are lost when a pod restarts
or is replaced during deployment. After a rolling
deployment, all pods start with cold caches,
causing a thundering herd of database queries
as every request misses cache simultaneously.

Redis persists independently of pod lifecycle.
A rolling deployment does not cold-start the cache.

**Session and rate limit state survival:**

Rate limit counters in memory are lost on pod
restart. A user who has consumed 19 of their
20 hourly AI requests could trigger a pod restart
(via deployment) and reset their counter to zero.

Redis counters survive pod restarts, maintaining
correct state across deployments.

### Accepted trade-offs of Redis

**Network latency:**
Redis adds approximately 1ms per cache operation
compared to microseconds for in-process memory
access. This is acceptable given that the
alternative — a Postgres query — costs 5-50ms.
The net gain from Redis caching remains significant.

**Redis as a dependency:**
If Redis becomes unavailable, the caching and
rate limiting layers degrade. The designed
degradation behaviour is:

- Cache miss: fall back to Postgres for all reads.
  Performance degrades but correctness is maintained.
- Rate limiting: degrades to per-pod limiting
  (in-process fallback). This is an accepted risk
  documented in the failure modes document.
- The API must never return an error solely because
  Redis is unavailable. Redis failure must never
  cause API failure.

**Operational overhead:**
Redis requires provisioning, monitoring, and
connection pool management. This is mitigated by
using a managed Redis service (Railway Redis or
Upstash) rather than self-hosting.

## Consequences

### Positive
- Rate limiting is correct and consistent across
  all API pods regardless of load balancer routing
- Cache invalidation affects all pods simultaneously
- Cache survives pod restarts and rolling deployments
- Embedding cache reduces OpenAI API costs by
  avoiding redundant embedding generation
- Single cache store simplifies debugging —
  one place to inspect cached values

### Negative
- ~1ms network overhead per cache operation
- Redis becomes a required infrastructure component
  that must be monitored and maintained
- Rate limiting degrades to per-pod behaviour
  if Redis is unavailable (accepted risk)
- Additional cost: managed Redis service

## Failure Modes
Documented in full in /docs/failure-modes.md.
Summary:

| Failure | Behaviour |
|---------|-----------|
| Redis slow (>100ms) | Timeout, fall back to Postgres |
| Redis down | Disable cache, serve all reads from DB |
| Redis down + rate limiting | Degrade to per-pod limiting |

Rule: Redis failure must never cause API failure.

## Migration Trigger
This decision is stable and not expected to require
migration. Redis is an industry-standard caching
solution that scales well beyond Wrench's projected
user counts.

If rate limiting requirements become more complex
(e.g. dynamic limits per user tier, distributed
quota across multiple APIs), evaluate dedicated
rate limiting services (Kong's built-in rate
limiting plugin configured with Redis backend
is already in use and covers this case).

## Alternatives Rejected

**Go sync.Map (in-process cache):**
Fast (microsecond access) but isolated per pod.
Rate limiting becomes per-pod not per-user.
Cache invalidation does not propagate across pods.
Cache lost on pod restart. Rejected.

**Go-cache or Ristretto (in-process libraries):**
Same fundamental limitations as sync.Map.
More feature-rich but the multi-instance
consistency problem remains unsolved. Rejected.

**Memcached:**
Comparable performance to Redis for simple
key-value caching. Rejected because it lacks
the atomic operations (INCR, EXPIRE) needed
for correct sliding window rate limiting,
and does not support the data structures
(sorted sets, lists) that future features
may require.

## References
- Capacity estimates: /docs/capacity-estimation.md
- Failure modes: /docs/failure-modes.md
- Caching strategy: /docs/caching-strategy.md
- Requirements: NFR-15 (AI rate limiting),
  NFR-16 (auth rate limiting), NFR-01 (latency)
- Related ADRs: ADR-004 (read replica routing),
  ADR-008 (Kong API Gateway)