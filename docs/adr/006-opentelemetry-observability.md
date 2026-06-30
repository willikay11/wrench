# ADR-006: Observability — OpenTelemetry vs Custom Solution

## Status
Accepted

## Date
2026-06-22

## Context
Wrench requires an observability stack that provides
visibility into system behaviour in production.
Without observability, diagnosing failures, debugging
performance issues, and understanding user-impacting
problems is guesswork.

The observability stack must cover three pillars:

**Pillar 1 — Logs:**
Structured records of what happened.
Every API request must produce a structured log
entry containing request_id, user_id, method,
path, status_code, and duration_ms (NFR-22).
Logs must never contain PII (email, name, VIN).

**Pillar 2 — Metrics:**
Numerical measurements of system behaviour over time.
Rate, error rate, and duration per endpoint
(the RED method). The four golden signals:
latency, traffic, errors, saturation.
Claude API cost tracked as a metric (NFR-15 cost
control depends on this).

**Pillar 3 — Traces:**
End-to-end records of individual requests as they
travel through the system. Every request must be
traceable from the Next.js frontend through Kong,
through the Go API, to the database, Redis, and
external AI APIs (NFR-23).

Three approaches were evaluated:
1. OpenTelemetry (OTel) with Grafana Cloud backend
2. Custom logging with fmt/zerolog only (no traces)
3. Datadog (fully managed observability platform)
4. Honeycomb (observability for complex systems)

The observability stack must be in place from
Sprint 2 (Week 4 of Month 1) — before application
features are built — so every feature ships with
instrumentation from day one.

## Decision
Use **OpenTelemetry (OTel) SDK** for instrumentation
with **Grafana Cloud** as the observability backend.
Use **zerolog** for structured logging.

### Architecture

```
Go API pods
  ↓ OTLP (gRPC or HTTP)
OpenTelemetry Collector (sidecar or agent)
  ↓ OTLP
Grafana Cloud
  ├── Grafana Tempo    (traces)
  ├── Grafana Mimir    (metrics / Prometheus-compatible)
  └── Grafana Loki     (logs)
  ↓
Grafana Dashboards + Alerting
```

### Instrumentation plan

**Traces — spans to instrument:**
```
HTTP request (root span):
  attributes: method, path, status_code,
              user_id, request_id, duration_ms

DB query (child span):
  attributes: query_name, duration_ms,
              db_instance (primary/replica),
              rows_returned

Redis operation (child span):
  attributes: command, key_pattern, hit/miss,
              duration_ms

Claude API call (child span):
  attributes: model, input_tokens, output_tokens,
              duration_ms, fallback (bool)

Embedding API call (child span):
  attributes: model, input_length,
              duration_ms, cached (bool)

RAG pipeline (child span):
  attributes: car_id, chunks_retrieved,
              similarity_scores, duration_ms
```

**Metrics — Prometheus format exported to Grafana Mimir:**
```
# Request metrics (RED method)
wrench_http_requests_total
  labels: method, path, status_code

wrench_http_request_duration_seconds (histogram)
  labels: method, path
  buckets: 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0

# AI metrics
wrench_ai_requests_total
  labels: status, model, fallback

wrench_ai_request_duration_seconds (histogram)
  labels: model

wrench_ai_tokens_total (counter)
  labels: type (input/output), model

wrench_claude_api_cost_usd_total (counter)
  labels: model
  note: critical for NFR-15 cost control

# Database metrics
wrench_db_query_duration_seconds (histogram)
  labels: query_name, instance (primary/replica)

wrench_db_pool_connections_active (gauge)
  labels: instance

# Cache metrics
wrench_cache_hits_total (counter)
  labels: cache_key_pattern

wrench_cache_misses_total (counter)
  labels: cache_key_pattern

wrench_replica_lag_ms (gauge)
  note: alert if > 200ms (see ADR-004)

# Embedding metrics
wrench_embeddings_generated_total (counter)
  labels: source_type

wrench_embedding_generation_duration_seconds (histogram)
```

**Structured logs — zerolog format:**
```json
{
  "level": "info",
  "timestamp": "2026-06-22T05:00:00Z",
  "request_id": "01HXYZ123ABC",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "method": "POST",
  "path": "/v1/cars/550e8400/chat",
  "status_code": 200,
  "duration_ms": 4821,
  "service": "wrench-api",
  "version": "1.2.3"
}
```

Log levels:
```
DEBUG: detailed flow information
       dev environment only — never in production
       example: "entering SimilaritySearch with carId=..."

INFO:  request completed, user action taken
       example: "POST /v1/cars/{id}/mods 201 45ms"

WARN:  recoverable error — system degraded but functional
       example: "Redis unavailable, falling back to Postgres"
       example: "Replica lag 180ms approaching threshold"

ERROR: unrecoverable error requiring attention
       example: "Claude API returned 500 after 3 retries"
       example: "DB primary connection pool exhausted"

NEVER log: email, displayName, car VIN, cost amounts,
           raw tokens, password hashes, API keys
```

### Dashboards

**Dashboard 1 — API Health (always-on overview):**
```
Panels:
- Request rate (RPS) by endpoint — last 1 hour
- Error rate % (5xx / total) — last 1 hour
- p50 / p95 / p99 latency by endpoint
- Active DB connections (primary + replica)
- Kong rate limit hit rate
```

**Dashboard 2 — AI Assistant Performance:**
```
Panels:
- AI request rate and error rate
- AI response latency p50/p95 (target: p95 < 8s)
- Time to first token p50/p95 (target: p95 < 3s)
- Claude API cost per hour and per day
- Token usage (input vs output) per hour
- Fallback rate (primary to secondary AI model)
- RAG retrieval duration p95
```

**Dashboard 3 — Infrastructure:**
```
Panels:
- DB connection pool utilisation (primary + replicas)
- Cache hit rate (target: > 80%)
- Redis memory usage
- Replica replication lag (target: < 200ms)
- Embedding generation rate
- API pod CPU and memory
```

### Alerting rules

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| High error rate | 5xx > 1% for 5 min | Critical | Page immediately |
| AI latency degraded | p95 > 10s for 10 min | High | Investigate + check Claude status |
| Claude cost spike | Hourly cost > 2x 7-day avg | High | Check for abuse |
| DB pool exhausted | Utilisation > 90% | High | Check for slow queries |
| Replica lag high | Lag > 200ms for 5 min | High | Investigate replica health |
| Cache hit rate low | Hit rate < 70% for 15 min | Medium | Check Redis memory |
| AI fallback elevated | Fallback rate > 5% | Medium | Check Claude API status |

### SLOs and error budgets

Defined and monitored in Grafana:

```
SLO 1: CRUD API availability
Target: 99.5% of CRUD requests return non-5xx
Window: 30 days rolling
Error budget: 0.5% = ~3.6 hours downtime/month

SLO 2: CRUD API latency
Target: 99% of CRUD requests complete < 500ms
Window: 30 days rolling

SLO 3: AI assistant latency
Target: 95% of AI requests complete < 10s
Window: 30 days rolling
Error budget: 5%

SLO 4: AI assistant availability
Target: 99% of AI requests return a response
Window: 30 days rolling
```

Error budget burn rate alerts:
```
Fast burn (1h window):  burn rate > 14.4x → page immediately
Slow burn (6h window):  burn rate > 6x    → Slack warning
```

## Reasoning

### Why OpenTelemetry

**Vendor neutrality:**
OpenTelemetry is a CNCF (Cloud Native Computing
Foundation) standard. Instrumentation written
with the OTel SDK works with any compatible
backend — Grafana Cloud, Datadog, Honeycomb,
Jaeger, Zipkin, or a self-hosted collector.

This means instrumentation is written once and
never needs to change if the backend changes.
If Grafana Cloud becomes too expensive at scale,
the backend switches without touching application
code. The OTel SDK calls stay identical.

Without OTel, switching from Datadog to Grafana
requires re-instrumenting every span, every
metric, and every trace in the codebase.

**Distributed tracing across services:**
A single AI chat request touches:
Kong → Go API → Postgres (primary) →
Redis → pgvector (replica) → OpenAI Embeddings →
Claude API

Without distributed tracing, diagnosing why a
specific request was slow requires correlating
logs across six separate systems by timestamp.
With OTel traces, one trace_id connects every
hop of the request into a single visualisation
showing exactly where time was spent.

This is the difference between:
"AI responses are slow — no idea why"
and:
"AI responses are slow — pgvector similarity
search is taking 340ms p95 on Tuesdays between
7-9pm when the replica is under high load"

**Industry standard:**
OTel is supported natively by Go, supported by
every major cloud provider, and expected knowledge
for senior engineers. Building observability
on OTel signals engineering maturity to any
future engineer or engineering team reviewing
the Wrench codebase.

**Cost of ~1-2ms overhead:**
OTel adds approximately 1-2ms per traced request
for span creation, attribute attachment, and
export. This is acceptable given CRUD API
latency targets of 200ms p95.

### Why Grafana Cloud as the backend

**Free tier covers launch:**
Grafana Cloud free tier includes:
- 50GB of logs per month
- 10,000 series of metrics
- 50GB of traces per month

At launch scale (10K users, 200K AI requests/day)
this covers all observability needs at zero cost.

**Unified stack:**
Grafana Cloud provides Loki (logs), Mimir (metrics),
and Tempo (traces) in one platform with unified
dashboards and alerting. No context switching
between multiple tools.

**Grafana dashboards:**
Grafana is the industry standard for operational
dashboards. Pre-built dashboard templates exist
for Go, Postgres, Redis, and Kong. Custom
dashboards for Wrench-specific metrics (Claude
API cost, RAG latency) are straightforward to build.

### Why zerolog for structured logging

zerolog is a zero-allocation JSON logger for Go.
Its performance characteristics are important
because logging happens on every request:

```
Comparison (operations per second):
zerolog:    ~10,000,000 ops/sec (zero allocations)
logrus:     ~1,500,000 ops/sec
zap:        ~7,000,000 ops/sec (comparable)
fmt.Println: ~500,000 ops/sec (not structured)
```

zerolog produces JSON output natively, matching
the structured log format required by NFR-22 and
ingested directly by Grafana Loki.

The trace_id from OTel is attached to every log
line, creating a direct link between logs and
traces for the same request.

## Consequences

### Positive
- Full distributed tracing from request entry to
  every external service call
- Vendor-neutral instrumentation — backend can
  change without re-instrumenting code
- Claude API cost tracked in real time via metric
  (critical for cost control at scale)
- Grafana Cloud free tier covers Year 1 at zero cost
- zerolog adds negligible performance overhead
- OTel is expected knowledge for senior engineers —
  signals engineering maturity
- SLO tracking and error budget burn rate alerts
  from day one

### Negative
- OTel SDK adds ~1-2ms overhead per request
  (accepted — within latency budget)
- Initial setup complexity: OTel collector
  configuration, Grafana dashboard creation,
  alert rule definition
- Grafana Cloud free tier limits may be reached
  as user base grows — evaluate at 50K users

## Migration Trigger
This decision is stable. The vendor-neutral nature
of OTel means the instrumentation itself never
needs to migrate — only the backend if costs
require it.

Evaluate migration of Grafana Cloud backend if:
1. Monthly observability cost exceeds $500
2. Log/trace volume exceeds free tier limits
   without a cost-justified upgrade

Migration path at that point:
1. Stand up self-hosted Grafana + Loki + Tempo
   + Mimir on a small instance
2. Update OTel collector export target
3. Zero application code changes required

## Alternatives Rejected

**Custom logging only (fmt/zerolog, no traces):**
Provides logs but no distributed traces and no
metrics. Diagnosing cross-service performance
issues (e.g. slow RAG pipeline) requires manually
correlating logs across six systems by timestamp.
Not viable for a production AI application where
latency composition across multiple services is
critical to understand. Rejected.

**Datadog:**
Fully managed, excellent product, industry leading.
Rejected because:
- Cost: Datadog pricing at 10 hosts with APM is
  approximately $400-800/month — not justified at
  launch stage
- Vendor lock-in: Datadog's SDK is proprietary.
  Switching away requires full re-instrumentation.
- OTel provides equivalent capability at zero cost
  with no lock-in.

**Honeycomb:**
Purpose-built for observability on complex systems.
Excellent query capabilities. Rejected because:
- Cost: similar to Datadog at scale
- Vendor lock-in: same concern as Datadog
- Grafana Cloud provides sufficient capability
  for Wrench's observability requirements at
  significantly lower cost

## References
- Observability design: /docs/observability-design.md
- SLO definitions: /docs/slos.md
- Requirements: NFR-22, NFR-23, NFR-24
- Related ADRs: ADR-003 (Redis), ADR-004 (replicas),
  ADR-008 (Kong)
- OpenTelemetry Go SDK: https://opentelemetry.io/docs/go
- Grafana Cloud: https://grafana.com/products/cloud
- Google SRE Book Chapter 4: Service Level Objectives
- Charity Majors: Observability vs Monitoring