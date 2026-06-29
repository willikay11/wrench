# ADR-004: Database Read Replica Routing Strategy

## Status
Accepted

## Date
2026-06-22

## Context
Wrench uses PostgreSQL (hosted on Neon) as its primary
database. The database tier consists of:
- One primary instance: handles all writes
- Two read replicas: receive changes via streaming
  replication from the primary

Replication is asynchronous. Read replicas may lag
behind the primary by up to 200ms under normal
conditions. This means a read replica may not
immediately reflect a write that just completed
on the primary.

The application has two distinct read workloads
with different characteristics:

**Workload 1 — Application reads:**
User-facing reads that occur immediately after
a write. For example:
- User adds a modification → page reloads to show
  the new mod in the list
- User logs in → auth middleware reads their profile
- User submits a budget entry → dashboard refreshes

These reads require strong consistency — they must
see the write that just completed. A 200ms lag would
cause the user to see their data disappear after
saving, destroying trust in the product.

**Workload 2 — RAG retrieval reads:**
The AI assistant's pgvector similarity searches
retrieve relevant car records to inject into Claude's
context. These reads:
- Occur 200-500ms after the last write to that car
  (the user asked a question, not immediately after
  saving data)
- Can tolerate slight staleness — if a modification
  added 2 seconds ago is missing from the context,
  the AI response is marginally less informed but
  not incorrect
- Are read-heavy and expensive (cosine similarity
  search across up to 1.2M vectors at launch scale)
- Should not compete with writes on the primary
  instance

A routing strategy is needed to direct each query
class to the appropriate database instance.

## Decision
Route queries to database instances based on
consistency requirements:

### Write routing
```
ALL writes → Primary only

INSERT, UPDATE, DELETE on any table → Primary
```

### Read routing
```
Strong consistency required → Primary
  - All auth queries (users, refresh_tokens)
  - Reads immediately following a write
    (post-write confirmation reads)
  - Budget and financial data
  - Any query inside a transaction that
    includes a write

Can tolerate replication lag → Read Replica
  - RAG similarity searches (pgvector queries)
  - Analytics and aggregate queries
  - Reporting queries (budget summaries,
    build plan cost rollups)
  - Historical data queries (full service history,
    full mod list for non-time-sensitive views)
```

### Routing table

| Query type | Instance | Reason |
|------------|----------|--------|
| User login / register | Primary | Auth must be current |
| Refresh token validation | Primary | Security critical |
| Car profile (post-write) | Primary | Must see latest write |
| Car list (garage page) | Replica | Can tolerate 200ms lag |
| RAG vector search | Replica | High read load, lag acceptable |
| Build plan summary | Replica | Analytics, not time-sensitive |
| Budget totals | Primary | Financial accuracy required |
| Service history list | Replica | Historical, lag acceptable |
| Mod list | Replica | Lag acceptable for list view |

### Implementation in Go
Query routing is implemented at the repository layer
using two separate database connection pools:

```go
type DB struct {
    Primary *pgxpool.Pool  // writes + consistency reads
    Replica *pgxpool.Pool  // lag-tolerant reads
}

// Auth repository — always uses primary
func (r *AuthRepo) GetUserByEmail(ctx context.Context,
    email string) (*User, error) {
    return r.db.Primary.QueryRow(ctx, queryGetUserByEmail,
        email)
}

// Embedding repository — uses replica
func (r *EmbeddingRepo) SimilaritySearch(ctx context.Context,
    carId string, queryVector []float32,
    limit int) ([]Embedding, error) {
    return r.db.Replica.Query(ctx, querySimilaritySearch,
        carId, pgvector.NewVector(queryVector), limit)
}
```

Routing decisions are made at the repository layer,
not the handler or service layer. The handler and
service layers have no knowledge of which database
instance serves a given query.

### Replica fallback
If the read replica is unavailable, all queries
fall back to the primary:

```go
func (r *EmbeddingRepo) SimilaritySearch(
    ctx context.Context, ...) ([]Embedding, error) {

    rows, err := r.db.Replica.Query(ctx, ...)
    if err != nil {
        // Log fallback as warning metric
        log.Warn().Msg("replica unavailable, falling back to primary")
        metrics.ReplicaFallback.Inc()
        rows, err = r.db.Primary.Query(ctx, ...)
    }
    return rows, err
}
```

Replica fallback is monitored. A sustained increase
in the replica fallback metric indicates replica
health issues requiring investigation.

## Reasoning

### Why route RAG queries to the replica

The RAG similarity search is the most read-intensive
operation in Wrench. At 10,000 users with 20 AI
queries per day, peak load reaches approximately
23 RAG queries per second.

Each RAG query involves:
1. A cosine similarity search across up to
   1.2M embedding vectors (CPU and I/O intensive)
2. Fetching the content of the top 8 matching records
3. Optional: fetching the full source records
   for additional context

Running these queries on the primary instance
competes directly with write operations and
consistency-critical reads. Under peak AI usage,
write latency on the primary would increase,
causing degraded performance for all users
across all features — not just AI queries.

Routing RAG queries to replicas isolates this
expensive read workload from the write path,
protecting primary performance for all users.

### Why financial and auth reads stay on the primary

**Auth reads:**
Refresh token validation is a security-critical
operation. A 200ms replication lag means a token
revoked via logout could still be considered valid
by a replica for up to 200ms. While brief, this
window is unacceptable for security operations.
All auth reads use the primary.

**Budget and financial reads:**
A user checking their total spend must see their
most recent budget entry. If they add a £500 parts
order and immediately check their total, seeing
the pre-entry total would undermine trust in the
financial tracking feature. Budget reads use the
primary to guarantee accuracy.

### Why the replica lag threshold is 200ms

200ms was chosen as the acceptable lag threshold
based on:
- Neon's documented replication lag under normal
  load is typically under 50ms
- 200ms provides a 4x safety margin
- At 200ms lag, a modification added 200ms ago may
  not appear in RAG context. In practice, users ask
  questions minutes or hours after adding data,
  making this lag invisible in normal usage

The lag is monitored via:
```
metric: wrench_replica_lag_ms
alert:  lag > 200ms sustained for > 5 minutes
action: investigate replica health, consider
        routing all reads to primary temporarily
```

## Consequences

### Positive
- RAG vector searches isolated from write path —
  primary performance protected under AI load
- Read capacity scales horizontally — two replicas
  can serve read traffic independently
- Replica fallback maintains availability if one
  replica fails — reads fall back to primary
- Clear routing rules in the routing table above
  make query placement decisions unambiguous for
  future engineers

### Negative
- Replication lag means some reads may return
  slightly stale data (acceptable for identified
  workloads, mitigated for auth and financial reads)
- Two connection pools increase connection count
  to the database — mitigated by PgBouncer
  connection pooling (see scalability design)
- Developers must be aware of which pool to use
  when writing new queries — documented in
  the routing table above and enforced via code
  review

## Failure Modes
Documented in full in /docs/failure-modes.md.

| Failure | Behaviour |
|---------|-----------|
| Replica unavailable | Fall back to primary for all reads |
| Replica lag > 200ms | Alert fires, consider routing all reads to primary |
| Primary unavailable | Writes fail with 503, reads fall back to replica |

## Migration Trigger
The two-replica configuration is sufficient for
the projected scale of 100,000 users. This
decision will be revisited if:

1. Read replica CPU consistently exceeds 70%
   under normal load — add a third replica
2. RAG query latency on replicas exceeds 80ms p95
   — evaluate dedicated pgvector instance or
   migration to dedicated vector DB (see ADR-002)
3. Replication lag consistently exceeds 200ms
   under normal load — investigate replica sizing
   or network configuration

## Alternatives Rejected

**Route all reads to primary:**
Simplest approach. Rejected because RAG vector
searches are too expensive to run on the same
instance as writes. Primary performance would
degrade under peak AI load, affecting all users.

**Route all reads to replica:**
Maximises replica utilisation. Rejected because
auth and financial reads require strong consistency
that asynchronous replication cannot guarantee.

**Application-level read-your-writes consistency:**
After a write, store a watermark in Redis and
route reads to primary until the replica catches
up to that watermark. Provides consistency for
all reads while still using replicas where safe.
Rejected at this stage because the complexity
is not justified — the set of consistency-critical
reads is small and well-defined. Simple routing
rules are more maintainable than watermark tracking.
Revisit if the set of consistency-critical reads
grows significantly.

## References
- Scalability design: /docs/scalability-design.md
- Failure modes: /docs/failure-modes.md
- Capacity estimates: /docs/capacity-estimation.md
- Requirements: NFR-01 (latency), NFR-06 (availability)
- Related ADRs: ADR-002 (pgvector), ADR-003 (Redis),
  ADR-009 (monolith vs microservices)