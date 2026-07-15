# Wrench — Dashboards and Alerting

## Purpose

This document defines Wrench's Grafana dashboard
design and alerting rules — what panels exist,
why they are arranged as they are, every alert
rule with its PromQL query, tier classification,
owner, and runbook link.

Related: observability-design.md (metrics catalogue,
         SLOs, incident investigation playbook)

---

## 1. Dashboard Design Principles

### Three dashboards, one question each

Wrench has three dashboards. Each answers exactly
one question. An engineer should be able to answer
that question within 10 seconds of opening the
dashboard.

```
Dashboard 1 — API Health:
"Is Wrench healthy right now?"

Dashboard 2 — AI Assistant Performance:
"How is the AI feature performing?"

Dashboard 3 — Infrastructure:
"Is the underlying infrastructure healthy?"
```

Putting all panels on one dashboard creates
cognitive overload under pressure. At 2am during
an incident, an engineer scanning 20+ panels
wastes time finding the relevant signal. Three
focused dashboards create an investigation
hierarchy: start at Dashboard 1, drill to 2 or 3
based on what Dashboard 1 shows.

### Always-on vs incident dashboards

```
ALWAYS-ON (Dashboard 1):
Designed to be glanced at every few minutes.
Possibly displayed on a TV screen.

Design requirements:
→ 6 panels maximum
→ Large text — readable from across a room
→ Binary signal: green / red
→ Refresh: every 30 seconds
→ Time window: last 1 hour
→ Alert threshold lines on every graph
→ Answers "is there a problem?" not "what is it?"

INCIDENT (Dashboards 2 and 3):
Designed to be studied during active investigation.

Design requirements:
→ 8-10 panels acceptable
→ Detailed breakdowns by label
→ Longer time window: last 3-6 hours
  (to see when the problem started)
→ Week-over-week comparison panels
→ Refresh: every 1-2 minutes
→ Answers "what exactly is the problem?"
```

---

## 2. Dashboard 1 — API Health

```
Purpose:   Always-on health overview
Refresh:   30 seconds
Time range: Last 1 hour
Audience:  On-call engineer, anyone on the team
```

### Panel 1 — Request rate (RPS)

```
Title:   Request Rate
Type:    Time series graph
Query:
  sum(rate(wrench_http_requests_total{
    path!="/health"
  }[5m]))

Threshold line: none (informational)
Why exclude /health: Kong polls /health every 3s
  generating noise that inflates the true
  user request rate
```

### Panel 2 — Error rate (%)

```
Title:   Error Rate
Type:    Time series graph
Query:
  sum(rate(wrench_http_requests_total{
    status_code=~"5..",
    path!="/health"
  }[5m]))
  /
  sum(rate(wrench_http_requests_total{
    path!="/health"
  }[5m]))
  * 100

Threshold lines:
  GREEN → YELLOW at 0.1% (approaching SLO)
  YELLOW → RED at 0.5% (SLO breach threshold)

This is the most important panel on the dashboard.
Red here = page immediately.
```

### Panel 3 — Latency p50 / p95 / p99

```
Title:   Request Latency
Type:    Time series graph (3 lines)
Queries:
  p50: histogram_quantile(0.50,
         sum by (le)(
           rate(wrench_http_request_duration_seconds_bucket[5m])
         ))

  p95: histogram_quantile(0.95,
         sum by (le)(
           rate(wrench_http_request_duration_seconds_bucket[5m])
         ))

  p99: histogram_quantile(0.99,
         sum by (le)(
           rate(wrench_http_request_duration_seconds_bucket[5m])
         ))

Threshold line: 500ms on p95 (CRUD SLO target)

Why three lines:
p50 (median) shows typical user experience.
p95 shows what 95% of users experience.
p99 shows the worst-affected users.
A gap between p95 and p99 = a small number
of users having a very bad experience.
```

### Panel 4 — Active connections per pod

```
Title:   Active Connections
Type:    Gauge (live value)
Query:
  wrench_http_active_connections

Threshold:
  GREEN → YELLOW at 300
  YELLOW → RED at 400

Why this panel:
Connections (not CPU) is the scaling metric
for Wrench's SSE-heavy AI workload.
Little's Law: L = RPS × avg_duration
30 RPS × 9s SSE = 270 concurrent connections.
Above 400 = approaching file descriptor limits.
This panel is the autoscaling signal.
```

### Panel 5 — Kong rejection rate

```
Title:   Perimeter Rejections
Type:    Time series graph
Query:
  rate(kong_http_requests_total{
    status=~"4.."
  }[5m])

Why this panel:
Requests rejected by Kong before reaching Go API.
A sudden spike here means:
→ Rate limit attack (channel token misuse)
→ Misconfigured client flooding the API
→ Security incident

Complements the error rate panel:
Error rate panel = failures that reached Go API
This panel = failures stopped at the perimeter
```

### Panel 6 — Pod health grid

```
Title:   Pod Status
Type:    Status grid (green/red per pod)
Query:   kube_pod_status_ready{
           namespace="wrench",
           pod=~"wrench-api-.*"
         }

Shows all 6 pods (AZ-1: 3, AZ-2: 3).
One red pod = investigate but not urgent
  (Kong already ejected it, others serving traffic)
Multiple red pods = page immediately
All red = complete outage
```

---

## 3. Dashboard 2 — AI Assistant Performance

```
Purpose:   AI feature health and cost monitoring
Refresh:   1 minute
Time range: Last 3 hours (default), adjustable
Audience:  On-call engineer, product team
```

### Panel 1 — AI request rate by status

```
Title:   AI Requests by Status
Type:    Stacked bar chart
Queries:
  Success: rate(wrench_ai_requests_total{status="success"}[5m])
  Error:   rate(wrench_ai_requests_total{status="error"}[5m])
  Limited: rate(wrench_ai_requests_total{status="rate_limited"}[5m])

Three stacked bars per time point.
Rate limited growing = users hitting their quota
  (normal, expected)
Error growing = Claude or fallback having issues
  (investigate)
```

### Panel 2 — AI response latency p50/p95

```
Title:   AI Response Latency
Type:    Time series graph
Queries:
  p50: histogram_quantile(0.50,
         sum by (le)(
           rate(wrench_ai_request_duration_seconds_bucket[5m])
         ))

  p95: histogram_quantile(0.95,
         sum by (le)(
           rate(wrench_ai_request_duration_seconds_bucket[5m])
         ))

Threshold lines:
  p95 at 8s (WARNING)
  p95 at 10s (SLO breach — alert fires)
```

### Panel 3 — Time to first token p50/p95

```
Title:   Time to First Token
Type:    Time series graph
Query:
  p95: histogram_quantile(0.95,
         sum by (le)(
           rate(wrench_ai_time_to_first_token_seconds_bucket[5m])
         ))

Threshold: 3s on p95 (SLO target)

Why this metric matters:
Streaming means users see tokens appear at
first_token_time, not at completion_time.
A user watching tokens appear at 0.5s has
a completely different experience from one
staring at a spinner for 4.8s.
This is the UX-relevant AI latency metric.
If end-to-end latency is high but first token
is fast: Claude is thinking + streaming normally.
If first token is slow: Claude has not started
responding — investigate Claude status.
```

### Panel 4 — Claude API cost per hour

```
Title:   Claude API Cost ($/hour)
Type:    Time series graph
Query:
  increase(wrench_claude_api_cost_usd_total[1h])

Comparison line (week-over-week):
  increase(wrench_claude_api_cost_usd_total[1h] offset 7d)

Why week-over-week:
Monday morning shows higher AI usage than
3am Sunday. Comparing against a 7-day average
produces false positives on normal patterns.
Comparing against the same hour last week
detects genuine anomalies while tolerating
recurring patterns.

Threshold:
Alert fires when current hour > 2x same hour
last week AND absolute cost > $50.
The $50 floor prevents alerting on ratios
of tiny numbers ($0.10 vs $0.21).
```

### Panel 5 — Token usage: input vs output

```
Title:   Token Usage (input vs output)
Type:    Time series graph
Queries:
  Input:  rate(wrench_ai_tokens_total{type="input"}[5m])
  Output: rate(wrench_ai_tokens_total{type="output"}[5m])

Why this panel:
Input tokens are the RAG context + user message.
Output tokens are Claude's response.

Input growing faster than output:
→ RAG context is getting larger (more chunks retrieved)
→ Prompts are getting more expensive
→ Investigate: is the retrieval threshold too low?

Output growing faster than input:
→ Claude is generating longer responses
→ Usually good (more helpful) but costs more
```

### Panel 6 — Fallback rate (Claude → OpenAI)

```
Title:   AI Fallback Rate
Type:    Time series graph
Query:
  rate(wrench_ai_requests_total{fallback="true"}[5m])
  /
  rate(wrench_ai_requests_total[5m])
  * 100

Threshold: 5% (alert fires — Slack notification)

0% = all requests served by Claude (normal)
Spike to 100% = Claude circuit breaker open,
all traffic on OpenAI (investigate Claude status)
```

### Panel 7 — RAG search latency p95

```
Title:   RAG Search Latency
Type:    Time series graph
Query:
  histogram_quantile(0.95,
    sum by (le)(
      rate(wrench_rag_search_duration_seconds_bucket[5m])
    ))

Threshold:
  80ms — ADR-002 migration trigger
  (approaching this = evaluate Qdrant migration)
```

### Panel 8 — Embedding cache hit rate

```
Title:   Embedding Cache Hit Rate
Type:    Gauge (%)
Query:
  rate(wrench_embedding_cache_hits_total[5m])
  /
  (rate(wrench_embedding_cache_hits_total[5m])
  + rate(wrench_embedding_cache_misses_total[5m]))
  * 100

Target: > 80%
Below 70% = Slack notification (investigate Redis)
```

---

## 4. Dashboard 3 — Infrastructure

```
Purpose:   Database, cache, and pod resource health
Refresh:   1 minute
Time range: Last 3 hours
Audience:  On-call engineer, platform team
```

### Panel 1 — DB connection pool utilisation

```
Title:   PgBouncer Pool Utilisation
Type:    Time series graph
Queries:
  Active:  wrench_db_pool_connections_active
  Waiting: wrench_db_pool_connections_waiting
  Idle:    wrench_db_pool_connections_idle

Threshold: active > 18 of 20 pool size (90%)
Alert: waiting > 0 for 5 minutes
(goroutines queuing for connections =
pool is exhausted = investigate slow queries)
```

### Panel 2 — Replica replication lag

```
Title:   Replica Lag
Type:    Time series graph
Query:
  wrench_replica_lag_ms

One line per replica (replica_id label).

Threshold:
  100ms — WARNING
  200ms — CRITICAL (alert fires, Slack)

ADR-004: if lag > 200ms sustained, consider
routing all reads to primary temporarily.
```

### Panel 3 — DB query latency p95

```
Title:   DB Query Latency
Type:    Time series graph
Query:
  histogram_quantile(0.95,
    sum by (le, instance)(
      rate(wrench_db_query_duration_seconds_bucket[5m])
    ))

Two lines: primary and replica.
Primary p95 spiking = slow queries competing
with writes, investigate with EXPLAIN ANALYZE.
Replica p95 spiking = RAG searches expensive,
consider index tuning or Qdrant migration.
```

### Panel 4 — Redis memory usage

```
Title:   Redis Memory
Type:    Gauge (%)
Query:   redis_memory_used_bytes / redis_memory_max_bytes * 100

Threshold:
  70% — WARNING
  85% — CRITICAL

Redis evicts keys when memory is full.
Evicted rate limit counters = rate limiting
fails silently (fail-open per ADR-003).
Evicted cache entries = thundering herd on DB.
```

### Panel 5 — Cache hit rate by key pattern

```
Title:   Cache Hit Rate
Type:    Time series graph
Queries (by key pattern):
  Car profile:  rate(wrench_cache_hits_total{
                  key_pattern="car:*:profile"}[5m])
                / total * 100

  Car list:     rate(wrench_cache_hits_total{
                  key_pattern="user:*:cars"}[5m])
                / total * 100

Target: > 80% on both
Sudden drop = Redis issue or cache invalidation bug
```

### Panel 6 — Pod memory utilisation

```
Title:   Pod Memory
Type:    Time series graph (one line per pod)
Query:
  container_memory_usage_bytes{
    namespace="wrench",
    container="wrench-api"
  }
  /
  container_spec_memory_limit_bytes{
    namespace="wrench",
    container="wrench-api"
  }
  * 100

Threshold:
  70% — autoscaling trigger (add pods)
  85% — WARNING (approaching OOM kill)

Memory grows with open SSE connections.
Consistent growth = SSE connections accumulating
  (investigate: are streams closing correctly?)
Sudden spike = memory leak (check recent deploys)
```

### Panel 7 — Rate limit hit rate

```
Title:   Rate Limit Hits
Type:    Time series graph
Queries:
  AI limit:   rate(wrench_rate_limit_hits_total{
                endpoint="/chat", type="user"}[5m])

  Auth limit: rate(wrench_rate_limit_hits_total{
                endpoint="/auth/login", type="ip"}[5m])

AI limit spikes = users hitting quota (normal)
Auth limit spikes = potential brute force (investigate)
```

---

## 5. Alert Rules

### Alert quality checklist

Every alert in this document meets all criteria:

```
✓ Fires on a real user-impacting condition
✓ Is actionable (engineer can DO something)
✓ Has a clear owner (on-call rotation)
✓ Links to a runbook
✓ Avoids false positives (sustained duration,
  week-over-week comparison, minimum thresholds)
✓ Has the correct tier
✓ Has been tested in staging
```

### Tier 1 — Page immediately

These alerts wake the on-call engineer regardless
of time. Every minute of delay causes user harm.

---

**ALERT: SLO_FastBurn**

```
Condition:
  (
    sum(rate(wrench_http_requests_total{
      status_code=~"5..", path!="/health"}[1h]))
    /
    sum(rate(wrench_http_requests_total{
      path!="/health"}[1h]))
  ) / 0.005 > 14.4

Duration:  5 minutes
Severity:  critical
Owner:     on-call-engineer (PagerDuty rotation)
Runbook:   /docs/runbooks/slo-fast-burn.md

Message:
"SLO fast burn: error budget exhausting at >14.4x rate.
 At this rate, monthly budget exhausted in ~2 days.
 Check Dashboard 1 immediately."

Why 14.4x:
Consuming 2% of monthly error budget in 1 hour.
1 hour × 14.4 × (1/720 month hours) = 2% budget.
Page-worthy because at this rate SLO breaches within days.
```

---

**ALERT: HighErrorRate**

```
Condition:
  sum(rate(wrench_http_requests_total{
    status_code=~"5..", path!="/health"}[5m]))
  /
  sum(rate(wrench_http_requests_total{
    path!="/health"}[5m]))
  * 100 > 20

Duration:  3 minutes
Severity:  critical
Owner:     on-call-engineer
Runbook:   /docs/runbooks/high-error-rate.md

Message:
"Error rate above 20% for 3 minutes.
 Users are actively being denied service.
 Check Dashboard 1 → which endpoints failing?"

Why 20% threshold (not 0.5% SLO):
The SLO alert (SLO_FastBurn) handles gradual
drift. This alert catches catastrophic failures
quickly (45% error rate = page in 3 minutes,
not after the burn rate calculation catches up).
```

---

**ALERT: AIServiceDown**

```
Condition:
  rate(wrench_ai_requests_total{status="success"}[5m]) == 0
  AND
  rate(wrench_ai_requests_total[5m]) > 0.1

Duration:  5 minutes
Severity:  critical
Owner:     on-call-engineer
Runbook:   /docs/runbooks/ai-service-down.md

Message:
"AI assistant returning zero successful responses.
 Requests are arriving but all failing.
 Check: anthropic.com/status, fallback rate,
 circuit breaker state."

Why AND condition:
Prevents false positive during low-traffic periods
where the metric may be 0 simply because no
requests arrived. The second condition ensures
requests ARE arriving but failing.
```

---

**ALERT: DatabasePrimaryDown**

```
Condition:
  absent(wrench_db_query_duration_seconds_count{
    instance="primary"
  })

Duration:  2 minutes
Severity:  critical
Owner:     on-call-engineer
Runbook:   /docs/runbooks/database-failure.md

Message:
"No DB query metrics from primary instance.
 Primary may be down. Check Neon dashboard.
 Neon auto-failover takes 30-60 seconds.
 Writes are failing until failover completes."

Why absent():
If the primary is down, no metrics are emitted.
absent() fires when a metric that should exist
has not been seen recently.
```

---

**ALERT: AuthBruteForce**

```
Condition:
  rate(wrench_rate_limit_hits_total{
    endpoint="/auth/login",
    type="ip"
  }[5m]) > 10

Duration:  5 minutes
Severity:  critical
Owner:     on-call-engineer
Runbook:   /docs/runbooks/auth-brute-force.md

Message:
"Auth rate limit hitting >10 times/second.
 Possible coordinated brute force attack.
 Check Loki for attacking IPs.
 Consider temporary IP block at Kong."
```

---

### Tier 2 — Slack notification

These alerts are investigated during business
hours or when the on-call engineer has capacity.
Service is degraded but not down.

---

**ALERT: SLO_SlowBurn**

```
Condition:
  (
    sum(rate(wrench_http_requests_total{
      status_code=~"5..", path!="/health"}[6h]))
    /
    sum(rate(wrench_http_requests_total{
      path!="/health"}[6h]))
  ) / 0.005 > 6

Duration:  30 minutes
Severity:  warning
Channel:   #wrench-alerts Slack
Runbook:   /docs/runbooks/slo-slow-burn.md

Message:
"SLO slow burn: error budget burning at >6x rate
 over 6 hours. Investigate before this becomes
 a Tier 1 incident."
```

---

**ALERT: AILatencyHigh**

```
Condition:
  histogram_quantile(0.95,
    sum by (le)(
      rate(wrench_ai_request_duration_seconds_bucket[5m])
    )) > 10

Duration:  10 minutes
Severity:  warning
Channel:   #wrench-alerts
Runbook:   /docs/runbooks/ai-latency.md

Message:
"AI response p95 latency above 10s SLO.
 Check: Claude API status page,
        prompt size (input_tokens trending up?),
        fallback rate (is OpenAI also slow?)."
```

---

**ALERT: ClaudeCostSpike**

```
Condition:
  increase(wrench_claude_api_cost_usd_total[1h])
  > 2 * increase(wrench_claude_api_cost_usd_total[1h] offset 7d)
  AND
  increase(wrench_claude_api_cost_usd_total[1h]) > 50

Duration:  immediate (no sustained duration)
Severity:  warning
Channel:   #wrench-alerts
Runbook:   /docs/runbooks/claude-cost-spike.md

Message:
"Claude API cost this hour is 2x same hour
 last week AND above $50. Check for abuse,
 verify rate limiting is working."

Why week-over-week (not 7-day average):
Compares Monday 9am against last Monday 9am.
Tolerates recurring patterns (Monday usage spikes)
while catching genuine anomalies at any time.
7-day average comparison causes false positives
on normal weekday vs weekend patterns.

Why $50 minimum threshold:
Prevents alerting on small ratios of tiny amounts
($0.10 vs $0.21 = 2.1x but irrelevant).
```

---

**ALERT: ReplicaLagHigh**

```
Condition:
  wrench_replica_lag_ms > 200

Duration:  5 minutes
Severity:  warning
Channel:   #wrench-alerts
Runbook:   /docs/runbooks/replica-lag.md

Message:
"Replica lag above 200ms (ADR-004 threshold).
 RAG searches may return slightly stale data.
 Check Neon replica health.
 Consider routing all reads to primary."
```

---

**ALERT: AIFallbackElevated**

```
Condition:
  rate(wrench_ai_requests_total{fallback="true"}[5m])
  /
  rate(wrench_ai_requests_total[5m])
  * 100 > 5

Duration:  10 minutes
Severity:  warning
Channel:   #wrench-alerts
Runbook:   /docs/runbooks/ai-fallback.md

Message:
"More than 5% of AI requests using OpenAI fallback.
 Claude API may be degraded.
 Check: anthropic.com/status."
```

---

**ALERT: CacheHitRateLow**

```
Condition:
  rate(wrench_cache_hits_total[5m])
  /
  (rate(wrench_cache_hits_total[5m])
  + rate(wrench_cache_misses_total[5m]))
  * 100 < 70

Duration:  15 minutes
Severity:  warning
Channel:   #wrench-alerts
Runbook:   /docs/runbooks/cache-hit-rate.md

Message:
"Cache hit rate below 70% for 15 minutes.
 Service degraded (slower) but not down.
 Check Redis memory, recent deployments,
 cache invalidation logs."
```

---

**ALERT: PgBouncerPoolExhausted**

```
Condition:
  wrench_db_pool_connections_waiting > 0

Duration:  5 minutes
Severity:  warning
Channel:   #wrench-alerts
Runbook:   /docs/runbooks/connection-pool.md

Message:
"Goroutines waiting for DB connections.
 PgBouncer pool may be exhausted.
 Check for slow queries holding connections.
 Pool size: 20 connections."
```

---

## 6. Complete Alert Reference

```
Alert                  Tier  Condition                 Action
----------------------------------------------------------------------
SLO_FastBurn           1     Burn rate > 14.4x 5min   Page immediately
HighErrorRate          1     Error rate > 20% 3min     Page immediately
AIServiceDown          1     Zero AI success 5min      Page immediately
DatabasePrimaryDown    1     Primary metrics absent     Page immediately
AuthBruteForce         1     Auth limit > 10/s 5min    Page + investigate

SLO_SlowBurn           2     Burn rate > 6x 30min      Slack
AILatencyHigh          2     AI p95 > 10s 10min        Slack
ClaudeCostSpike        2     2x week-over-week + $50   Slack
ReplicaLagHigh         2     Lag > 200ms 5min          Slack
AIFallbackElevated     2     Fallback > 5% 10min       Slack
CacheHitRateLow        2     Hit rate < 70% 15min      Slack
PgBouncerPoolExhausted 2     Waiting > 0 5min          Slack
```

---

## 7. Runbook Requirements

Every alert links to a runbook. Every runbook
must contain:

```
1. WHAT THIS ALERT MEANS
   Plain English explanation of the condition.
   What is failing and why it matters.

2. LIKELY CAUSES (in order of probability)
   Most common cause first.
   Each cause links to a diagnostic step.

3. DIAGNOSTIC STEPS
   Exact queries, dashboards, and commands
   to run. Not "check the database" but
   "run this Loki query, look for this pattern."

4. REMEDIATION STEPS
   Exact actions to take for each cause.
   Step-by-step, no assumed knowledge.

5. ESCALATION PATH
   Who to call if steps 1-4 don't resolve it.
   Name, role, and contact method.

6. RESOLUTION CRITERIA
   How do you know the incident is resolved?
   What metric returns to what value?
```

---

## References

- observability-design.md (metrics catalogue,
  trace investigation, SLO definitions)
- slos.md (error budget tracking and burn rate maths)
- failure-modes.md (failure runbooks referenced above)
- ADR-006: OpenTelemetry vs custom observability
- ADR-004: Read replica routing (replica lag thresholds)
- ADR-002: pgvector (RAG search latency threshold)
- ADR-003: Redis (cache hit rate targets, fail-open)
- Google SRE Workbook Chapter 5: Alerting on SLOs