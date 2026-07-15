# Wrench — Failure Modes and Resilience

## Purpose

This document is the definitive reference for
every failure mode in Wrench's architecture.
For each component, it documents: what fails,
what keeps working, the detection mechanism,
the recovery path, and the runbook for the
on-call engineer.

This document is designed to be read at 2am
during an incident. Every section answers
"what do I do right now?"

Related documents:
- database-design.md (DB failure runbooks)
- load-balancer-design.md (pod and Kong failures)
- caching-strategy.md (Redis failure behaviour)
- network-security.md (secrets and access)
- dashboards-and-alerts.md (alert definitions)

---

## 1. Failure Mode Reference Table

```
Component              Fails              Works              RTO
------------------------------------------------------------------------
Postgres primary       Writes, auth       Reads via replica  30-60s (Neon auto)
Both replicas          RAG slower         Everything else    10-30min (Neon)
PgBouncer              ALL DB access      Nothing            10-30s (K8s restart)
Primary + replicas     Everything         Nothing            ~2 hours (backup)
Redis                  Cache, rate limit  All DB reads       Immediate (fail-open)
Single Go API pod      ~16% of requests   Other 5 pods       Immediate (ejected)
Multiple Go API pods   Elevated errors    Remaining pods     Minutes (K8s restart)
All Go API pods        Everything         Nothing            Minutes (K8s restart)
Kong node (1 of 2)     ~50% of requests   Other Kong node    Immediate (DNS/LB)
Both Kong nodes        Everything         Nothing            Minutes (restart)
Claude API             AI chat            All CRUD features  Immediate (fallback)
Claude + OpenAI        AI chat            All CRUD features  Until vendor recovers
OpenAI Embeddings      New embeddings     All existing       Queue + retry
Cloudinary             Photo uploads      All other features Until vendor recovers
Neon (full outage)     Everything         Nothing            ~2 hours (backup)
```

---

## 2. Database Failures

### 2.1 Postgres Primary Down

```
DETECTION:
Alert: DatabasePrimaryDown (Tier 1 — page immediately)
Signal: absent(wrench_db_query_duration_seconds_count{
          instance="primary"})
Also: wrench_db_pool_connections_active{instance="primary"}
      drops to 0

WHAT FAILS (immediately):
→ All writes (INSERT, UPDATE, DELETE)
→ Auth: login, token refresh, logout
→ Post-write reads (routed to primary per ADR-004)
→ Budget reads (always primary for accuracy)

WHAT KEEPS WORKING:
→ RAG similarity searches (replica)
→ Car list and profile reads (may degrade
  to replica via fallback — stale by up to 200ms)
→ Historical data browsing (replica)

NEON AUTOMATIC FAILOVER:
→ Neon detects primary failure within 30 seconds
→ Promotes one replica to primary automatically
→ Same DATABASE_URL continues to work
  (Neon proxy routes to new primary)
→ Total downtime: 30-60 seconds

GO API BEHAVIOUR DURING FAILOVER:
→ Write attempts fail with connection error
→ Go API retries with exponential backoff:
  attempt 1: immediate
  attempt 2: 1 second
  attempt 3: 2 seconds
  attempt 4: 4 seconds (up to 60 seconds total)
→ If failover completes within 60s: transparent to user
→ If failover takes > 60s: 503 returned to user

ON-CALL RUNBOOK:
1. Check Neon dashboard — is failover in progress?
2. Check wrench_replica_fallback_total metric
   (should spike as reads fall back to new primary)
3. Verify Go API reconnected:
   Check wrench_db_query_duration_seconds{instance="primary"}
   (should resume after failover)
4. Monitor primary CPU — now serving all traffic
   (no replicas until Neon provisions a replacement)
5. Alert if CPU > 80%: temporarily throttle AI
   requests to reduce replica search load on primary
6. Confirm Neon is provisioning replacement replica
   (check Neon dashboard — typically 10-30 minutes)
7. Document: what caused primary failure?

RECOVERY CRITERIA:
→ wrench_db_query_duration_seconds{instance="primary"}
  showing healthy values
→ Error rate returned to < 0.5%
→ New replica provisioned and replicating
```

### 2.2 Both Read Replicas Down

```
DETECTION:
Alert: ReplicaLagHigh or ReplicaDown (Tier 2)
Signal: wrench_replica_lag_ms not reporting
        OR wrench_replica_fallback_total spiking

WHAT DEGRADES:
→ RAG similarity searches run on primary
  (competing with writes — AI responses slower)
→ Analytics queries slower

WHAT KEEPS WORKING:
→ All writes (primary) ✓
→ All reads (primary fallback) ✓
→ Auth ✓
→ All CRUD features ✓

GO API BEHAVIOUR:
→ Replica query fails → WARN log
→ wrench_replica_fallback_total++
→ Retry on primary automatically
→ User never sees an error

ON-CALL RUNBOOK:
1. Is this network partition or genuine failure?
   Check if both replicas are in the same AZ
   (if so, AZ network issue likely)
2. Check Neon dashboard for replica status
3. Monitor primary CPU — all reads now on primary
4. If primary CPU > 80%: reduce AI request rate
   temporarily via Kong rate limit adjustment
5. Wait for Neon to auto-recover or provision
   replacement replicas (10-30 minutes)
6. Verify replicas healthy:
   wrench_replica_lag_ms returns to < 200ms

RECOVERY CRITERIA:
→ wrench_replica_fallback_total rate returns to 0
→ wrench_replica_lag_ms < 200ms on both replicas
```

### 2.3 PgBouncer Down

```
DETECTION:
Alert: HighErrorRate (Tier 1 — page immediately)
  All DB operations fail simultaneously
  Error rate spikes to ~100%

WHAT FAILS: Everything requiring DB access.
WHAT WORKS: Nothing.

GO API BEHAVIOUR:
→ All DB queries fail with connection error
→ /health endpoint returns 503
→ Kong ejects all pods from pool
→ All users get 503

RECOVERY PATH 1 — Kubernetes auto-restart (preferred):
→ Kubernetes detects pod failure
→ Restarts PgBouncer pod automatically
→ Time to recovery: 10-30 seconds
→ Go API pgx pool reconnects automatically
  (pgx retries connection on failure)

RECOVERY PATH 2 — Direct connection (emergency):
If PgBouncer cannot restart:
1. Update platform environment variable:
   DATABASE_URL → DATABASE_URL_DIRECT
   (points directly to Postgres primary, bypasses PgBouncer)
2. Reduce Go API connection pool size:
   MAX_DB_CONNECTIONS=15
   (6 pods × 15 = 90 < 100 max_connections limit)
3. Rolling restart of Go API pods
4. Time to recovery: 5-10 minutes
5. Monitor Postgres connection count closely

ON-CALL RUNBOOK:
1. kubectl get pods -n wrench | grep pgbouncer
   Is it restarting? CrashLoopBackOff?
2. If restarting: wait 30 seconds, check again
3. kubectl logs -n wrench pgbouncer-{pod} --previous
   Look for: config errors, auth errors, OOM
4. If crash-looping with config error: fix config, apply
5. If cannot restart within 5 minutes: invoke Path 2
6. After recovery: investigate root cause
   Was this OOM? Config error? Infrastructure issue?

RECOVERY CRITERIA:
→ wrench_db_pool_connections_active reporting normally
→ Error rate returned to < 0.5%
→ /health returning 200
```

### 2.4 Complete Database Loss (Primary + All Replicas)

```
DETECTION:
Alert: DatabasePrimaryDown + ReplicaDown
  Complete absence of all DB metrics

WHAT FAILS: Everything.
WHAT WORKS: Nothing.

RECOVERY:
→ Neon restores from automated daily backup
→ RPO: up to 24 hours of data loss (NFR-20)
→ RTO: approximately 2 hours (NFR-21)

ON-CALL RUNBOOK:
1. Contact Neon support immediately
   (this should not happen with Neon's redundancy)
2. Identify most recent backup in Neon dashboard
   (30 days retention per NFR-19)
3. If current Neon region is compromised:
   Restore to new Neon project in different region
4. Update DATABASE_URL in platform env vars
5. Rolling restart of all Go API pods
6. Verify: wrench_db_query_duration_seconds
   showing healthy values
7. Assess data loss window — notify users if required
   (GDPR Article 33: notify supervisory authority
    within 72 hours of confirmed breach)
8. Post-mortem within 5 business days

RECOVERY CRITERIA:
→ All DB metrics healthy
→ Error rate returned to < 0.5%
→ Data integrity verified (spot check key tables)
```

---

## 3. Cache and Rate Limiting Failures

### 3.1 Redis Down

```
DETECTION:
Alert: CacheHitRateLow may fire (Tier 2)
Signal: wrench_cache_misses_total spikes
        wrench_redis_errors_total > 0

WHAT DEGRADES:
→ All cache reads miss (fall through to Postgres)
→ Rate limiting fails open (requests allowed through)
→ Slight increase in Postgres load

WHAT KEEPS WORKING:
→ All user features ✓ (cache is never source of truth)
→ All writes ✓
→ All reads (from Postgres) ✓

GO API BEHAVIOUR (ADR-003 fail-open policy):
→ Redis GET fails → log WARN, fall through to Postgres
→ Redis INCR fails → log WARN, allow request through
→ API never returns 500 because Redis is unavailable
→ Rule: Redis failure must never cause API failure

CASCADE RISK:
Redis down + high AI traffic = rate limiting disabled
→ Users can exceed their 20 req/hour AI limit
→ Claude API costs spike
→ Detection: ClaudeCostSpike alert fires (Tier 2)
→ Mitigation: on-call can manually set Kong rate
  limit to compensate while Redis recovers

KUBERNETES AUTO-RECOVERY:
Redis pod failure → Kubernetes restarts → 10-30 seconds
Cache is cold after restart — warms up within minutes
as requests repopulate it (cache-aside pattern)

ON-CALL RUNBOOK:
1. Is Redis restarting? kubectl get pods | grep redis
2. If restarting: wait 30 seconds
3. Check wrench_claude_api_cost_usd_total
   Is cost spiking? (rate limiting disabled)
4. If cost spiking: reduce Kong AI endpoint rate limit
   to 5/hour as temporary compensation
5. After Redis recovery: remove temporary Kong limit
6. Monitor cache hit rate returning to > 80%

RECOVERY CRITERIA:
→ wrench_cache_hits_total rate returning (cache warming)
→ wrench_redis_errors_total returns to 0
→ Cache hit rate returning toward 80% target
```

### 3.2 Redis Memory Exhaustion

```
DETECTION:
Alert: (not currently a Tier 1 alert)
Signal: Redis memory usage > 85%
        Cache evictions increasing
        Cache hit rate declining

WHAT HAPPENS:
Redis evicts keys when memory is full.
LRU (Least Recently Used) eviction policy:
oldest, least-accessed keys evicted first.

EVICTION CASCADE:
1. Old embedding cache entries evicted
   → More OpenAI API calls (cost increase)
   → Slower embedding operations

2. Rate limit counters evicted
   → Fail-open rate limiting
   → AI cost spike risk

3. Car profile cache entries evicted
   → More Postgres queries
   → Higher primary DB load

MITIGATION:
→ Increase Redis memory allocation
→ Review TTLs — are any set too long?
→ Are embedding vectors being cached unnecessarily?

ON-CALL RUNBOOK:
1. Check Redis memory: redis-cli INFO memory
2. Check eviction rate: evicted_keys in INFO stats
3. If rate limit counters evicted: monitor Claude cost
4. Increase Redis maxmemory in platform config
5. Restart Redis to apply new memory limit
6. Verify hit rate recovering
```

---

## 4. Application Layer Failures

### 4.1 Single Go API Pod Failure

```
DETECTION:
Passive: Kong detects 503 from pod, ejects immediately
Active: /health check fails, Kong ejects within 3s
Signal: wrench_http_active_connections drops by ~16%
        (one of six pods gone)

WHAT DEGRADES:
→ ~16% of in-flight requests on that pod
  receive connection reset (retried by Kong)

WHAT KEEPS WORKING:
→ All other 5 pods serving normally
→ Kong routes no new requests to failed pod
→ Kubernetes restarts failed pod automatically

USER IMPACT:
→ Requests routed to failed pod during 2.5s window:
  → Receive connection reset
  → Kong retries on healthy pod (retries: 1 config)
  → User receives response with ~5ms additional latency
  → User never sees an error if retry succeeds

TIME TO RECOVERY:
→ Kong ejects pod: < 3 seconds
→ Kubernetes restarts pod: 30-60 seconds
→ New pod passes health checks: 10-30 seconds
→ Pod re-added to Kong upstream: next health check
→ Total: 1-2 minutes

ON-CALL RUNBOOK:
1. kubectl get pods -n wrench
   Which pod failed? What is its restart count?
2. kubectl logs -n wrench {pod} --previous
   What caused the failure?
   OOM: increase pod memory limit or fix memory leak
   Panic: check logs for stack trace, fix the bug
   Config error: check environment variables
3. If restart count > 3 in 10 minutes:
   CrashLoopBackOff — investigate root cause
   before Kubernetes keeps restarting
4. Check error rate during failure window:
   Did Kong retry succeed? (error rate should be low)
```

### 4.2 Multiple Go API Pods Failing

```
DETECTION:
Alert: HighErrorRate (Tier 1) if > 2 pods fail
Signal: Error rate spikes, active connections drop

LIKELY CAUSES:
→ Bad deployment (all pods running same bad code)
→ OOM from traffic spike (all pods memory-limited)
→ Shared dependency failing (Redis, PgBouncer)
→ Node failure taking multiple pods

ON-CALL RUNBOOK:
1. Check if this followed a recent deployment
   If yes: ROLLBACK IMMEDIATELY
   kubectl rollout undo deployment/wrench-api
2. Check if a shared dependency failed
   (Redis, PgBouncer) — see Section 3
3. Check pod memory usage:
   container_memory_usage_bytes
   If OOM: reduce active connections (lower Kong limit)
           scale out (add more pods)
4. If unknown cause: kubectl logs -n wrench {pod}
   Check all pod logs for common error pattern

ROLLBACK PROCEDURE:
kubectl rollout undo deployment/wrench-api
kubectl rollout status deployment/wrench-api
Verify: error rate returns to < 0.5%
Time to rollback: 2-3 minutes
```

### 4.3 All Go API Pods Failing

```
DETECTION:
Alert: HighErrorRate (Tier 1) — complete outage
Kong returns 502/503 to all requests

WHAT FAILS: Everything.
WHAT WORKS: Nothing.

LIKELY CAUSES:
→ Bad deployment to all pods
→ Critical shared dependency failure
→ Node failure (if all pods on same node)
→ Out-of-memory on all pods simultaneously

ON-CALL RUNBOOK:
1. ROLLBACK if recent deployment:
   kubectl rollout undo deployment/wrench-api
2. Check all pod logs for common error:
   kubectl logs -n wrench -l app=wrench-api --tail=50
3. Check dependencies: Redis, PgBouncer, Neon
4. Check node health: kubectl get nodes
5. Scale up pod count if node failure:
   kubectl scale deployment/wrench-api --replicas=9
   (forces pods to other nodes)

RECOVERY CRITERIA:
→ /health returning 200 on all pods
→ Kong marks all pods healthy
→ Error rate returned to < 0.5%
```

---

## 5. AI Service Failures

### 5.1 Claude API Unavailable

```
DETECTION:
Alert: AIFallbackElevated (Tier 2) at 5% fallback
Alert: AIServiceDown (Tier 1) at 0% success rate

WHAT FAILS:
→ AI chat requests to Claude API

WHAT KEEPS WORKING:
→ ALL CRUD features ✓
→ Garage management ✓
→ Build planner ✓
→ Budget tracking ✓
→ OpenAI fallback serves AI requests ✓

GO API BEHAVIOUR — CIRCUIT BREAKER:
Normal: Go API → Claude API (primary)

After 5 consecutive Claude failures:
Circuit opens → all requests route to OpenAI
wrench_ai_requests_total{fallback="true"} = 100%

After 30 seconds (half-open):
One test request sent to Claude
If success: circuit closes, Claude resumes
If failure: circuit stays open, 30s timer resets

WHAT THE USER EXPERIENCES:
→ AI chat continues working (OpenAI responding)
→ Response quality may differ slightly
→ No error shown — fallback is transparent

ON-CALL RUNBOOK:
1. Check anthropic.com/status — is this a known outage?
2. Check wrench_ai_requests_total{fallback="true"}
   100% fallback = Claude circuit open
3. Check OpenAI fallback is working:
   wrench_ai_requests_total{status="success"} > 0
4. Monitor Claude circuit half-open tests:
   Every 30s one request probes Claude
   When it succeeds: circuit closes automatically
5. No manual intervention needed if fallback is working

IF OPENAI ALSO FAILS:
See Section 5.2

RECOVERY CRITERIA:
→ wrench_ai_requests_total{fallback="false"} increasing
→ Circuit breaker closed (Claude responding)
```

### 5.2 Claude API + OpenAI Both Unavailable

```
DETECTION:
Alert: AIServiceDown (Tier 1)
Signal: wrench_ai_requests_total{status="success"} = 0
        wrench_ai_requests_total{status="error"} > 0

WHAT FAILS:
→ All AI chat requests return 503

WHAT KEEPS WORKING:
→ ALL CRUD features ✓
→ Wrench core functionality unaffected

USER EXPERIENCE:
→ AI chat returns:
  "The AI assistant is temporarily unavailable.
   Your car data is safe. Please try again later."
→ Garage management, build planner, budget all work

ON-CALL RUNBOOK:
1. Confirm both providers are down:
   anthropic.com/status AND status.openai.com
2. This is a vendor issue — nothing to fix on Wrench side
3. Monitor both status pages
4. When either provider recovers:
   Circuit breaker auto-recovers within 30 seconds
5. No rollback or deployment needed
6. Communicate to users if outage exceeds 30 minutes:
   status.wrench.ai: "AI assistant temporarily unavailable.
   Core garage features working normally."

RECOVERY CRITERIA:
→ wrench_ai_requests_total{status="success"} > 0
→ Error rate returned to normal
```

### 5.3 OpenAI Embeddings API Unavailable

```
DETECTION:
Signal: wrench_embedding_generation_duration_seconds
        p99 timeout
        wrench_embedding_cache_misses_total spike
        (misses with no corresponding generation)

WHAT FAILS:
→ New embedding generation (new mods, new cars,
  new service records cannot be embedded)

WHAT KEEPS WORKING:
→ Existing RAG searches (existing embeddings work) ✓
→ All CRUD features ✓
→ AI chat for existing car data ✓

GO API BEHAVIOUR:
→ Embedding generation queued for async retry
→ Source record saved to Postgres immediately
→ Embedding generated when OpenAI recovers
→ Brief window where new data is not in RAG context
  (user adds a mod, AI doesn't know about it yet)

USER EXPERIENCE:
→ Adding a mod: works normally
→ Asking AI about the new mod: AI may not know yet
→ Not an error — just delayed indexing

ON-CALL RUNBOOK:
1. Check status.openai.com
2. Monitor embedding retry queue depth
3. Verify existing RAG searches still working:
   wrench_rag_search_duration_seconds healthy?
4. When OpenAI recovers:
   Retry job processes queue automatically
5. Verify: all recent records have embeddings
   SELECT COUNT(*) FROM embeddings WHERE created_at > [outage_start]

RECOVERY CRITERIA:
→ wrench_embedding_generation_duration_seconds
  returning to normal
→ Retry queue empty
→ New records appearing in similarity searches
```

---

## 6. Infrastructure Failures

### 6.1 Kong Node Failure (1 of 2)

```
DETECTION:
Signal: DNS/Cloud LB health check detects failure
        Traffic drops to one Kong node

WHAT DEGRADES:
→ ~50% reduction in Kong capacity during failure

WHAT KEEPS WORKING:
→ All traffic routes to surviving Kong node ✓
→ No user-visible impact if within Kong node capacity

RECOVERY:
→ Kubernetes or hosting provider restarts Kong node
→ DNS/LB health check detects recovery
→ Traffic redistributed automatically

ON-CALL RUNBOOK:
1. Check Kong node health in platform dashboard
2. Is surviving node handling load?
   Monitor Kong connection count
3. If surviving node approaching capacity:
   Temporarily reduce per-IP rate limit to 500/hour
   to shed load
4. Platform restarts failed Kong node automatically
5. Verify both nodes healthy in LB health check
```

### 6.2 Both Kong Nodes Failing

```
DETECTION:
Alert: HighErrorRate (Tier 1) — complete outage
DNS/LB returns no healthy backends
Users receive connection refused or DNS timeout

WHAT FAILS: Everything.
WHAT WORKS: Nothing.

LIKELY CAUSES:
→ Bad Kong configuration deployment
→ Kong software bug
→ Both nodes OOM simultaneously

ON-CALL RUNBOOK:
1. Check Kong node status in platform dashboard
2. If bad config: rollback Kong configuration
   kubectl rollout undo deployment/kong
3. If OOM: scale up Kong instance size
4. If software bug: rollback Kong version
5. Emergency: bypass Kong entirely
   Update DNS to point directly to Go API pods
   (Go API still validates JWT — security maintained)
   This is a last resort: loses rate limiting and
   channel auth at the perimeter

RECOVERY CRITERIA:
→ Both Kong nodes healthy in LB
→ Error rate returned to < 0.5%
```

### 6.3 Cloudinary Unavailable

```
DETECTION:
Signal: POST /upload/* returning errors
        wrench_cloudinary_errors_total > 0

WHAT FAILS:
→ New photo uploads (mod photos, receipts,
  inspiration images, avatar changes)

WHAT KEEPS WORKING:
→ Viewing existing photos (served from Cloudinary CDN
  — if CDN is up even when upload API is down) ✓
→ All non-photo features ✓
→ All CRUD features ✓
→ AI chat (uses existing photos, not new ones) ✓

USER EXPERIENCE:
→ Upload attempts return:
  "Photo upload temporarily unavailable.
   Your car data is saved. Try uploading again later."
→ All existing photos display normally

ON-CALL RUNBOOK:
1. Check status.cloudinary.com
2. Verify existing photo URLs still loading
   (CDN may be up even if upload API is down)
3. No code changes needed — vendor outage
4. When Cloudinary recovers: uploads resume automatically

RECOVERY CRITERIA:
→ POST /upload/* returning 200
→ New photos appearing in responses
```

---

## 7. Cascading Failure Scenarios

### 7.1 Redis Down → Rate Limiting Disabled → AI Cost Spike

```
TRIGGER: Redis runs out of memory, evicts keys

CASCADE:
Step 1: Redis evicts rate limit counters
Step 2: Rate limiting fails open (requests allowed)
Step 3: Users can exceed 20 req/hour AI limit
Step 4: Claude API costs spike (10x normal)
Step 5: ClaudeCostSpike alert fires (Tier 2)

STOP POINT:
The cascade stops at Step 4 because:
→ Per-user rate limit is the only thing broken
→ Kong's per-IP limit (1000/hour) still works
  (Kong uses its own Redis in production)
→ A single user spamming AI cannot take down
  the service — they can only run up cost

DETECTION: ClaudeCostSpike alert (Tier 2)

MITIGATION:
1. Fix Redis (see Section 3.2)
2. While Redis is down: temporarily reduce
   Kong AI endpoint rate limit to 5/hour
   as compensation for disabled per-user limit
3. After Redis recovery: remove temporary limit
4. Review cost spike: was it abuse or accident?
```

### 7.2 Slow Postgres → Connection Pool Exhaustion → Full Outage

```
TRIGGER: A slow query (missing index, lock contention)
         takes 30 seconds to complete

CASCADE:
Step 1: Slow query holds a PgBouncer connection
Step 2: More slow queries arrive, hold more connections
Step 3: All 20 PgBouncer connections occupied
Step 4: New requests wait in queue
Step 5: Queue grows, response times spike
Step 6: p95 latency SLO breaches (Tier 2 alert)
Step 7: Waiting connections timeout → errors
Step 8: HighErrorRate alert fires (Tier 1)

STOP POINT:
If not addressed, this cascades to full outage.
PgBouncer's statement timeout is the safety valve:
Any query running > 30 seconds is killed.
Connections released, queue drains.

DETECTION:
Alert: PgBouncerPoolExhausted (Tier 2) fires first
       wrench_db_pool_connections_waiting > 0
Then: HighErrorRate (Tier 1)

MITIGATION:
1. Identify the slow query:
   SELECT query, duration FROM pg_stat_activity
   WHERE state = 'active' ORDER BY duration DESC
2. Kill the long-running query:
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE duration > interval '30 seconds'
3. Add missing index or fix query
4. Deploy fix

PREVENTION:
→ statement_timeout = 30000 in PgBouncer config
→ Regular EXPLAIN ANALYZE on slow queries
→ pg_stat_statements extension for query profiling
```

### 7.3 Deployment Gone Wrong → Pod Crashes → Rollback

```
TRIGGER: Bad code deployed to all pods

CASCADE:
Step 1: Rolling deployment starts
Step 2: New pods start crashing on startup
        (panic, missing env var, DB migration failure)
Step 3: Kubernetes sees crash → restarts pod
Step 4: Pod crashes again → CrashLoopBackOff
Step 5: Old pods still running (rolling deploy)
        partially serving traffic
Step 6: As more old pods replaced, more crashes
Step 7: Error rate climbs → HighErrorRate alert

STOP POINT:
Kubernetes rolling deployment has a maxUnavailable
setting (typically 1 or 25%). If the new pod crashes,
Kubernetes pauses the rollout — old pods continue
serving. Complete outage prevented.

DETECTION:
Alert: HighErrorRate (Tier 1) or
       kubectl get pods showing CrashLoopBackOff

MITIGATION:
ROLLBACK IMMEDIATELY:
kubectl rollout undo deployment/wrench-api
kubectl rollout status deployment/wrench-api

Do not investigate while the rollout is in progress.
Rollback first, investigate after service is restored.
Time to rollback: 2-3 minutes.
Total downtime if rollback is immediate: < 5 minutes.

After rollback:
1. Check logs of crashed pod:
   kubectl logs wrench-api-{new-pod} --previous
2. Identify root cause:
   Panic? Missing env var? Schema mismatch?
3. Fix in development, deploy to staging
4. Re-deploy to production with confidence
```

---

## 8. Resilience Patterns Summary

```
PATTERN 1 — FAIL OPEN (Redis):
Redis errors → allow requests through
Never: return 500 because Redis is down
Always: degrade gracefully to the next layer

PATTERN 2 — CIRCUIT BREAKER (Claude API):
5 consecutive failures → circuit opens
All requests route to OpenAI fallback
30 seconds → half-open → test probe
Success → circuit closes, Claude resumes
Prevents hammering a failing external service

PATTERN 3 — RETRY WITH BACKOFF (write operations):
Transient failures → retry with exponential backoff
Max retries: 4 (1s, 2s, 4s delays)
Timeout after 60 seconds
Prevents thundering herd on recovering service

PATTERN 4 — GRACEFUL SHUTDOWN (Go API pods):
SIGTERM → stop accepting new requests
Wait up to 30s for in-flight requests to complete
Force-kill after 30s
Ensures rolling deployments have zero user impact

PATTERN 5 — REPLICA FALLBACK (Postgres):
Replica unavailable → fall back to primary
Primary unavailable → reads from replica
Never: fail a read because one instance is down
Always: route to the available instance

PATTERN 6 — PASSIVE + ACTIVE HEALTH CHECKS (Kong):
Passive: eject pod on first 503 response
Active: poll /health every 3 seconds as safety net
Together: near-instant detection of pod failures

PATTERN 7 — ROLLBACK FIRST (deployments):
Bad deployment detected → rollback immediately
Investigate after service is restored
Never: investigate while users are impacted
```

---

## 9. Recovery Time and Data Loss Targets

```
Component              RTO Target    RPO Target
---------------------------------------------------
Single pod failure     < 2 minutes   Zero (no data loss)
DB primary failover    < 2 minutes   < 200ms (replication lag)
Redis restart          < 1 minute    Zero (cache is ephemeral)
PgBouncer restart      < 1 minute    Zero (no data loss)
Full DB restore        ~2 hours      24 hours (NFR-20, NFR-21)
Claude API recovery    Vendor-dependent  Zero (no writes)
Complete outage        < 30 minutes  Depends on cause

RTO: Recovery Time Objective — how quickly service is restored
RPO: Recovery Point Objective — how much data can be lost

The 24-hour RPO for full DB restore reflects the
daily backup schedule. In practice, async replication
means most failures result in < 200ms data loss.
The 24-hour RPO is the worst-case scenario requiring
a full backup restoration.
```

---

## 10. Incident Response Checklist

```
FOR ANY TIER 1 INCIDENT:

□ Acknowledge the alert (stop repeat pages)
□ Open Dashboard 1 — what is the error rate?
□ Which endpoints are failing?
□ How long has this been happening?
□ Is this following a recent deployment?
  YES → rollback immediately
□ Check the relevant dependency
  (DB, Redis, Claude, Kong)
□ Post in #wrench-oncall Slack:
  "Investigating [X]% error rate since [time]
   on [endpoints]. Checking [suspected cause].
   Update in 10 min."
□ Execute the relevant runbook from this document
□ Verify: error rate returning to normal
□ Post resolution update in Slack
□ Mark alert as resolved
□ Schedule post-mortem (within 5 business days
  for any incident consuming > 10% error budget)
```

---

## References

- database-design.md (DB failure runbooks in detail)
- load-balancer-design.md (pod failure and graceful shutdown)
- caching-strategy.md (Redis failure behaviour)
- dashboards-and-alerts.md (alert definitions and PromQL)
- slos.md (error budget policy)
- ADR-003: Redis (fail-open policy)
- ADR-004: Read replica routing (fallback behaviour)
- ADR-008: Kong (health checks and retry config)
- Requirements: NFR-06 (availability), NFR-07 (RTO),
  NFR-20 (RPO), NFR-21 (RTO for full restore)