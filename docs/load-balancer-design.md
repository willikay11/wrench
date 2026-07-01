# Wrench — Load Balancer Design

## Purpose

This document covers the complete load balancing
architecture for Wrench — from the DNS/Cloud L4
layer in front of Kong, through Kong's L7 load
balancing to the Go API pods, including health
check design, graceful shutdown, and connection
draining during rolling deployments.

Related ADR: [ADR-008 — Kong API Gateway](./adr/008-kong-api-gateway.md)

---

## 1. Architecture Overview

Wrench has two distinct load balancing layers,
each solving a different problem:

```
User
  ↓ HTTPS — api.wrench.ai
DNS / Cloud L4 Load Balancer
  ↓ TCP — distributes across Kong nodes
Kong API Gateway (2-node cluster, active/active)
  ↓ HTTP (private network)
Go API Pods × 3 (AZ-1)    Go API Pods × 3 (AZ-2)
```

### Layer 1 — DNS / Cloud L4 Load Balancer

**Problem it solves:** distributing traffic
across the two Kong nodes so neither Kong node
is a single point of failure.

**How it works:** DNS round-robin or a cloud
provider L4 (TCP-level) load balancer. Both
Kong nodes are identical and stateless — any
node can handle any request — so simple TCP-level
distribution is sufficient. No HTTP inspection,
no plugin execution, no session awareness needed
at this layer.

**Why L4 and not L7 here:** Kong itself is already
L7 (HTTP-aware). The layer in front of Kong only
needs to know "distribute connections across
these two IP addresses." That is an L4 concern.
Applying L7 logic twice (before Kong and inside
Kong) would add unnecessary complexity and latency
with no benefit.

### Layer 2 — Kong API Gateway (L7)

**Problem it solves:** distributing authenticated,
rate-limited, channel-verified HTTP requests
across the Go API pods in AZ-1 and AZ-2.

**Why L7 here:** Kong must inspect HTTP headers
(JWT, X-Channel-Token, Origin) and apply plugin
logic before routing. This requires understanding
the HTTP request — an L4 load balancer cannot do
this.

---

## 2. Kong Load Balancing Configuration

### Algorithm — least-connections

```
Kong upstream configuration:
algorithm: least-connections

Round-robin (alternative considered):
Distributes requests evenly by count —
request 1 → Pod A, request 2 → Pod B,
request 3 → Pod C, request 4 → Pod A...

Why round-robin is wrong for Wrench:
An SSE AI chat request holds a connection
open for 8-10 seconds. A CRUD request
completes in ~20ms.

With round-robin:
Pod A receives: 10 SSE streams (80-100s of load)
Pod B receives: 10 CRUD requests (0.2s of load)
Next request → Pod A (it's "Pod A's turn")

Pod A is overwhelmed. Pod B is idle.
Round-robin distributes REQUEST COUNT evenly,
not LOAD evenly.

Least-connections:
Kong tracks how many active connections each
pod currently holds (using Little's Law implicitly)
and always routes the next request to the pod
with the fewest active connections.

Pod A: 10 SSE streams → 10 connections
Pod B: 10 CRUD requests → already completed,
                           0 connections
Next request → Pod B ✓

Least-connections distributes LOAD evenly,
accounting for the fact that different request
types hold connections for different durations.
```

### Upstream pool configuration

```yaml
# Kong upstream — Go API pods
upstream:
  name: wrench-api
  algorithm: least-connections
  healthchecks:
    active:
      healthy:
        interval: 3        # poll every 3 seconds
        successes: 2       # 2 consecutive successes
                           # to mark healthy
      unhealthy:
        interval: 1        # poll every 1 second
                           # when pod is unhealthy
        http_failures: 2   # 2 failures to mark
                           # unhealthy
    passive:
      unhealthy:
        http_statuses: [503, 504, 502]
        http_failures: 1   # 1 failure immediately
                           # ejects from pool

  targets:
    - target: 10.0.1.1:8080  # AZ-1 Pod 1
    - target: 10.0.1.2:8080  # AZ-1 Pod 2
    - target: 10.0.1.3:8080  # AZ-1 Pod 3
    - target: 10.0.2.1:8080  # AZ-2 Pod 1
    - target: 10.0.2.2:8080  # AZ-2 Pod 2
    - target: 10.0.2.3:8080  # AZ-2 Pod 3
```

---

## 3. Health Check Design

Wrench uses both active and passive health checks
in combination. Each solves a different detection
speed problem.

### Active health checks (scheduled polling)

Kong polls the health endpoint on every pod
on a fixed interval:

```
GET /health HTTP/1.1
Host: 10.0.1.1:8080

Healthy response (200):
{
  "status": "healthy",
  "db": "connected",
  "redis": "connected",
  "version": "1.2.3"
}

Unhealthy response (503):
{
  "status": "unhealthy",
  "db": "connected",
  "redis": "timeout"
}
```

**Health check endpoint design:**

The `/health` endpoint checks three things:
1. The Go API process itself is running
   (if this endpoint responds at all, it is)
2. Postgres primary is reachable (fast ping query)
3. Redis is reachable (fast PING command)

```go
func (h *HealthHandler) Health(
    w http.ResponseWriter, r *http.Request) {

    status := HealthStatus{Version: h.version}

    // Check Postgres
    if err := h.db.Primary.Ping(r.Context()); err != nil {
        status.DB = "disconnected"
        status.Status = "unhealthy"
    } else {
        status.DB = "connected"
    }

    // Check Redis
    if err := h.cache.Ping(r.Context()); err != nil {
        status.Redis = "disconnected"
        status.Status = "unhealthy"
    } else {
        status.Redis = "connected"
    }

    if status.Status == "" {
        status.Status = "healthy"
    }

    code := http.StatusOK
    if status.Status == "unhealthy" {
        code = http.StatusServiceUnavailable
    }

    // During graceful shutdown, this returns 503
    // regardless of DB/Redis status
    if h.isShuttingDown.Load() {
        status.Status = "shutting_down"
        code = http.StatusServiceUnavailable
    }

    w.WriteHeader(code)
    json.NewEncoder(w).Encode(status)
}
```

**Why check DB and Redis in the health endpoint:**

A pod that is running but cannot reach Postgres
will fail every request anyway. Kong should
not route to it. The health check surfaces
infrastructure problems — not just process
liveness — so Kong's routing decisions are
based on a pod's actual ability to serve requests,
not just whether the process is alive.

**Active health check interval rationale:**

```
Normal (healthy pod): poll every 3 seconds
  → Acceptable detection lag for planned events
    (deployments, intentional pod termination)
  → Low overhead (one lightweight request per
    pod per 3 seconds)

Recovering (recently unhealthy): poll every 1s
  → Faster detection when a pod recovers
  → Minimises time a recovered pod sits idle
    while Kong doesn't know it's healthy yet
```

### Passive health checks (real traffic detection)

Kong watches every real response from every pod.
If a pod returns a configurable list of error
status codes on real traffic, Kong ejects it
from the upstream pool immediately — no waiting
for the next scheduled poll.

```
Passive detection:
Pod returns 503 on a real request
→ Kong ejects Pod A from pool immediately
→ Detection latency: milliseconds
→ No 3-second gap

Active detection:
Pod's health check returns 503
→ Kong ejects Pod A from pool on next poll
→ Detection latency: up to 3 seconds

Combined: Passive is the fast path.
Active is the safety net for pods that
stop responding to real traffic entirely
(process crash, OOM kill, network partition).
```

---

## 4. Retry Configuration

Requests that hit a pod during its shutdown window
are retried automatically on a healthy pod. From
the user's perspective, the request succeeds with
a few milliseconds of additional latency.

```yaml
# Kong service configuration
service:
  name: wrench-api
  retries: 1                    # retry once on failure
  connect_timeout: 60000        # 60s connect timeout
  write_timeout: 60000          # 60s write timeout
                                # (covers SSE streams)
  read_timeout: 60000           # 60s read timeout
```

```
Kong retry behaviour:

Request → Pod A (shutting down)
Pod A returns 503

Kong:
1. Detects 503 (passive health check trigger)
2. Ejects Pod A from pool immediately
3. Retries the SAME request on Pod B

Pod B returns 200

User receives:
→ Correct response
→ ~5ms additional latency (the retry hop)
→ Zero visible error

Retry is NOT applied to:
→ Requests that returned a successful response
  (2xx) — never retry success
→ POST/PATCH/DELETE after a 2xx —
  these are not idempotent; retrying a write
  that already succeeded would duplicate the
  operation (e.g. adding a modification twice)
→ SSE streams mid-response — once tokens
  are streaming, the request cannot be retried
  mid-flight
```

**Idempotency and retry safety:**

```
Safe to retry (Kong does retry these):
GET requests — reading data, no side effects
Requests that failed before reaching the
Go API (connection refused, timeout before
any response) — no operation was executed

Not safe to retry automatically:
POST /cars (create a car)
PATCH /cars/{id}/mods/{modId} (update a mod)
DELETE /cars/{id} (delete a car)

If these fail AFTER the Go API started processing:
→ Kong does not auto-retry
→ Client receives the error
→ Client can retry manually with the same
  idempotency key if one was provided

This is why the API design (openapi.yaml) includes
idempotency keys on create endpoints — to allow
safe client-side retries without duplicate
operations, independent of Kong's retry logic.
```

---

## 5. Graceful Shutdown

When Kubernetes terminates a pod (rolling
deployment, scale-down, node eviction), the pod
receives a SIGTERM signal. The correct response
is a structured shutdown sequence — not immediate
termination.

### The Kenyan bank analogy

```
A bank closes at 5pm but locks its doors at 4:30pm.
Customers already inside at 4:30pm are served
to completion. No new customers are admitted after
4:30pm. Once the last customer is served, the
bank closes cleanly.

SIGTERM = 4:30pm (doors locked, no new customers)
30s timeout = 5pm (bank closes regardless)
In-flight requests = customers already inside
New requests = customers Kong stops sending
               (directed to other branches instead)
```

### Shutdown sequence

```
t=0s    SIGTERM received by Pod A

t=0s    STEP 1 — Signal Kong (close the door):
        isShuttingDown flag set to true
        /health endpoint now returns 503
        Kong's next passive or active check
        ejects Pod A from the upstream pool
        No new requests routed to Pod A

t=0s    STEP 2 — Close idle keep-alive connections:
        http.Server.Shutdown() called
        Idle keep-alive connections (no active
        request in flight) closed immediately
        Kong gets connection reset on any attempt
        to reuse these → passive health check
        triggers immediate ejection

t~0.02s STEP 3 — CRUD requests complete naturally
        (20ms average — done almost instantly)

t~0.2s  STEP 4 — RAG pipeline calls complete
        (50-200ms for pgvector similarity search)

t~9s    STEP 5 — SSE streams complete naturally
        (Claude finishes generating, stream closes)

t=30s   STEP 6 — Timeout fires:
        Any goroutines still running are
        force-killed (edge case — only affects
        hung connections, e.g. Claude API
        not responding)
        Users with force-killed SSE streams:
        EventSource auto-reconnects, conversation
        history preserved in aiMessages table,
        user can continue from where they left off

t=30s   STEP 7 — Clean exit:
        DB connection pool drained and closed
        Redis connections closed
        Logs flushed to Grafana Cloud
        Process exits 0

t=30s   Kubernetes marks pod as terminated
        New pod (updated version) already
        running and serving traffic
```

### Go implementation

```go
func main() {
    // Track shutdown state
    isShuttingDown := &atomic.Bool{}

    // Build the server
    srv := &http.Server{
        Addr:    ":8080",
        Handler: buildRouter(isShuttingDown),
    }

    // Start server in background goroutine
    go func() {
        if err := srv.ListenAndServe(); err != nil &&
            err != http.ErrServerClosed {
            log.Fatal().Err(err).Msg("server failed")
        }
    }()

    log.Info().Msg("server started on :8080")

    // Wait for SIGTERM (from Kubernetes) or
    // SIGINT (from local Ctrl+C during development)
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
    <-quit

    log.Info().Msg("SIGTERM received — starting graceful shutdown")

    // Step 1: signal Kong via health check
    isShuttingDown.Store(true)

    // Step 2: give Kong time to detect the
    // unhealthy status before we stop accepting
    // connections entirely (the preStop hook
    // in Kubernetes handles this — typically
    // a 5-10s sleep before SIGTERM is sent,
    // but we add a buffer here too)
    time.Sleep(5 * time.Second)

    // Step 3: shutdown with 30s timeout
    ctx, cancel := context.WithTimeout(
        context.Background(),
        30*time.Second,
    )
    defer cancel()

    if err := srv.Shutdown(ctx); err != nil {
        log.Error().
            Err(err).
            Msg("graceful shutdown timed out — force killing")
    }

    // Step 4: close infrastructure connections
    dbPool.Close()
    redisClient.Close()

    log.Info().Msg("shutdown complete")
}
```

### Why the 5-second sleep before Shutdown()

```
Timeline without the sleep:

t=0s  SIGTERM received
t=0s  isShuttingDown = true (/health returns 503)
t=0s  Shutdown() called — stops accepting connections

Problem: Kong's active health check polls every 3s.
In the worst case, Kong does not learn Pod A is
unhealthy for up to 3 seconds.

In that 3-second window, Kong might send
new requests to Pod A via keep-alive connections.
Shutdown() has already stopped the listener —
those requests get connection refused immediately.
Kong passive check fires → ejection. Request
retried. No user impact — but the retry
adds a few milliseconds.

Timeline WITH the 5-second sleep:

t=0s    SIGTERM received
t=0s    isShuttingDown = true (/health returns 503)
t=0-3s  Kong polls health check, gets 503
        Kong ejects Pod A from pool
        No more requests routed to Pod A
t=5s    Shutdown() called
        Pod A is already receiving zero new
        requests — shutdown is clean

The 5-second sleep gives Kong time to react
to the health check change BEFORE the listener
closes, eliminating even the retry scenario.
```

---

## 6. Connection Draining — The Keep-Alive Problem

### What keep-alive connections are

HTTP keep-alive (also called HTTP persistent
connections) allows Kong to reuse an already
established TCP connection for multiple HTTP
requests, rather than opening a new TCP connection
for every single request.

```
WITHOUT keep-alive:
Request 1: Open TCP → Send HTTP request
           → Receive response → Close TCP
Request 2: Open TCP → Send HTTP request
           → Receive response → Close TCP

New TCP handshake per request.
Each handshake adds ~10-50ms of latency.

WITH keep-alive:
Request 1: Open TCP → Send HTTP request
           → Receive response → TCP stays open

Request 2: Reuse existing TCP → Send HTTP request
           → Receive response → TCP stays open

No handshake overhead after the first request.
Significantly faster for high-frequency traffic.
```

Kong maintains a pool of these persistent
connections to each upstream pod. This is more
efficient but creates a specific problem during
pod shutdown.

### The gap problem

```
t=0s   SIGTERM received by Pod A
t=0s   Health check returns 503

Kong still has 8 keep-alive connections
open to Pod A from before the shutdown.
These connections are still alive at the
TCP level — the socket is open.

Kong's active health check next fires at t=2.5s
(3s interval, last poll was 0.5s ago)

In the 2.5s gap:
A new request arrives at Kong.
Kong has not yet learned Pod A is unhealthy.
Kong picks one of the 8 existing keep-alive
connections to Pod A to send the request.

What happens depends on Shutdown() timing:

If Shutdown() has been called (after the 5s sleep,
so not yet in our design):
→ The keep-alive connection was idle
→ Shutdown() already closed idle connections
→ Kong gets connection reset
→ Passive health check fires immediately
→ Pod A ejected
→ Request retried on Pod B ✓

If Shutdown() has NOT yet been called
(within the 5s sleep window):
→ The keep-alive connection is still open
→ Pod A's listener is still accepting
→ Pod A processes the request normally
→ Returns response successfully
→ No retry needed, no user impact ✓
```

### How Shutdown() drains keep-alive connections

```
http.Server.Shutdown() does three things:

1. Closes the listener (no NEW TCP connections)

2. Closes IDLE keep-alive connections immediately
   (connections with no active request in flight)
   → Kong gets connection reset on reuse attempt
   → Passive health check triggers ejection

3. Waits for ACTIVE connections to finish
   (connections with a request currently in flight)
   → These are the 62 in-flight requests
   → Shutdown() waits up to 30s for them to complete
   → Only then closes those connections cleanly

This is connection draining:
Draining = emptying the pool of active connections
           before closing, rather than cutting them off
```

---

## 7. Failure Modes

| Scenario | Detection | Response |
|----------|-----------|----------|
| Pod crashes (OOM, panic) | Passive: connection refused on real traffic. Active: next 3s poll | Passive ejects pod immediately. Kong retries request on healthy pod. |
| Pod health check returns 503 (planned shutdown) | Active: within 3s. Passive: on first real traffic hit | Pod ejected. New requests routed to remaining pods. |
| Pod is slow (high latency) | Active: timeout on health check poll | Pod marked unhealthy if health check times out. Ejected from pool. |
| Kong node fails (active/active) | DNS/Cloud L4 LB stops receiving responses from Kong node | Traffic routes to surviving Kong node. |
| All pods in one AZ fail | Active + Passive health checks on all 3 AZ-1 pods | All AZ-1 pods ejected. All traffic routes to AZ-2 pods. |
| All pods in both AZs fail | Every health check fails | 503 returned to users. Kubernetes restarts pods. Service unavailable until at least one pod recovers. |

---

## 8. Autoscaling Trigger

Wrench's AI chat endpoint holds SSE connections
open for 8-10 seconds per request. Applying
Little's Law:

```
L = λ × W
L = 2.3 RPS (realistic peak) × 9 seconds
L = ~21 concurrent SSE connections per pod
    at realistic peak

At theoretical ceiling (every user at rate limit):
L = 23 RPS × 9 seconds
L = 207 concurrent SSE connections across all pods
```

Go goroutines park during network I/O and consume
near-zero CPU while waiting for Claude tokens.
CPU therefore does not accurately reflect pod load
during AI-heavy traffic. The correct scaling
metrics are:

```
Scale out (add pods) when ANY of the following
are sustained for > 2 minutes:

1. Pod memory utilisation > 70% of memory limit
   (direct measure of goroutine + open connection
   accumulation — the actual resource consumed
   by parked SSE goroutines)

2. Concurrent active connections > 400 per pod
   (explicit cap before OS file descriptor limits
   are approached — each open SSE connection
   consumes one file descriptor)

3. p95 API latency > 500ms
   (symptom-based trigger — pods are struggling
   regardless of which resource is the cause)

Rule: always include a symptom-based trigger (rule 3)
alongside resource-based triggers (rules 1 and 2).
Resource metrics tell you WHY a pod is struggling.
Latency tells you that users ARE experiencing
the struggle. Both matter.

Grafana metric names:
container_memory_usage_bytes
wrench_http_active_connections (custom OTel gauge)
histogram_quantile(0.95, wrench_http_request_duration_seconds)
```

---

## SSE Reconnection Strategy

Every SSE token event carries an incrementing `id`
field per the SSE specification. The browser's
EventSource API automatically tracks the last
received id and sends it as `Last-Event-ID` on
reconnect — no custom frontend reconnection
logic required.

Server-side resume:
- All tokens streamed for an active message are
  stored in Redis as an ordered list
  (key: stream:{conversationId}:{messageId}:tokens,
   TTL: 5 minutes)
- On reconnect with Last-Event-ID: N, the Go API
  replays all tokens with id > N from Redis
  before resuming live Claude streaming
- If Redis TTL has expired: return the completed
  message from aiMessages or start fresh

Client-side state:
- sessionStorage stores last known event id and
  accumulated content per active stream
- Survives connection drops and tab refreshes
- Cleared on stream completion (done event)
- Not persisted beyond tab close (no stale
  resume tokens from old sessions)

User experience:
- Brief "reconnecting..." indicator on drop
- Tokens resume seamlessly from the exact
  point of interruption
- No lost content, no duplicate content,
  no full restart of the AI response


---

## References

- ADR-008: [Kong API Gateway](./adr/008-kong-api-gateway.md)
- ADR-003: [Redis caching](./adr/003-redis-caching.md)
  (Redis used for rate limiting, distinct from
  Kong's load balancing)
- Scalability design: [scalability-design.md](./scalability-design.md)
- Failure modes: [failure-modes.md](./failure-modes.md)
- Requirements: NFR-06 (availability), NFR-07
  (max 15 min downtime per deployment), NFR-09,
  NFR-10 (scalability targets)