# Wrench — Database Design

## Purpose

This document covers the operational design of
Wrench's database tier — replication topology,
connection pooling, query routing rules, failure
modes, and recovery procedures.

For the structural schema (tables, columns, indexes):
see [schema.md](./schema.md)

Related ADRs:
- [ADR-002 — pgvector](./adr/002-pgvector-vs-dedicated-vector-db.md)
- [ADR-004 — Read replica routing](./adr/004-read-replica-routing.md)

---

## 1. Database Tier Overview

```
Go API Pods (AZ-1 + AZ-2)
         ↓
     PgBouncer
  (connection pooler)
         ↓
  ┌──────────────────────────────┐
  │  Postgres Primary            │  ← all writes
  │  (Neon managed)              │  ← auth reads
  │                              │  ← financial reads
  └──────────┬───────────────────┘
             │ streaming replication (async)
    ┌────────┴────────┐
    ↓                 ↓
Replica 1          Replica 2       ← RAG searches
(Neon managed)     (Neon managed)  ← analytics
                                   ← historical lists
```

**Engine:** PostgreSQL with pgvector extension
**Provider:** Neon (managed Postgres, serverless)
**Topology:** 1 primary, 2 read replicas
**Replication:** Streaming (WAL-based), asynchronous

---

## 2. Replication

### How replication works — WAL streaming

PostgreSQL uses a **Write-Ahead Log (WAL)** as
the foundation for both durability and replication.

```
Every change to Postgres follows this sequence:

1. Change is written to the WAL first
   (a sequential append-only log on disk)
2. Only then applied to the actual table files
3. If Postgres crashes mid-apply:
   → On restart, WAL is replayed → tables consistent
   → No partial writes, no corruption

WAL entry examples:
"INSERT into carMods: {id: X, carId: Y, name: Z}"
"UPDATE users SET lastLogin = NOW() WHERE id = A"
"DELETE from refreshTokens WHERE id = B"

Replication uses the same WAL:
Replicas connect to the primary and stream
the WAL in real time, replaying each entry
on their own data — maintaining an identical
copy of the primary, slightly behind.
```

### Streaming vs logical replication

```
STREAMING REPLICATION (Wrench's choice):
Replicas receive and replay the raw WAL stream.
Replicas are complete, identical copies of
the primary — same schema, same data, same
pgvector indexes.

Used for: read replicas that serve as full
          standbys and can be promoted to primary

LOGICAL REPLICATION (not used in Wrench):
Primary publishes decoded SQL-level changes.
Subscribers can filter — "only replicate the
carMods table" — and can replicate to different
Postgres versions.

Used for: partial replication, cross-version
          migrations, streaming to data warehouses.
          Not needed for Wrench's read replica use case.
```

### Asynchronous vs synchronous replication

```
SYNCHRONOUS (not used in Wrench):
Primary writes WAL
Primary sends WAL to replica
Primary WAITS for replica acknowledgement
Primary then confirms write to Go API

Consequence:
Every write waits for at least one replica.
If a replica is slow (network blip, high load):
→ Every write slows down
→ POST /cars/{id}/mods latency spikes
If a replica goes down:
→ Writes hang or fail until replica recovers
  or is manually removed from sync list
→ A replica failure causes a write outage

ASYNCHRONOUS (Wrench's choice):
Primary writes WAL
Primary confirms write to Go API immediately
Primary streams WAL to replicas in the background
Replicas apply changes ~0-200ms later

Consequence:
→ Write latency: ~5-20ms (fast) ✓
→ Replica failure does not affect writes ✓
→ Accepted trade-off: up to 200ms of data
  exists on primary but not yet on replicas

This trade-off is safe for Wrench because:
Operations that cannot tolerate lag (auth,
post-write reads) route to the primary.
Operations that can tolerate lag (RAG searches,
analytics) route to replicas.
See Section 3 for the full routing table.
```

### Replication lag monitoring

```
Metric: wrench_replica_lag_ms (Grafana gauge)

Alert thresholds:
WARNING:  lag > 100ms sustained for 5 minutes
CRITICAL: lag > 200ms sustained for 5 minutes

At CRITICAL: route all reads to primary temporarily
             until lag recovers below 50ms

How lag is measured:
SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp()))
  AS replica_lag_seconds;

Run on each replica every 30 seconds.
Expose as a Prometheus gauge via the Go API's
/metrics endpoint.
```

---

## 3. Query Routing

All routing decisions are made at the **repository
layer** in the Go API — not at the handler or
service layer. The handler and service layers have
no knowledge of which database instance serves
any given query.

### Routing table

```
Query type                    Instance    Reason
──────────────────────────────────────────────────
POST /auth/login              Primary     Contains a write
                                          (refresh token created)
                                          + security-critical

POST /auth/register           Primary     Write operation

POST /auth/refresh            Primary     Write (token rotation)
                                          + security-critical

GET /cars (garage page)       Primary     Read-your-writes safety
                                          (car may have just been
                                          created at registration)

POST /cars                    Primary     Write

GET /cars/{id} (post-write)   Primary     Read-your-writes:
                                          immediately after a
                                          write, route to primary
                                          to guarantee the user
                                          sees their own change

PATCH/DELETE /cars/{id}       Primary     Write

POST /cars/{id}/mods          Primary     Write

GET /cars/{id}/mods           Primary     Read-your-writes:
(immediately post-write)                  user just added a mod,
                                          must see it immediately

GET /cars/{id}/mods           Replica     Historical list,
(general browse)                          not post-write context

POST /cars/{id}/chat          Replica     pgvector similarity search
(RAG retrieval)                           is expensive — isolate
                                          from primary write path.
                                          Data is not freshly written
                                          (user asks questions about
                                          mods added minutes/hours/
                                          days ago)

GET /cars/{id}/budget         Primary     Financial data —
                                          must always be current

Budget aggregations            Primary    Served from budgetTotals
(SUM queries)                             materialised view —
                                          fast on primary, no
                                          staleness risk

Analytics/reporting            Replica    Aggregate queries,
                                          can tolerate lag

AI conversation history        Replica    Historical data,
GET /conversations                        not freshly written
```

### Read-your-writes consistency

```
The problem:
User adds a modification at t=0ms.
Write goes to primary ✓
User immediately loads mod list at t=5ms.
If routed to replica: replication not complete.
Mod is missing. "Did it save?" trust broken.

The solution — Redis flag approach:

After any write, the Go API sets a short-lived
Redis key:
SET route-primary:{userId} 1 EX 5
(expires in 5 seconds)

On any subsequent read for this user:
if Redis.EXISTS("route-primary:{userId}"):
    query primary
else:
    query replica

After 5 seconds: flag expires, reads return
to replica. Replication is complete well
within this window (typical lag: 50-150ms).

For Wrench at launch (simpler approach):
Route auth reads and car list always to primary.
Route RAG queries always to replica.
The overhead of always-primary for the car list
is acceptable at 10K users.
Revisit the Redis flag approach at 50K users
when primary load warrants more aggressive
replica utilisation.
```

### Go implementation

```go
type DB struct {
    Primary *pgxpool.Pool  // writes + consistency reads
    Replica *pgxpool.Pool  // lag-tolerant reads
}

// Auth repository — always uses primary
func (r *AuthRepo) GetUserByEmail(
    ctx context.Context, email string,
) (*User, error) {
    // Security-critical: always primary
    return r.db.Primary.QueryRow(ctx,
        queryGetUserByEmail, email)
}

// Embedding repository — always uses replica
func (r *EmbeddingRepo) SimilaritySearch(
    ctx context.Context,
    carID string,
    queryVector []float32,
    limit int,
) ([]Embedding, error) {
    rows, err := r.db.Replica.Query(ctx,
        querySimilaritySearch,
        carID,
        pgvector.NewVector(queryVector),
        limit,
    )
    if err != nil {
        // Replica unavailable — fall back to primary
        log.Warn().
            Err(err).
            Msg("replica unavailable, falling back to primary")
        metrics.ReplicaFallback.Inc()
        rows, err = r.db.Primary.Query(ctx,
            querySimilaritySearch,
            carID,
            pgvector.NewVector(queryVector),
            limit,
        )
    }
    return rows, err
}
```

---

## 4. Connection Pooling — PgBouncer

### Why connection pooling is required

```
Postgres connections are expensive:
Each connection costs ~5-10MB on the Postgres
server (work_mem, connection overhead, auth state)
Postgres default max_connections: 100

Without PgBouncer:
6 pods × 100 goroutines each = 600 connections
600 connections × 8MB each  = 4,800MB = 4.8GB

A typical Neon instance has 4GB RAM.
600 connections exhaust server memory completely.
Postgres OOM-killed by the OS.
Every user gets an error.
Complete database outage.

Additionally: max_connections = 100 hard limit.
Connection 101 receives:
"FATAL: sorry, too many clients already"

Without pooling: 500 goroutines fail immediately
regardless of memory.

With PgBouncer:
600 goroutines → PgBouncer queue
PgBouncer maintains 20 actual Postgres connections
20 connections × 8MB = 160MB (comfortable)
20 << 100 max_connections ✓
```

### How PgBouncer works

```
PgBouncer maintains a fixed pool of real Postgres
connections — open, authenticated, ready to serve.

When a goroutine needs to query Postgres:
1. Is an idle connection available in the pool?
   YES → assign it to this goroutine's transaction
   NO  → goroutine waits in a FIFO queue

When a goroutine's transaction completes:
→ Connection returned to pool immediately
→ Next waiting goroutine receives it

Analogy: supermarket checkout queue.
When any till becomes free, the next person
in line steps up. Connections are the tills.
Goroutines are the customers.

This is different from Kong's least-connections
load balancing (which actively routes to the
least-loaded backend). PgBouncer is FIFO queue
+ fixed pool — simpler, because all Postgres
connections are identical and serve the same data.
```

### PgBouncer mode — transaction mode

```
PgBouncer operates in three modes:

SESSION MODE:
One Postgres connection held per client
for the duration of the entire session.
No real multiplexing. Not suitable for Wrench.

STATEMENT MODE:
Connection released after each individual
SQL statement. Too aggressive — transactions
spanning multiple statements break.

TRANSACTION MODE (Wrench's choice):
Connection held for the duration of one
transaction, then released back to pool.

Why transaction mode:
→ All Wrench DB operations use explicit
  transactions (BEGIN; queries; COMMIT)
→ Connection released immediately on COMMIT
  or ROLLBACK — maximum pool efficiency
→ Safe: no transaction-spanning issues because
  the connection is consistent within each
  transaction boundary

Incompatible with transaction mode (not used):
→ SET session variables (reset on connection
  release — use SET LOCAL within transactions)
→ LISTEN/NOTIFY (requires persistent connection)
→ Advisory locks spanning transactions
→ Prepared statements (use protocol-level
  prepared statements instead)
```

### Pool sizing

```
PgBouncer pool sizing formula:
pool_size = (num_cores × 2) + effective_spindle_count

For Neon instance (2 vCPU, SSD — spindle_count = 1):
Theoretical minimum = (2 × 2) + 1 = 5

Wrench production sizing:
wrench_app user pool:  20 connections
  (headroom above theoretical minimum for
  burst traffic and slow transactions holding
  connections longer than average)

monitoring_user pool:   5 connections
  (Grafana dashboards, admin queries)

Total Postgres connections used: 25
max_connections on Neon: 100
Headroom: 75 connections
  (for migrations, admin access, emergency
  direct connections per failure scenario)

Monitoring:
wrench_db_pool_connections_active (gauge)
wrench_db_pool_connections_idle (gauge)
Alert: pool utilisation > 90% for 5 minutes
Action: investigate slow queries holding
        connections, consider increasing
        pool size
```

---

## 5. Failure Modes and Runbooks

### Failure 1 — Primary Postgres down

```
DETECTION:
→ Active: Go API health check fails DB ping
  (returns 503 to Kong within seconds)
→ Alert: wrench_db_primary_down fires
→ Grafana: DB query error rate spikes to 100%

WHAT FAILS IMMEDIATELY:
→ All writes (carMods, service records, auth)
→ Auth reads (login, token refresh)
→ Financial reads (budget totals)
→ Post-write consistency reads

WHAT KEEPS WORKING:
→ Reads already routed to replica (RAG queries,
  historical lists) continue unaffected

NEON AUTOMATIC FAILOVER (30-60 seconds):
→ Neon promotes one replica to primary automatically
→ Same connection string continues to work
  (Neon's proxy layer routes to new primary)
→ Go API needs no configuration change
→ Writes resume after promotion completes

DURING FAILOVER WINDOW (0-60 seconds):
→ Go API retries writes with exponential backoff:
  attempt 1: immediate
  attempt 2: 1 second
  attempt 3: 2 seconds
  attempt 4: 4 seconds
  (up to 60 seconds before returning 503)
→ Users on write-heavy operations see delays
→ Users on read-only operations unaffected

AFTER FAILOVER:
→ Promoted replica is now the only instance
  (no replicas until Neon provisions a replacement)
→ All reads fall back to the new primary
→ Monitor primary load — it now serves all traffic
→ Alert fires: wrench_replica_count < 2

ON-CALL ENGINEER ACTIONS:
1. Confirm Neon failover completed (check Neon dashboard)
2. Verify Go API reconnected to new primary
3. Check what caused original primary failure
   (Neon dashboard: OOM, disk, network)
4. Monitor new primary CPU/memory under full load
5. Confirm Neon is provisioning a new replica
6. Document incident
```

### Failure 2 — Both read replicas down

```
DETECTION:
→ Replica queries fail, fallback to primary fires
→ Alert: wrench_replica_fallback_total
  rate > 0 sustained for 5 minutes
→ Alert: wrench_replica_count = 0

WHAT FAILS:
→ Nothing visible to users immediately
  (replica fallback routes all reads to primary)

WHAT DEGRADES:
→ RAG similarity searches now run on primary
  competing with writes
→ AI responses become slower (primary under
  higher load)
→ Primary CPU increases

WHAT KEEPS WORKING:
→ All writes ✓
→ All reads (via primary fallback) ✓
→ Auth ✓
→ Garage management ✓

GO API BEHAVIOUR:
→ Replica connection fails → log WARN
→ wrench_replica_fallback_total metric increments
→ Request retried on primary transparently
→ No 503 to users

ON-CALL ENGINEER ACTIONS:
1. Check if this is a network partition between
   AZs (both replicas in same AZ?) or
   genuine replica failure
2. If network partition: monitor, usually
   self-resolves within minutes
3. If genuine failure: check Neon dashboard,
   replicas may auto-recover or need manual
   intervention
4. Monitor primary CPU — if above 80%,
   consider temporarily throttling AI requests
5. Document incident
```

### Failure 3 — PgBouncer down

```
DETECTION:
→ All DB operations fail (connection refused
  to PgBouncer)
→ Go API returns 503 for all requests
→ Alert: wrench_db_connection_errors spikes
→ Health check: DB ping fails → /health 503
→ Kong marks all pods unhealthy
→ Users see 503 Service Unavailable

WHAT FAILS: Everything requiring a DB query.
WHAT KEEPS WORKING: Nothing.

RECOVERY PATH 1 — Automatic restart (preferred):
PgBouncer runs as a Kubernetes Deployment.
On failure, Kubernetes restarts it automatically.
Time to recovery: 10-30 seconds.
Postgres connections re-established on startup.
Go API connection pool reconnects automatically
(pgx has built-in retry on connection failure).

RECOVERY PATH 2 — Emergency direct connection:
If PgBouncer cannot be restarted quickly:

1. Update environment variable on all pods:
   DATABASE_URL → DATABASE_URL_DIRECT
   (pointing directly to Postgres primary,
   bypassing PgBouncer)

2. Reduce Go API connection pool size to stay
   within Postgres max_connections:
   MAX_DB_CONNECTIONS=15
   (6 pods × 15 = 90 < 100 limit)

3. Rolling restart of Go API pods to pick up
   new config

Time to recovery: 5-10 minutes
This is emergency mode — acceptable for
30-60 minutes while PgBouncer is restored.

ON-CALL ENGINEER ACTIONS:
1. Check Kubernetes: is PgBouncer pod restarting?
   kubectl get pods -n wrench | grep pgbouncer
2. If restarting: wait 30 seconds, check again
3. If crash-looping: check logs for config error
   kubectl logs -n wrench pgbouncer-xxx
4. If cannot restart: invoke Recovery Path 2
5. After service restored: investigate root cause
6. Consider HA PgBouncer (two instances behind
   TCP load balancer) as upgrade to prevent
   single point of failure

FUTURE IMPROVEMENT:
Run 2 PgBouncer instances behind a TCP load
balancer (HAProxy). One PgBouncer fails →
traffic routes to the other. Eliminates this
single point of failure entirely.
Evaluate at 50K users when even 30 seconds
of complete database unavailability is
unacceptable.
```

### Failure 4 — Primary + all replicas down

```
DETECTION:
→ All DB operations fail
→ Complete service outage

RECOVERY:
→ Neon restores from automated daily backup
→ RPO: up to 24 hours of data loss (NFR-20)
→ RTO: approximately 2 hours (NFR-21)

This scenario should not occur in practice —
Neon's infrastructure maintains redundancy at
the storage level independent of the replication
topology. This failure mode assumes a catastrophic
failure of the entire Neon service or region.

Recovery plan:
1. Contact Neon support immediately
2. Identify most recent backup (Neon retains
   30 days of automated backups per NFR-19)
3. Restore to a new Neon project in a different
   region if current region is compromised
4. Update DATABASE_URL in all Go API pods to
   point to the restored instance
5. Notify users of data loss window
6. Document incident and review Neon SLA
```

---

## 6. Complete Failure Mode Reference

```
Failure                  Fails          Works           RTO
──────────────────────────────────────────────────────────────
Primary down             Writes (60s)   Reads via       30-60s
                         Auth (60s)     replica         (Neon auto-
                                        RAG searches    failover)

Both replicas down       AI slower      Everything      Neon
                                        else via        10-30 min
                                        primary         (new replica)

PgBouncer down           Everything     Nothing         10-30s
                                                        (K8s restart)
                                                        5-10 min
                                                        (direct conn)

Primary + replicas       Everything     Nothing         ~2 hours
all down                                               (backup restore)

Replication lag          RAG slightly   Everything      Auto-resolves
> 200ms                  stale          else normal     when lag drops
```

---

## 7. Backup Strategy

```
Automated backups (Neon):
→ Daily full backup
→ Point-in-time recovery (PITR) within
  the backup window
→ 30-day retention (NFR-19)
→ Stored in a separate Neon storage region
  from the primary data

RPO (Recovery Point Objective): 24 hours (NFR-20)
RTO (Recovery Time Objective):  2 hours  (NFR-21)

Backup verification:
→ Monthly: restore a backup to a test Neon project
→ Verify: row counts match, spot-check recent records
→ Document: restoration steps and time taken
→ This is the only way to know backups actually work

Backup monitoring:
→ Alert if no backup completed in last 25 hours
→ Neon dashboard shows backup status
→ On-call runbook: check Neon dashboard first
  on any database anomaly
```

---

## References

- ADR-002: [pgvector vs dedicated vector DB](./adr/002-pgvector-vs-dedicated-vector-db.md)
- ADR-004: [Read replica routing strategy](./adr/004-read-replica-routing.md)
- Schema: [schema.md](./schema.md)
- Caching strategy: [caching-strategy.md](./caching-strategy.md)
  (budgetTotals materialised view, Redis rate limiting)
- Capacity estimates: [capacity-estimation.md](./capacity-estimation.md)
  (connection count projections)
- Requirements: NFR-06 (availability), NFR-19
  (backup retention), NFR-20 (RPO), NFR-21 (RTO)