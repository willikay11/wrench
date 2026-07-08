# Wrench — Rate Limiting Design

## Purpose

This document defines Wrench's complete rate
limiting strategy — what is limited, at which
layer, with what algorithm, and why. Rate limiting
in Wrench serves two distinct purposes:

1. SECURITY — preventing brute force, enumeration,
   and abuse of authentication endpoints
2. COST CONTROL — preventing AI API credit
   exhaustion (Claude API costs real money per
   request — uncontrolled usage is a financial risk)

Related ADR: ADR-003 — Redis vs in-process cache
Related: threat-model.md — D1 (AI credit exhaustion),
         D2 (auth brute force), D3 (large payload)

---

## 1. Two-Layer Rate Limiting Architecture

Wrench enforces rate limits at two independent
layers. Each layer has a different purpose and
different granularity:

```
Request arrives at Kong
      |
[LAYER 1 — Kong perimeter rate limiting]
  Granularity: per IP address
  Purpose: blunt instrument against basic abuse,
           scraping, DDoS-style traffic
  Algorithm: sliding window counter
  Enforcement: Kong rate limiting plugin
      |
  Passes perimeter check
      |
[LAYER 2 — Go API identity-aware rate limiting]
  Granularity: per authenticated userId
  Purpose: precise business rule enforcement,
           AI cost control
  Algorithm: token bucket via Redis atomic INCR
  Enforcement: Go API middleware + Redis
      |
  Request reaches handler
```

WHY TWO LAYERS:

Kong alone cannot enforce per-USER limits.
Kong sees IP addresses, not authenticated users.
A user who rotates IP addresses would bypass
a Kong-only per-IP rate limit.

Go API + Redis alone would waste Go API compute
on clearly abusive traffic. An attacker sending
10,000 requests per second from one IP would
reach Go API pods and consume goroutines before
being rate limited.

Together:
Kong stops volume attacks before they reach Go API.
Go API stops identity-based abuse regardless of IP.

---

## 2. Kong Perimeter Rate Limits

```
Scope:    per IP address
Storage:  Kong's built-in rate limiting store
          (Redis-backed in production Kong cluster)

RULE TABLE:
Endpoint group           Limit         Window    Reason
------------------------------------------------------------
All API endpoints        1,000 req     1 hour    General abuse prevention,
(catch-all)                                      scraping, misconfigured clients

Auth endpoints           See Layer 2   --        Auth endpoints have stricter
(login, register,                               identity-aware limits in Go API
forgot-password)

AI chat endpoint         See Layer 2   --        Cost control enforced
                                                 per-user in Go API

Response on breach:
HTTP 429 Too Many Requests
Retry-After: {seconds until reset}
{
  "type": "https://api.wrench.ai/errors/rate-limited",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Too many requests from this IP. Try again later.",
  "instance": "/v1/cars/550e8400/chat",
  "requestId": "01HXYZ123ABC"
}
```

The catch-all Kong limit protects infrastructure.
It is intentionally generous (1,000/hour) because
legitimate users should never hit it — only
automated abuse would approach this threshold.

---

## 3. Go API Identity-Aware Rate Limits

These limits are enforced per authenticated userId,
meaning they follow the USER regardless of which
IP address or device they use.

### 3.1 AI Chat Endpoint

```
Endpoint:  POST /cars/{carId}/chat
Limit:     20 requests per hour per userId
Window:    1 hour (sliding)
Algorithm: Token bucket via Redis atomic INCR
Purpose:   Cost control (NFR-15)

Redis key:   ratelimit:{userId}:chat
TTL:         3600 seconds (1 hour)

Why 20 per hour:
At ~$0.01 per AI request (input + output tokens):
20 requests × $0.01 = $0.20/hour per user
At 10,000 users all hitting limit simultaneously:
$0.20 × 10,000 = $2,000/hour theoretical ceiling
In practice (10% daily active): ~$200/hour

Rate limit makes the theoretical ceiling reachable
only if every user simultaneously hits their limit
— an unrealistic scenario that the limit makes
financially bounded.

Without rate limit:
A single user sending 1,000 requests/hour:
1,000 × $0.01 = $10/hour for one user
Multiple such users = unbounded cost exposure

Response when limit exceeded:
HTTP 429
Retry-After: {seconds until hourly window resets}
{
  "type": "https://api.wrench.ai/errors/rate-limited",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "You have reached your AI request limit. Resets in 23 minutes.",
  "retryAfter": 1380
}

Note: "retryAfter" value helps UX — user knows
exactly how long to wait rather than guessing.
Never reveal the total limit or current count
in the response (don't help attackers calibrate).
```

### 3.2 Authentication Endpoints

```
Endpoint:  POST /auth/login
Limit:     5 attempts per 15 minutes per IP
Window:    15 minutes (sliding)
Algorithm: Token bucket via Redis atomic INCR
Purpose:   Brute force prevention (NFR-16)

Redis key:   ratelimit:{ip}:auth:login
TTL:         900 seconds (15 minutes)

Note: auth limits use IP not userId because:
- The attacker does not HAVE a userId yet
  (they're trying to log in)
- IP is the only available identifier at
  the unauthenticated stage

Why 5 per 15 minutes:
A legitimate user who misremembers their password
might try 3-4 times before giving up or using
forgot-password. 5 attempts provides reasonable
headroom for genuine mistakes.

An attacker trying common passwords needs
thousands of attempts to succeed against a
strong password. 5 per 15 minutes =
20 per hour = 480 per day per IP.
For a 10-character random password this provides
no meaningful attack surface.

Endpoint:  POST /auth/register
Limit:     10 attempts per hour per IP
Window:    1 hour (sliding)
Algorithm: Redis atomic INCR
Purpose:   Spam account creation prevention

Redis key:   ratelimit:{ip}:auth:register
TTL:         3600 seconds

Endpoint:  POST /auth/forgot-password
Limit:     5 attempts per hour per IP
Window:    1 hour
Purpose:   Prevent email enumeration via
           response timing and email spam

Redis key:   ratelimit:{ip}:auth:forgot
TTL:         3600 seconds
```

### 3.3 Upload Endpoints

```
Endpoint:  POST /upload/photo, POST /upload/receipt
Limit:     50 uploads per hour per userId
Window:    1 hour (sliding)
Algorithm: Redis atomic INCR
Purpose:   Cloudinary storage abuse prevention

Redis key:   ratelimit:{userId}:upload
TTL:         3600 seconds

Why per-userId not per-IP:
Photo uploads are authenticated operations.
Per-userId tracking is more precise and
cannot be bypassed by IP rotation.

50 per hour is generous for legitimate use
(a user adding photos to all their mods in
one session) but prevents a compromised account
from being used to fill Cloudinary storage.
```

### Complete Rate Limit Reference Table

```
Endpoint                    Limit    Window  Key pattern           Reason
------------------------------------------------------------------------
POST /cars/{id}/chat        20       1 hour  ratelimit:{uid}:chat  Cost control
POST /auth/login            5        15 min  ratelimit:{ip}:login  Brute force
POST /auth/register         10       1 hour  ratelimit:{ip}:reg    Spam
POST /auth/forgot-password  5        1 hour  ratelimit:{ip}:forgot Enumeration
POST /auth/refresh          20       15 min  ratelimit:{ip}:ref    Token farming
POST /upload/*              50       1 hour  ratelimit:{uid}:up    Storage abuse
All other endpoints         [Kong]   1 hour  [Kong per-IP]         General abuse
```

---

## 4. Algorithm — Token Bucket via Redis INCR

### Why atomicity is critical

```
WITHOUT atomic operations (the race condition):

Two requests from the same user arrive
simultaneously at Pod A and Pod B.
Both check the rate limit counter:

Pod A reads counter: 19 (reads BEFORE increment)
Pod B reads counter: 19 (reads BEFORE increment)

Pod A: 19 < 20 limit -- allow
Pod B: 19 < 20 limit -- allow

Pod A increments: 19 + 1 = 20
Pod B increments: 19 + 1 = 20

Both allowed. Counter shows 20.
User actually sent 21 requests.
Rate limit bypassed by one request.

This is a race condition on the counter —
two separate operations (READ then INCREMENT)
with another process able to interleave between.
```

```
WITH Redis INCR (atomic operation):

Redis INCR is a single atomic command.
Read + increment happen as one indivisible unit.
Redis is single-threaded for command execution —
no other command can execute between the read
and the increment.

Pod A sends: INCR ratelimit:{userId}:chat
Pod B sends: INCR ratelimit:{userId}:chat

Redis executes them sequentially:
INCR -- returns 20, counter is now 20
INCR -- returns 21, counter is now 21

Pod A receives 20 -- 20 <= 20 -- allow
Pod B receives 21 -- 21 > 20 -- reject 429

Correct. No race condition possible.
```

### Implementation in Go

```go
func (m *RateLimitMiddleware) CheckAILimit(
    ctx context.Context,
    userId string,
) (allowed bool, retryAfter int, err error) {

    key := fmt.Sprintf("ratelimit:%s:chat", userId)
    limit := 20
    window := 3600 // 1 hour in seconds

    // Atomic increment
    count, err := m.redis.Incr(ctx, key).Result()
    if err != nil {
        // Redis unavailable -- fail open (allow request)
        // Log warning -- rate limiting degraded
        log.Warn().Err(err).Msg(
            "Redis unavailable, rate limiting degraded")
        return true, 0, nil
    }

    // Set TTL on first request in window
    if count == 1 {
        m.redis.Expire(ctx, key, time.Duration(window)*time.Second)
    }

    if count > int64(limit) {
        // Get remaining TTL for Retry-After header
        ttl, _ := m.redis.TTL(ctx, key).Result()
        return false, int(ttl.Seconds()), nil
    }

    return true, 0, nil
}
```

### Fail-open on Redis unavailability

```
If Redis is down, rate limiting is disabled —
requests are allowed through.

WHY FAIL-OPEN (not fail-closed):

Fail-closed (reject all requests when Redis is down):
Every Wrench user cannot use the AI assistant
during a Redis outage.
Redis becomes a hard dependency for availability.
A Redis blip takes down AI for all users.

Fail-open (allow all requests when Redis is down):
Users can continue using Wrench normally.
An attacker who can cause Redis to go down
could temporarily bypass rate limits —
a narrow, difficult-to-exploit attack window.
For the duration of the Redis outage only.

For Wrench's threat model:
The cost of a brief rate limit bypass during
a Redis outage is lower than the cost of
making AI unavailable for all users during
any Redis incident.

Monitoring:
If Redis goes down and the AI endpoint is
not rate limited, the cost alert
(wrench_claude_api_cost_usd_total spike)
will fire within minutes.
On-call engineer can manually throttle or
disable the AI endpoint via Kong if needed.

Document this as an accepted risk:
Rate limiting degrades to unprotected during
Redis outages. Expected outage: seconds to
minutes (Kubernetes restart). Cost exposure
during this window: bounded by the brief
outage duration.
```

---

## 5. Response Design

All rate limit responses follow RFC 7807
Problem Details and include a Retry-After header.

```
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
Retry-After: 1380

{
  "type": "https://api.wrench.ai/errors/rate-limited",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "You have reached your AI request limit. Resets in 23 minutes.",
  "instance": "/v1/cars/550e8400-e29b-41d4-a716/chat",
  "requestId": "01HXYZ123ABC",
  "retryAfter": 1380
}
```

### What the response NEVER reveals

```
NEVER include:
- The total limit (20 requests/hour)
  Revealing the limit helps attackers calibrate
  their attack to stay just under it

- The current count (you have used 20 of 20)
  Confirms the limit has been hit but also
  reveals the exact threshold

- Which specific limit was hit if multiple
  limits exist
  (don't reveal whether it was the per-user
  limit or the per-IP limit)

- Internal Redis key names or structures

The Retry-After value IS revealed:
This is user-friendly and does not help attackers
meaningfully. Knowing "retry in 23 minutes"
does not help an attacker bypass the limit.
```

### Different messages per endpoint context

```
Auth endpoint (POST /auth/login):
"Too many login attempts. Please try again in 15 minutes."

AI chat endpoint:
"You have reached your AI request limit. Resets in X minutes."

Upload endpoint:
"Upload limit reached. Please try again in X minutes."

General catch-all (Kong):
"Too many requests. Please try again later."

WHY DIFFERENT MESSAGES:
Each message helps a legitimate user understand
WHY they were limited and WHAT TO DO.
A user who hits the login limit knows to wait —
not that their account is locked or compromised.
A user who hits the AI limit knows they can
still use garage management features.
```

---

## 6. Input Validation as a DoS Defence

Rate limiting prevents request VOLUME attacks.
Input validation prevents request PAYLOAD attacks.

```
LARGE PAYLOAD ATTACK:
POST /cars/{id}/mods
{ "description": "[10 megabytes of text]" }

Without limits:
Go API allocates memory for the full body.
JSON parsing of 10MB takes CPU and memory.
Many concurrent large requests exhaust Go API memory.
OOM kill. Pod crashes.

WITH LIMITS:

Layer 1 — Kong max request body size:
Kong rejects requests exceeding the configured
body size limit before they reach the Go API.
No Go API memory consumed.
No parsing occurs.

Layer 2 — Go API field length limits:
Even if a large payload reaches Go API,
per-field validation rejects it:
name:        maxLength 100 chars
description: maxLength 2000 chars
notes:       maxLength 2000 chars
message:     maxLength 2000 chars (AI chat)

Layer 3 — Database constraints:
VARCHAR(100), VARCHAR(200) etc. in schema.md
Final backstop — database rejects oversized values.

FILE UPLOAD SIZE LIMIT (NFR-27):
POST /upload/photo and POST /upload/receipt:
Maximum file size: 10MB
Enforced by Go API before sending to Cloudinary
Large files rejected before consuming Cloudinary
upload quota or network bandwidth.
```

---

## 7. Rate Limit Monitoring

```
Grafana metrics to track:

wrench_rate_limit_hits_total
  labels: endpoint, limit_type (user/ip), layer (kong/api)
  Purpose: how often are limits being hit?
  Alert: sudden spike may indicate attack

wrench_rate_limit_remaining_avg
  labels: endpoint
  Purpose: are legitimate users close to their limits?
  Low remaining = consider increasing limits or
  improving UX (show usage to users)

wrench_redis_ratelimit_errors_total
  Purpose: is Redis unavailable causing fail-open?
  Alert: any value > 0 for > 1 minute

Dashboard panels:
- Rate limit hits per hour by endpoint
- Top users by AI request count
- IP addresses hitting auth rate limits most frequently
  (potential brute force investigation)
- Kong rejection rate by endpoint

Alerts:
- AI cost spike > 2x 7-day average for 1 hour
  (may indicate rate limiting failure or abuse)
- Auth rate limit hits > 100 per minute for 5 minutes
  (potential coordinated brute force attack)
```

---

## 8. Relationship to Kong Rate Limiting

```
Kong rate limiting plugin configuration:

plugin: rate-limiting
config:
  minute: null
  hour: 1000
  policy: redis        -- shared across Kong nodes
  redis_host: {redis}  -- same Redis cluster as Go API
  hide_client_headers: true  -- don't reveal Kong internals

Why policy: redis (not local):
Kong runs as 2 active/active nodes.
Per-node (local) rate limiting would allow
a user to hit 1,000 requests on node 1 AND
1,000 requests on node 2 = 2,000 effective limit.
Redis-backed policy shares the counter across
both Kong nodes -- correct per-IP enforcement
regardless of which Kong node handles the request.

Same principle as Go API + Redis for per-userId limits:
shared state requires a shared store.
```

---

## References

- ADR-003: Redis vs in-process cache
  (why Redis is required for correct rate limiting)
- Threat model: threat-model.md
  D1 (AI credit exhaustion), D2 (auth brute force),
  D3 (large payload), D5 (pgvector flooding)
- Caching strategy: caching-strategy.md
  (rate limit counters as a Redis cache use case)
- Requirements: NFR-15 (AI rate limiting),
  NFR-16 (auth rate limiting), NFR-27 (file size)
- Schema: schema.md (input length constraints)
- OpenAPI spec: openapi.yaml (field maxLength values)