# Wrench — Caching Strategy

## Purpose

This document defines what Wrench caches, where,
for how long, and how cache entries are invalidated.
Every caching decision is justified against the
core trade-off caching introduces: speed in exchange
for the risk of serving stale data.

Related ADR: [ADR-003 — Redis vs in-process cache](./adr/003-redis-caching.md)

---

## 1. The Core Trade-off

```
WITHOUT caching:
→ Every read hits Postgres
→ Always fresh, always correct
→ Slower responses under load
→ Postgres connection pool under pressure
  from repeated identical queries

WITH caching:
→ Frequent reads served from Redis in ~1ms
→ Postgres load reduced significantly
→ Faster responses for users
→ Risk: cache may serve stale data if
  invalidation fails or is missed

The engineer's job: design the cache so
staleness either cannot happen in normal
operation (via explicit invalidation) or
self-heals quickly when it does
(via TTL as a safety net).
```

---

## 2. Caching Pattern — Cache-Aside (Lazy Loading)

Wrench uses the **cache-aside** pattern throughout.
The application manages cache population explicitly —
the cache does not auto-populate.

### Read path

```
1. Check Redis for the cache key
2. Cache HIT  → return cached value immediately
3. Cache MISS → query Postgres
              → populate Redis with result
              → return value to client
```

### Write path

```
1. Write to Postgres (source of truth first)
2. On success: DELETE the cache key from Redis
3. Next read will repopulate from Postgres

NOT: write to cache first, then Postgres
     (cache would contain data that doesn't
     exist in DB if Postgres write fails)

NOT: write to Postgres, then update cache
     with new value (race condition under
     concurrent writes — last writer wins
     and may have read stale data when
     building the cache value)

CORRECT: write to Postgres, DELETE cache key,
         let the next READ repopulate from
         the complete, consistent DB state
```

### Why delete instead of update

```
Scenario: two concurrent requests both modify
the same car profile simultaneously

WITHOUT delete-then-repopulate (update approach):

t=0ms  Request A: adds coilovers → Postgres ✓
t=1ms  Request B: adds exhaust → Postgres ✓
t=2ms  Request B: reads car profile from DB
       Gets: car with exhaust + coilovers ✓
t=3ms  Request A: reads car profile from DB
       Gets: car with coilovers only
       (read before Request B's Postgres commit
       completed depending on isolation level)
t=4ms  Request B: writes to cache: {coilovers + exhaust}
t=5ms  Request A: writes to cache: {coilovers only} ✗
       Last writer wins with stale data

WITH delete-then-repopulate:

t=0ms  Request A: adds coilovers → Postgres ✓
t=0ms  Request A: DELETE car:{id}:profile from Redis
t=1ms  Request B: adds exhaust → Postgres ✓
t=1ms  Request B: DELETE car:{id}:profile from Redis
       (deleting an already-deleted key is a
        no-op in Redis — safe, no error)
t=2ms  User loads garage page: cache MISS
t=2ms  Query Postgres: gets BOTH mods ✓
t=2ms  Populate cache: {coilovers + exhaust} ✓

The reader owns cache population.
The writer only owns cache invalidation.
These responsibilities never conflict.
```

---

## 3. What Is Cached

### 3.1 Car profile

```
What:     Complete car detail — make, model, year,
          engine, usageType, recent mods summary,
          recent service summary

Why:      Loaded on every car detail page visit
          and embedded in the garage list.
          Read frequency is HIGH.
          Content changes only on explicit user
          writes (add mod, log service record,
          edit car) — infrequent, predictable.

Key:      car:{carId}:profile
TTL:      5 minutes (safety net)
Size:     ~2-5KB per entry (JSON serialised)

Invalidate on:
  - POST   /cars/{carId}/mods          (mod added)
  - PATCH  /cars/{carId}/mods/{modId}  (mod updated)
  - DELETE /cars/{carId}/mods/{modId}  (mod deleted)
  - POST   /cars/{carId}/service       (service logged)
  - PATCH  /cars/{carId}/service/{id}  (service updated)
  - DELETE /cars/{carId}/service/{id}  (service deleted)
  - PATCH  /cars/{carId}               (car details edited)

Do NOT invalidate on:
  - Budget entry changes (not part of car profile)
  - Build stage/task changes (not in recentMods)
  - AI conversation changes (not in car profile)
```

### 3.2 User car list

```
What:     Array of CarSummary objects for the
          authenticated user's garage page

Why:      Loaded on every garage page visit —
          the first thing a user sees on opening
          Wrench. Read frequency is VERY HIGH.
          Changes only when a car is added or
          deleted — rare events.

Key:      user:{userId}:cars
TTL:      2 minutes
          (shorter than car profile because a
          missing car after addition is more
          disorienting than a stale mod count —
          the phantom write problem has higher
          trust impact on list views than detail
          views)
Size:     ~500 bytes per car × avg 2 cars = ~1KB

Invalidate on:
  - POST   /cars    (car added)
  - DELETE /cars/{carId} (car deleted)

Do NOT invalidate on:
  - Mod or service record changes (CarSummary
    shows only modCount, updated on car profile
    cache invalidation — separate concern)
```

### 3.3 Embedding vectors

```
What:     Float32 array (1536 dimensions) output
          from the OpenAI Embeddings API, indexed
          by source record

Why:      Generating an embedding costs ~$0.00002
          per call and takes 20-50ms of network
          round trip. Many operations trigger
          embedding lookups — car enrichment
          generates 3 embeddings per new car,
          edits check whether regeneration is
          needed. Redis absorbs repeated lookups
          for unchanged text without paying the
          OpenAI API cost again.

          Note: Redis caches the GENERATION result
          (the output of calling OpenAI), NOT the
          SEARCH result. Similarity search is
          pgvector's responsibility — Redis has
          no cosine similarity capability and
          plays no role in the RAG retrieval step.

Key:      embedding:{sourceType}:{sourceId}
          e.g. embedding:modification:550e8400-...
TTL:      24 hours
          (embeddings almost never change —
          only when the text content of a record
          is explicitly edited by the user)
Size:     1536 × 4 bytes = 6,144 bytes ≈ 6KB per entry

Invalidate on:
  - Any edit that changes the TEXT content of
    a source record:
    PATCH /cars/{id}/mods/{modId}
      where name, description, or notes changed
    PATCH /cars/{id}/service/{recordId}
      where type, description, or notes changed
    PATCH /cars/{id}
      where make, model, year, or engine changed

  NOT invalidated on:
    Field changes that don't affect meaning:
    - cost, installationDate, isPlanned changes
      (metadata, not embedded text)
    - category change alone (the embedding
      already captures semantic category from
      the text — explicit category metadata
      is not re-embedded on its own)

Application logic for embedding cache:
  Before calling OpenAI:
    1. Check Redis for embedding:{type}:{id}
    2. Cache HIT  → use cached vector, no API call
    3. Cache MISS → call OpenAI → store in both
                    pgvector AND Redis → use vector
```

### 3.4 Rate limit counters

```
What:     Integer counters tracking request counts
          per user per endpoint within a time window

Why:      Rate limiting requires a counter shared
          across ALL Go API pods. An in-process
          counter is per-pod, not per-user —
          a user could hit 6 pods × 20 requests
          = 120 requests before any single pod
          sees a limit breach.
          Redis counters are shared, atomic,
          and pod-agnostic. See ADR-003.

Keys:
  AI chat rate limit:
    ratelimit:{userId}:chat
    TTL: 3600 seconds (1 hour sliding window)
    Limit: 20 increments before rejection

  Auth rate limit (per IP):
    ratelimit:{ip}:auth
    TTL: 900 seconds (15 minute window)
    Limit: 5 increments before rejection

Implementation (atomic Redis INCR):
  val = INCR ratelimit:{userId}:chat
  if val == 1:
      EXPIRE ratelimit:{userId}:chat 3600
  if val > 20:
      return 429 with Retry-After header

  Why atomic INCR:
  Read-then-increment is NOT atomic — two
  goroutines reading 19 simultaneously both
  allow the request through, both increment
  to 20, rate limit bypassed by one request.
  Redis INCR is a single atomic operation —
  read and increment happen as one indivisible
  unit, no interleaving possible.
```

---

## 4. What Is Never Cached

### AI chat responses

```
Why not cached:
AI responses are generated from the car's context
AT THE MOMENT the question is asked. The car's
context changes as the user adds mods and service
records. A cached response from before a turbo
install would give pre-turbo oil recommendations
after the install — technically stale AND
potentially harmful advice.

AI responses are always read from aiMessages
(the Postgres source of truth), never from Redis.

For large conversation histories: cursor-based
pagination on GET /conversations/{id}/messages
(see openapi.yaml) — this is a read performance
concern, not a caching concern.
```

### Auth tokens and refresh tokens

```
Why not cached:
Refresh tokens must be revocable immediately
on logout and password reset. A cached token
could be served after revocation, allowing
access to a session the user deliberately ended.

The refreshTokens Postgres table IS the source
of truth. All refresh token lookups hit the
primary database directly. The ~5ms latency
of a Postgres query per 15-minute refresh
window is entirely acceptable at Wrench's scale
(3.7 queries/second at 10K users — well within
primary capacity).
```

### Budget totals

```
Why not cached:
Budget data is financial. A cached total showing
$4,800 when Postgres holds $5,200 (because a
$400 receipt was just added) could cause a user
to make a real-world spending decision based on
wrong information.

Budget totals are served from the budgetTotals
materialised view on the primary Postgres instance,
updated incrementally on every budget entry write.
This provides sub-5ms reads without a cache and
without staleness risk. Best of both worlds.
```

### Build task completion status

```
Why not cached:
Build tasks are the active work surface of
Wrench — users mark tasks complete and expect
to see that completion reflected immediately.
The build plan is read infrequently enough
(per project session, not per page load) that
caching provides minimal benefit relative to
the trust cost of a task showing incomplete
when the user just marked it done.
```

---

## 5. TTL Design Principles

```
The question for setting any TTL:
"What is the maximum staleness a user would
 find acceptable for this data type?"

SHORT TTL (seconds to 2 minutes):
→ List views where a missing item = apparent
  data loss (user car list: 2 minutes)
→ Rate limit windows (defined by the window
  itself: 3600s for AI, 900s for auth)
→ Any data where staleness = trust impact

MEDIUM TTL (5-15 minutes):
→ Detail views that change infrequently
  (car profile: 5 minutes)
→ Data where staleness = minor annoyance
  rather than apparent data loss

LONG TTL (hours):
→ Data that almost never changes
  (embedding vectors: 24 hours)
→ Static reference data

The dual-layer model:
TTL is the SAFETY NET that self-heals when
explicit invalidation fails. Explicit invalidation
on write is the PRIMARY mechanism that keeps
the cache fresh in normal operation.

A system with only invalidation: fragile —
one missed invalidation = stale data forever.
A system with only TTL: correct but slow to
update — users wait up to N minutes for changes.
Both together: fast in normal operation,
self-healing on failure.
```

---

## 6. Cache Failure Behaviour

```
Redis unavailable (slow or down):
→ 100ms timeout on all Redis operations
→ Fall through to Postgres on timeout
→ Rate limiting degrades to per-pod
  (accepted risk — documented in ADR-003)
→ The API must never return a 500 because
  Redis is unavailable

Go implementation pattern:

func (s *CarService) GetCarProfile(
    ctx context.Context, carID, userID string,
) (*Car, error) {

    // Step 1: try Redis
    cacheKey := fmt.Sprintf("car:%s:profile", carID)
    cached, err := s.redis.Get(ctx, cacheKey).Result()

    if err == nil {
        var car Car
        if err := json.Unmarshal([]byte(cached), &car); err == nil {
            return &car, nil
        }
    }

    // Redis miss OR Redis error — both fall through
    // Log Redis errors as WARN, never ERROR
    // Never return the Redis error to the caller
    if err != nil && err != redis.Nil {
        log.Warn().
            Err(err).
            Str("carId", carID).
            Msg("Redis unavailable, falling back to Postgres")
    }

    // Step 2: query Postgres
    car, err := s.repo.GetCar(ctx, carID, userID)
    if err != nil {
        return nil, err  // real error — DB is source of truth
    }

    // Step 3: populate cache (best-effort)
    if data, err := json.Marshal(car); err == nil {
        s.redis.Set(ctx, cacheKey, data, 5*time.Minute)
        // Ignore error — cache population is best-effort
    }

    return car, nil
}

Rule: Redis errors are warnings.
      Postgres errors are failures.
      The user should never know Redis exists.
```

---

## 7. Cache Key Reference

```
Key pattern                          TTL    Invalidated by
──────────────────────────────────────────────────────────────
car:{carId}:profile                  5 min  Any write to cars,
                                            carMods, carService
                                            for this carId

user:{userId}:cars                   2 min  POST /cars,
                                            DELETE /cars/{id}

embedding:{sourceType}:{sourceId}    24 hr  Edit to text fields
                                            of source record

ratelimit:{userId}:chat              1 hr   (sliding window —
                                            TTL IS the window)

ratelimit:{ip}:auth                  15 min (sliding window —
                                            TTL IS the window)
```

---

## 8. What the Embedding Cache Does NOT Do

To be explicit about the boundary between
Redis and pgvector in the embedding pipeline:

```
Redis embedding cache:
✓ Stores the OUTPUT of OpenAI embedding calls
✓ Avoids redundant OpenAI API calls for
  unchanged text (cost and latency saving)
✗ Cannot perform cosine similarity search
✗ Does not replace pgvector
✗ Plays no role in RAG retrieval queries

pgvector:
✓ Permanent storage of all embedding vectors
✓ Cosine similarity search via HNSW index
✓ Filtered search by carId + sourceType
✗ Cannot generate embeddings
✗ Not a cache — it is the source of truth
  for vectors

OpenAI Embeddings API:
✓ Generates vectors from text
✗ Cannot store or search vectors
✗ Should be called as infrequently as possible

Three systems, three distinct responsibilities.
None is a substitute for the others.
```

---

## 9. Thundering Herd — Known Limitation

```
If a widely-read cache key is deleted
and many users request it simultaneously,
all requests miss the cache and hit Postgres
at the same time.

For Wrench at launch scale: not a real concern.
Each car is owned by one user — at most one
user loads a given car profile simultaneously.
Unlike a public social media profile that
millions might request at once.

If Wrench introduces PUBLIC garage profiles
(shared builds, community features) in future:
evaluate mutex locking or probabilistic early
expiration to prevent thundering herd on
popular public car profiles.
Document this as a known pattern to apply
if that feature is introduced.
```

---

## References

- ADR-003: [Redis vs in-process cache](./adr/003-redis-caching.md)
- ADR-004: [Read replica routing](./adr/004-read-replica-routing.md)
  (budget totals routed to primary regardless
  of caching strategy)
- ADR-002: [pgvector](./adr/002-pgvector-vs-dedicated-vector-db.md)
  (embedding storage and search)
- Schema: [schema.md](./schema.md)
  (budgetTotals materialised view)
- Requirements: NFR-01 (latency), NFR-15
  (AI rate limiting), NFR-16 (auth rate limiting)