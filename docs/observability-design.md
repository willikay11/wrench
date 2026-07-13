# Wrench — Observability Design

## Purpose

This document defines Wrench's complete observability
architecture — what is instrumented, how logs metrics
and traces flow to Grafana Cloud, and how on-call
engineers use these tools to investigate incidents.

Observability is built in from day one — before
application features — so every feature ships
with instrumentation already in place.

Related ADR: ADR-006 — OpenTelemetry vs custom observability

---

## 1. The Three Pillars

```
LOGS (Grafana Loki):
Structured records of what happened.
Answer: "what did the system do?"
Tool: zerolog → JSON → Grafana Loki

METRICS (Grafana Mimir / Prometheus):
Numerical measurements over time.
Answer: "how is the system performing?"
Tool: OTel SDK → Prometheus format → Grafana Mimir

TRACES (Grafana Tempo):
End-to-end records of individual requests.
Answer: "why did THIS request behave this way?"
Tool: OTel SDK → OTLP → Grafana Tempo

THE LINK BETWEEN ALL THREE:
Every log line contains a trace_id.
Every trace spans a request visible in logs.
Every metric aggregates what the traces measure.

An incident investigation starts at metrics
(what is broken), pivots to logs (which requests
are failing), then to traces (why those requests
are failing). The trace_id is the bridge between
all three.
```

---

## 2. Architecture

```
Go API Pods (AZ-1 + AZ-2)
  │
  │ OTLP/gRPC (port 4317)
  ↓
OTel Collector (sidecar per pod)
  │
  │ OTLP/HTTP
  ↓
Grafana Cloud
  ├── Grafana Loki    (logs)
  ├── Grafana Mimir   (metrics — Prometheus compatible)
  └── Grafana Tempo   (traces)
  │
  ↓
Grafana Dashboards + Alerting
```

### Why OTel Collector as a sidecar

```
The Go API sends telemetry to a local OTel
Collector running alongside it (sidecar pattern)
rather than directly to Grafana Cloud.

BENEFITS:
→ Go API is decoupled from Grafana Cloud's
  specific API — if we switch backends, only
  the Collector config changes, not Go code
→ Collector handles retries, batching, and
  buffering — the Go API does not block if
  Grafana Cloud is temporarily slow
→ Collector can sample traces (reduce volume)
  without changing application code
→ Collector adds infrastructure metadata
  (pod name, AZ, version) to every span

If the Collector is unavailable:
The OTel SDK buffers telemetry in memory and
retries. Brief Collector outages do not lose
telemetry. If the Go API restarts before
flushing: that telemetry is lost.
Accepted risk — brief gaps in observability
during pod restarts are tolerable.
```

---

## 3. Structured Logging

### Log format (zerolog JSON)

Every request produces exactly one access log line:

```json
{
  "level": "info",
  "timestamp": "2026-07-13T19:12:43.291Z",
  "service": "wrench-api",
  "version": "1.2.3",
  "environment": "production",
  "request_id": "01HXYZ123ABC",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "car_id": "abc123-350z",
  "method": "POST",
  "path": "/v1/cars/abc123-350z/chat",
  "status_code": 200,
  "duration_ms": 4821,
  "bytes_sent": 1204
}
```

The trace_id is the pivot point between logs
and traces — copy it from a log line and paste
it into Grafana Tempo to see the full distributed
trace for that exact request.

### Log levels

```
DEBUG:  detailed internal flow — dev environment only
        NEVER in production
        example: "entering SimilaritySearch carId=..."

INFO:   request completed, user action taken
        example: "POST /v1/cars/{id}/mods 201 45ms"

WARN:   recoverable failure — system degraded but working
        example: "Redis unavailable, falling back to Postgres"
        example: "Replica lag 180ms approaching threshold"
        example: "Claude API slow, p95 > 5s"

ERROR:  unrecoverable failure requiring attention
        example: "Claude API returned 500 after 3 retries"
        example: "DB primary connection pool exhausted"
        example: "Panic recovered in handler"

FATAL:  startup failure — process exits
        example: "JWT_SECRET missing — refusing to start"
```

### What is NEVER logged (NFR-29)

```
NEVER:
→ email addresses
→ displayName or any user PII
→ car VIN numbers
→ financial amounts or receipt contents
→ AI conversation content (conversationId only)
→ raw JWT tokens or refresh tokens
→ API keys or secrets
→ passwords or password hashes
→ full DATABASE_URL or REDIS_URL

ALWAYS USE:
→ userId (UUID) instead of email
→ carId (UUID) instead of car details
→ conversationId instead of message content
→ tokenCount instead of token content
```

### Loki query examples

```
Find all requests for a specific user:
{service="wrench-api"} | json | user_id="550e8400-..."

Find all AI chat requests in a time window:
{service="wrench-api"}
  | json
  | path =~ ".*/chat"
  | timestamp >= "2026-07-13T19:00:00Z"
  | timestamp <= "2026-07-13T20:00:00Z"

Find all 5xx errors:
{service="wrench-api"} | json | status_code >= 500

Find slow requests (> 5 seconds):
{service="wrench-api"} | json | duration_ms > 5000

Find Redis fallback events:
{service="wrench-api"} | json | level="warn"
  |= "Redis unavailable"
```

---

## 4. Metrics

All metrics follow Prometheus naming conventions:
`{namespace}_{subsystem}_{name}_{unit}`

### HTTP metrics (RED method)

```
# Request rate (R)
wrench_http_requests_total
  type:   counter
  labels: method, path, status_code
  use:    rate(wrench_http_requests_total[5m])

# Request duration (D)
wrench_http_request_duration_seconds
  type:   histogram
  labels: method, path
  buckets: 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0
  use:    histogram_quantile(0.95,
            sum by (le) (
              rate(wrench_http_request_duration_seconds_bucket[5m])
            ))

# Error rate (E)
# Derived from wrench_http_requests_total:
sum(rate(wrench_http_requests_total{
  status_code=~"5..", path!="/health"}[5m]))
/
sum(rate(wrench_http_requests_total{
  path!="/health"}[5m]))
* 100

# Active connections (for autoscaling)
wrench_http_active_connections
  type:   gauge
  labels: none
  use:    direct query (current value)
  alert:  > 400 per pod sustained 2 min
```

### AI metrics

```
# AI request rate and status
wrench_ai_requests_total
  type:   counter
  labels: status (success/error), model, fallback (bool)
  use:    rate(wrench_ai_requests_total[5m])

# AI request duration (end to end)
wrench_ai_request_duration_seconds
  type:   histogram
  labels: model
  buckets: 0.5, 1.0, 2.0, 5.0, 8.0, 10.0, 15.0, 30.0
  SLO:    p95 < 10s

# Time to first token (user perceived latency)
wrench_ai_time_to_first_token_seconds
  type:   histogram
  labels: model
  SLO:    p95 < 3s
  why:    streaming means the user sees tokens at
          first_token time, not at completion time.
          This is the UX-relevant latency metric.

# Token consumption
wrench_ai_tokens_total
  type:   counter
  labels: type (input/output), model
  use:    increase(wrench_ai_tokens_total[1h])

# Claude API cost (most important AI metric)
wrench_claude_api_cost_usd_total
  type:   counter
  labels: model
  use:    increase(wrench_claude_api_cost_usd_total[1h])
  alert:  hourly cost > 2x 7-day average for same hour
  why:    this is a financial metric — unexpected spikes
          indicate abuse, rate limiting failure, or
          an expensive runaway prompt

# Fallback rate (Claude -> OpenAI)
# Derived from wrench_ai_requests_total:
rate(wrench_ai_requests_total{fallback="true"}[5m])
/
rate(wrench_ai_requests_total[5m])
* 100
alert: fallback rate > 5% sustained 10 min
```

### RAG pipeline metrics

```
# Similarity search duration
wrench_rag_search_duration_seconds
  type:   histogram
  labels: instance (primary/replica)
  SLO:    p95 < 80ms (ADR-002 migration trigger)

# Chunks retrieved per request
wrench_rag_chunks_retrieved
  type:   histogram
  labels: source_type
  use:    average chunks per request over time
  why:    sudden drop = retrieval problem
          sudden spike = prompt too large

# Embedding generation duration
wrench_embedding_generation_duration_seconds
  type:   histogram
  labels: source_type
  use:    p95 latency of OpenAI embedding calls

# Embedding cache hit rate
wrench_embedding_cache_hits_total
wrench_embedding_cache_misses_total
  type:   counter
  use:    hits / (hits + misses) * 100
  target: > 80% hit rate (embeddings rarely change)
```

### Database metrics

```
# Query duration
wrench_db_query_duration_seconds
  type:   histogram
  labels: query_name, instance (primary/replica)
  alert:  p95 > 100ms on primary

# Connection pool
wrench_db_pool_connections_active
wrench_db_pool_connections_idle
wrench_db_pool_connections_waiting
  type:   gauge
  labels: instance (primary/replica)
  alert:  waiting > 0 sustained 5 min (pool exhausted)

# Replica lag
wrench_replica_lag_ms
  type:   gauge
  labels: replica_id
  alert:  > 200ms sustained 5 min (ADR-004)

# Replica fallback events
wrench_replica_fallback_total
  type:   counter
  alert:  rate > 0 sustained 5 min
```

### Cache metrics

```
# Cache operations
wrench_cache_hits_total
wrench_cache_misses_total
  type:   counter
  labels: cache_key_pattern
  use:    hits / (hits + misses) * 100
  target: > 80% hit rate for car profile cache

# Rate limit hits
wrench_rate_limit_hits_total
  type:   counter
  labels: endpoint, limit_type (user/ip)
  use:    spike detection for abuse
```

---

## 5. Distributed Tracing

### How trace propagation works

```
Every request creates a ROOT SPAN when it
enters the HTTP middleware:

func TracingMiddleware(tracer trace.Tracer) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(
            w http.ResponseWriter, r *http.Request,
        ) {
            ctx, span := tracer.Start(r.Context(),
                fmt.Sprintf("%s %s", r.Method, r.URL.Path))
            defer span.End()

            // Inject trace_id into the zerolog context
            // so every log line contains the trace_id
            log := zerolog.Ctx(ctx).With().
                Str("trace_id", span.SpanContext().TraceID().String()).
                Str("request_id", generateRequestID()).
                Logger()
            ctx = log.WithContext(ctx)

            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

Every function that does meaningful work creates
a CHILD SPAN by calling tracer.Start(ctx, name).
The ctx carries the parent trace_id — child spans
are automatically nested under the parent.

When the Go API makes an outbound HTTP call
(to Claude, OpenAI, Cloudinary), the OTel HTTP
client automatically injects the traceparent header:

```
traceparent: 00-{trace_id}-{parent_span_id}-01
```

If the external service also uses OTel, its
internal spans appear nested in Grafana Tempo.
If not (most external APIs), the call appears
as a black-box span showing only duration.

### Spans instrumented

```
HTTP layer (automatic via middleware):
  method, path, status_code, duration_ms,
  user_id, car_id, request_id, trace_id

Auth middleware:
  jwt_validation_duration_ms
  jwt_valid (bool)

Rate limit middleware:
  rate_limit_check_duration_ms
  rate_limit_hit (bool)

RAG pipeline:
  embed_question:
    model, input_length, duration_ms, cached (bool)

  pgvector_search:
    car_id, source_types, chunks_retrieved,
    similarity_scores, duration_ms, instance

  build_prompt:
    total_tokens, context_tokens, duration_ms

  claude_api_call:
    model, input_tokens, output_tokens,
    time_to_first_token_ms, duration_ms,
    fallback (bool), stream (bool)

Database (automatic via pgx OTel plugin):
  query_name, duration_ms, rows_affected,
  instance (primary/replica)

Redis (automatic via go-redis OTel plugin):
  command, key_pattern, hit/miss, duration_ms

Cloudinary (manual instrumentation):
  upload_type, file_size_bytes, duration_ms,
  transformation_applied (bool)
```

### Investigating an incident with traces

```
STEP 1: Find the failing request in Loki
{service="wrench-api"}
  | json
  | status_code >= 500
  | timestamp >= "2026-07-13T19:00:00Z"

STEP 2: Copy the trace_id from the log line

STEP 3: Paste into Grafana Tempo trace search

STEP 4: View the full trace tree
Identify which span has:
  → Highest duration (where time was spent)
  → Error status (where failure occurred)
  → Unexpected attributes (wrong data)

STEP 5: Click into the problematic span
Read span attributes to understand the exact
state of the system at that moment.

For AI wrong-answer investigations:
Click pgvector_search span:
  → chunks_retrieved: 5
  → chunk_ids: [embed-001, embed-007, ...]
Query Postgres with chunk_ids to read the
exact context that was sent to Claude.
This tells you exactly WHY Claude gave
the answer it did.
```

---

## 6. Dashboards

### Dashboard 1 — API Health (always-on overview)

```
Purpose: answer "is Wrench healthy right now?"
Refresh: every 30 seconds
Audience: on-call engineer

Panels:
[1] Request rate (RPS) — last 1 hour
    rate(wrench_http_requests_total{path!="/health"}[5m])

[2] Error rate (%) — last 1 hour
    ALERT LINE at 0.5% (SLO threshold)

[3] p50 / p95 / p99 latency — last 1 hour
    Three lines on one graph
    ALERT LINE at 500ms p95 (CRUD SLO)

[4] Active connections per pod — live gauge
    ALERT LINE at 400 (autoscaling trigger)

[5] Kong rejection rate — requests rejected
    before reaching Go API (rate limit hits,
    channel token failures)

[6] Pod health grid — green/red per pod
    (Kubernetes liveness probe status)
```

### Dashboard 2 — AI Assistant Performance

```
Purpose: answer "how is the AI working right now?"
Refresh: every 1 minute
Audience: on-call engineer, product team

Panels:
[1] AI request rate and status breakdown
    Stacked: success / error / rate_limited

[2] AI response latency p50/p95 — last 1 hour
    ALERT LINE at 10s p95 (AI latency SLO)

[3] Time to first token p50/p95 — last 1 hour
    ALERT LINE at 3s p95

[4] Claude API cost per hour and per day
    increase(wrench_claude_api_cost_usd_total[1h])
    ALERT LINE at 2x 7-day average for same hour

[5] Token usage: input vs output per hour
    Ratio tells you: is context getting larger?
    (input_tokens growing = RAG context bloating)

[6] Fallback rate (Claude → OpenAI) — %
    ALERT LINE at 5%

[7] RAG search latency p95
    ALERT LINE at 80ms (ADR-002 migration trigger)

[8] Embedding cache hit rate
    TARGET LINE at 80%
```

### Dashboard 3 — Infrastructure

```
Purpose: answer "what is the infrastructure doing?"
Refresh: every 1 minute
Audience: on-call engineer, platform team

Panels:
[1] DB connection pool utilisation — primary + replicas
    wrench_db_pool_connections_active /
    total_pool_size * 100
    ALERT LINE at 90%

[2] Replica replication lag — ms
    wrench_replica_lag_ms per replica
    ALERT LINE at 200ms (ADR-004)

[3] Replica fallback rate
    wrench_replica_fallback_total rate

[4] Cache hit rate by key pattern
    ALERT LINE at 70% (below this = Redis problem)

[5] Redis memory usage
    (from Redis INFO command, exposed as gauge)

[6] PgBouncer pool wait queue depth
    wrench_db_pool_connections_waiting
    ALERT LINE at 1 (any waiting = investigate)

[7] API pod memory utilisation
    container_memory_usage_bytes / limit
    ALERT LINE at 70% (autoscaling trigger)
```

---

## 7. Alerting Rules

All alerts follow multi-window multi-burn-rate
alerting from Google SRE Workbook.

### Tier 1 — Page immediately (24/7 on-call)

```
ALERT: SLO_FastBurn
Condition: burn_rate > 14.4x for 5 minutes
Meaning: at this rate, monthly error budget
         exhausted in ~2 days
Action: wake on-call engineer immediately

ALERT: AIServiceDown
Condition: rate(wrench_ai_requests_total{
             status="success"}[5m]) == 0
           AND rate(wrench_ai_requests_total[5m]) > 0
Meaning: AI requests arriving but none succeeding
         (not just low traffic)
Action: check Claude API status, check fallback

ALERT: DatabasePrimaryDown
Condition: wrench_db_query_duration_seconds{
             instance="primary"} == NaN
           (no data = primary not responding)
Action: check Neon dashboard, verify failover
```

### Tier 2 — Slack notification (business hours + on-call aware)

```
ALERT: SLO_SlowBurn
Condition: burn_rate > 6x for 30 minutes
Meaning: budget burning faster than sustainable
         but not immediately critical
Action: investigate during business hours
        or if on-call has capacity

ALERT: AILatencyHigh
Condition: p95 AI latency > 10s for 10 minutes
Action: check Claude API status page
        check if prompt size increased
        check if fallback is working

ALERT: ClaudeCostSpike
Condition: increase(wrench_claude_api_cost_usd_total[1h])
           > 2 * avg_over_time(
               increase(wrench_claude_api_cost_usd_total[1h])[7d:1h]
             )
Meaning: this hour's cost is more than 2x
         the same hour over the last 7 days
Action: check for abuse, check rate limit
        counter in Redis, check logs

ALERT: ReplicaLagHigh
Condition: wrench_replica_lag_ms > 200 for 5 minutes
Action: investigate replica health in Neon
        consider routing all reads to primary

ALERT: AuthBruteForce
Condition: rate(wrench_rate_limit_hits_total{
             endpoint="/auth/login"}[5m]) > 10
Meaning: > 10 rate limit hits per second on login
         likely coordinated brute force attempt
Action: investigate IPs in logs, consider
        temporary IP block at Kong

ALERT: CacheHitRateLow
Condition: cache_hit_rate < 70% for 15 minutes
Action: check Redis memory, check for
        unexpected cache invalidation pattern
```

---

## 8. SLOs and Error Budgets

### Defined SLOs

```
SLO 1: CRUD API Availability
SLI:   non-5xx rate on CRUD endpoints (not /chat)
Target: >= 99.5% over 30 days rolling
Budget: 0.5% = 3.6 hours of full outage per month

SLO 2: CRUD API Latency
SLI:   % of CRUD requests completing < 500ms
Target: >= 99% over 30 days rolling

SLO 3: AI Assistant Availability
SLI:   non-error rate on /chat endpoint
Target: >= 99% over 30 days rolling
Budget: 1% = 7.2 hours per month
Note:  lower target than CRUD (external dependency
       on Claude means less control over failures)

SLO 4: AI Assistant Latency
SLI:   % of AI requests completing < 10s
Target: >= 95% over 30 days rolling
Note:  lower target and higher threshold because
       AI inference time is variable and partially
       outside Wrench's control
```

### Error budget burn rate alerts

```
Fast burn (1h window):
burn_rate = current_error_rate / (1 - SLO_target)

At SLO 99.5%: (1 - 0.995) = 0.005 allowed error rate
If current error rate = 0.072 (7.2%):
burn_rate = 0.072 / 0.005 = 14.4x

14.4x for 1 hour = 2% of monthly budget consumed
Page immediately.

Slow burn (6h window):
6x burn rate for 6 hours = check Slack, investigate

Budget consumption formula:
daily_budget_consumed =
  (actual_error_rate - slo_target) / (1 - slo_target)
  * (1/30)  -- fraction of monthly budget per day

On day 20 with 50% budget consumed:
burn_rate = (50% / 66% elapsed) = 0.76x
Under budget — good position.
```

### Monthly error budget review

```
At end of every month:
1. How much budget was consumed? (target: < 100%)
2. What were the top 3 incidents that consumed budget?
3. Were incidents caused by Wrench code, infrastructure,
   or external dependencies (Claude, Neon)?
4. What reliability improvements are planned next month?
5. Is the SLO target still appropriate or should it
   be tightened/loosened?

Budget below 20% with 10 days remaining:
→ Feature freeze on risky changes
→ Focus on reliability work
→ Communicate status to product team
```

---

## 9. Incident Investigation Playbook

### First 5 minutes on-call

```
t=0min  Alert received
        Acknowledge (stop repeat pages)
        Open Grafana — Dashboard 1 (API Health)

t=1min  Three questions:
        What is the error rate?   (how bad)
        Which endpoints failing?  (where)
        How long has this been?   (scope)

t=2min  Narrow to layer:
        ALL endpoints → infrastructure (DB/Redis/pods)
        Only /chat    → AI layer (Claude/fallback)
        Only /auth    → primary DB or Redis
        One endpoint  → code bug or deploy issue

t=3min  Check the relevant layer:
        Infrastructure: Kubernetes pod status,
                        DB connection pool,
                        Redis availability
        AI layer:       anthropic.com/status,
                        fallback rate metric,
                        prompt size trend
        Auth:           primary DB ping,
                        Redis rate limit counters

t=4min  Decide: solo or page?
        Solo: single pod failure, vendor issue,
              known fix available
        Page: DB primary down, data integrity risk,
              unknown root cause after 4 min

t=5min  Communicate:
        Post in on-call Slack:
        "Investigating [error rate]% error rate
         since [time] on [endpoints].
         Suspected: [cause]. Update in 10 min."

t=6min+ Individual trace investigation
        (now you know what to look for)
```

### Pivoting from metrics to logs to traces

```
METRICS tell you: something is wrong
  → error rate > 1% on /chat endpoint

LOGS tell you: which requests are failing
  Loki query:
  {service="wrench-api"} | json
    | path =~ ".*/chat"
    | status_code >= 500
    | timestamp >= "..."
  → Find failing requests, get trace_ids

TRACES tell you: why those requests failed
  Copy trace_id → paste into Grafana Tempo
  → See every span, every duration, every error
  → Click the span with error status
  → Read span attributes to understand exact state
```

---

## 10. Cost Management via Observability

The Claude API cost is the single most
important financial metric in Wrench. The
observability stack makes it visible in
real time.

```
Real-time cost dashboard panel:
increase(wrench_claude_api_cost_usd_total[1h])

This shows cost in the last hour.
Run the query every minute.
Plot as a time series.

Alerts:
→ Hourly cost > 2x 7-day average: investigate
→ Daily cost > $500: page on-call

Cost attribution by feature (future):
Add a feature label to wrench_claude_api_cost_usd_total:
labels: model, feature (chat/vision/build_plan)

Then:
sum by (feature) (
  increase(wrench_claude_api_cost_usd_total[24h])
)
Shows which features are most expensive —
informs prioritisation of cost optimisation work.
```

---

## References

- ADR-006: OpenTelemetry vs custom observability
- dashboards-and-alerts.md: dashboard JSON exports
- slos.md: SLO definitions and error budget tracking
- failure-modes.md: failure runbooks
- Requirements: NFR-22 (structured logging),
  NFR-23 (distributed tracing), NFR-24 (dashboards),
  NFR-15 (AI cost monitoring)
- Google SRE Workbook Chapter 5: Alerting on SLOs
- OpenTelemetry Go SDK: https://opentelemetry.io/docs/go