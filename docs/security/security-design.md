# Wrench — Security Design

## Purpose

This is the single-page security reference for
Wrench. It summarises every security decision
across all layers of the system, links to the
detailed documents where each decision is fully
reasoned, and documents the accepted risks
explicitly.

Any engineer joining the project should be able
to read this document in 10 minutes and understand
Wrench's complete security posture. Every detail
lives in the linked documents below.

---

## 1. Security Principles

Every security decision in Wrench is guided by
four principles applied consistently across all
layers:

```
1. DEFENCE IN DEPTH
   No single control is relied upon exclusively.
   Every asset has multiple independent protection
   layers — if one fails, others remain.
   Example: Kong channel auth + JWT validation +
   DB ownership checks. An attacker must defeat
   all three, independently.

2. LEAST PRIVILEGE
   Every component has only the permissions it
   needs to do its job — nothing more.
   Example: wrench_app DB user has only
   SELECT/INSERT/UPDATE/DELETE. Cannot DROP TABLE,
   CREATE USER, or read server files.

3. FAIL FAST AND LOUDLY
   When a security precondition is not met,
   fail immediately and visibly rather than
   starting in a broken state.
   Example: Go API refuses to start if JWT_SECRET
   is missing or under 32 characters.

4. ASSUME BREACH
   Design each layer assuming the layer above
   it may be compromised. The database is
   protected even if Kong is compromised.
   Application data is protected even if the
   database password is leaked (network controls).
```

---

## 2. Authentication

Full detail: [auth-design.md](./auth-design.md)
Decision record: [ADR-005](../adr/005-jwt-vs-session-auth.md)

```
WHAT:   JWT access tokens (15 min) +
        opaque refresh tokens (7 days)

WHY:    Stateless access token validation
        scales horizontally without Redis
        as a hard auth dependency.
        Stateful refresh tokens enable
        revocation, logout, and theft detection.

KEY DECISIONS:
Access tokens:    HS256 signed, 15 min expiry,
                  userId only in payload (no PII,
                  no roles), alg: "none" rejected
Refresh tokens:   32 random bytes, stored as
                  bcrypt hash, single-use rotation,
                  family-based reuse detection
Passwords:        bcrypt cost factor 12 (~250ms)
Google OAuth:     server-side token verification
                  against Google public keys (NFR-25)
Constant-time:    wrong email and wrong password
                  return identical response in
                  identical time (~250ms)
Email enumeration: forgot-password always returns 200

ACCEPTED RISK:
Access tokens cannot be revoked before their
15-minute expiry. Short TTL limits the damage
window. Documented in ADR-005.
```

---

## 3. Authorisation

Full detail: [auth-design.md](./auth-design.md) Section 5

```
WHAT:   Ownership-based authorisation.
        Every resource is owned by a userId.
        Every request is validated against
        the authenticated userId.

HOW:    Repository layer enforces:
        WHERE resource.userId = $authenticatedUserId
        on every query, for every resource type.

IDOR PREVENTION:
        Resources return 404 (not 403) when they
        exist but belong to another user.
        Attacker cannot confirm a resource exists
        by observing the error code.

MIDDLEWARE CHAIN (in order):
1. Rate limit check (Redis)
2. JWT extraction + validation
3. userId injected into request context
4. Handler → service → repository
5. Repository: ownership check on every query
```

---

## 4. Network Security

Full detail: [network-security.md](./network-security.md)

```
SUBNET SEGMENTATION:
Public subnet:   Kong only (internet-accessible)
Private subnets: Go API, Postgres, Redis, PgBouncer
                 (no internet route — packets dropped)

SECURITY GROUPS:
Postgres: accepts connections only from Go API SG
          on port 5432
Redis:    accepts connections only from Go API SG
          on port 6379
Go API:   accepts connections only from Kong SG
          on port 8080

WHY THIS MATTERS:
DATABASE_URL alone is not sufficient to connect
to Postgres. The attacker also needs to be inside
the VPC in the correct security group. Two
independent factors required.

TLS:
External (internet to Kong): TLS 1.2+ enforced,
HSTS header on all responses (NFR-12)
Internal (Kong to Go API): HTTP on private subnet
(no internet route = no interception possible)
Database: TLS enforced by Neon on all connections
```

---

## 5. Secrets Management

Full detail: [network-security.md](./network-security.md) Section 5

```
STORAGE:
All secrets in platform secret store
(Railway/Fly.io encrypted environment variables).
Never in code, never in git history, never in logs.

PREVENTION (three independent layers):
Layer 1: .gitignore (.env files never tracked)
Layer 2: detect-secrets pre-commit hook
         (catches secrets in source files)
Layer 3: GitHub secret scanning
         (safety net, auto-notifies providers)

FAIL-FAST:
Go API refuses to start if any required secret
is missing or insufficiently strong.
JWT_SECRET must be minimum 32 characters.

ROTATION SCHEDULE:
CLAUDE_API_KEY:   quarterly (internet-accessible,
                  fastest blast radius)
CHANNEL_TOKEN:    quarterly (frontend-accessible)
JWT_SECRET:       6-12 months (dual-secret window
                  rotation — zero user impact)
DATABASE_URL:     6-12 months (protected by network
                  controls, rotation value lower)

INCIDENT RESPONSE:
1. Revoke compromised secret immediately
2. Generate replacement
3. Update platform secret store + rolling restart
4. Investigate: when exposed, how, blast radius
5. GDPR notification assessment (Article 33)
```

---

## 6. Rate Limiting

Full detail: [rate-limiting-design.md](./rate-limiting-design.md)

```
TWO-LAYER ARCHITECTURE:

LAYER 1 — Kong (per IP):
1,000 req/hour catch-all on all endpoints
Protects infrastructure from volume attacks
Enforced before requests consume Go API resources

LAYER 2 — Go API + Redis (per userId):
AI chat:         20 req/hour (cost control, NFR-15)
Auth login:      5 attempts/15 min (brute force, NFR-16)
Auth register:   10 attempts/hour (spam prevention)
Forgot password: 5 attempts/hour (enumeration prevention)
Uploads:         50/hour (storage abuse prevention)

ALGORITHM: Redis atomic INCR
Single-threaded Redis INCR prevents the race
condition that allows limits to be bypassed
by concurrent requests hitting different pods.

FAIL-OPEN:
If Redis is unavailable, rate limiting is
disabled — requests are allowed through.
Prevents Redis outage from taking down AI
for all users. Cost alert detects abuse.

RESPONSE: HTTP 429 with Retry-After header.
Never reveals total limit or current count.
```

---

## 7. Input Validation

Full detail: [rate-limiting-design.md](./rate-limiting-design.md) Section 6,
[schema.md](../schema.md)

```
THREE-LAYER VALIDATION:

Layer 1 — OpenAPI schema (API boundary):
Field types, formats, required fields,
enum values, min/max for integers.
Fast rejection with clear 422 error messages.

Layer 2 — Go API handler validation:
Business rules, length limits, allowlists
over denylists (year: 1885-2030, not "is integer").

Layer 3 — Database CHECK constraints:
Final backstop regardless of which code path
created the data (user input, AI-generated
content, migration scripts, background jobs).
Cannot be bypassed by any application code.

SQL INJECTION PREVENTION:
sqlc generates parameterised queries for ALL
database operations. User input is always a
parameter value ($1, $2...), never SQL text.
This attack is impossible with sqlc.

FILE UPLOAD VALIDATION:
Magic bytes MIME validation (not extension)
rejects files disguised as images.
Cloudinary strip_metadata: true removes
malicious EXIF/metadata from genuine images.
Cloudinary re-encoding destroys polyglot files.
Maximum file size: 10MB (NFR-27).

PROMPT INJECTION:
System prompt hardening instructs Claude to
maintain automotive assistant role.
Output validation detects successful injection.
Cannot be fully eliminated (accepted risk).
```

---

## 8. Data Protection

```
DATA IN TRANSIT:
TLS 1.2+ on all external connections (NFR-12)
Private network for internal connections
(no internet route, no interception possible)

DATA AT REST:
Postgres: Neon manages encryption at rest
Redis: encrypted at rest (platform-managed)
Cloudinary: encrypted at rest
Backups: encrypted (Neon-managed)

PII HANDLING:
Logs never contain: email, displayName, VIN,
financial amounts, AI conversation content (NFR-29)
Logs use: userId (UUID) — not email
AI conversation content: stored in aiMessages,
never in logs

GDPR (NFR-28):
Users can request export of all their data
Users can delete their account and all data
Data deleted within 30 days of account deletion
Incident notification within 72 hours (Article 33)

FINANCIAL DATA:
Budget totals served from materialised view
on primary DB — never cached (staleness risk
unacceptable for financial data)
Amounts stored as BIGINT cents (no floating
point representation errors)
```

---

## 9. Observability for Security

Full detail: [observability-design.md](../observability-design.md)

```
Every security-relevant event is logged and
traced. Key signals:

AUTHENTICATION:
- Failed login attempts per IP (auth brute force)
- Refresh token reuse detection events
- Unusual login times or locations

AUTHORISATION:
- 404 responses on ownership checks
  (potential IDOR probing)
- Requests for resources belonging to
  different users

RATE LIMITING:
- Rate limit hit rate per endpoint per hour
- Auth rate limit hits (potential brute force)
- AI cost spike alert (potential abuse or
  rate limiting failure)

INFRASTRUCTURE:
- Unexpected DB connection sources
  (security group bypass attempt)
- Failed JWT validations (forgery attempts)
- Large payload rejections (DoS attempts)

CORRELATION:
Every request has a trace_id linking:
→ Kong access log
→ Go API structured log
→ DB query span
→ External API call span

A security incident can be reconstructed
end-to-end from a single trace_id.
```

---

## 10. Security Testing

```
BEFORE LAUNCH:
Dependency scanning: govulncheck (Go) and
npm audit (Next.js) on every CI run.
Secret scanning: detect-secrets in CI pipeline.

POST LAUNCH:
Monthly: restore a DB backup to verify
         backups actually work
Quarterly: rotate CLAUDE_API_KEY and CHANNEL_TOKEN
           per rotation schedule
6-monthly: JWT_SECRET and DATABASE_URL rotation

PENETRATION TESTING:
Evaluate at 10K users or first significant
funding event — whichever comes first.
Focus areas: IDOR, auth flows, prompt injection,
             file upload vulnerabilities.
```

---

## 11. Accepted Risks

These risks are known, evaluated, and explicitly
accepted. They are not oversights.

```
Risk                      Why accepted              Mitigation in place
------------------------------------------------------------------------
Access tokens valid       Fundamental JWT           15-min expiry limits
15 min after logout       limitation. Stateless     damage window.
                          JWTs cannot be            ADR-005.
                          revoked efficiently.

Channel token             Frontend code is          JWT required for all
extractable from          inherently inspectable.   data access. CORS as
Next.js bundle            BFF pattern would         second layer. ADR-008.
                          fully mitigate but
                          adds complexity not
                          yet warranted.

Prompt injection          Natural language           System prompt hardening,
not fully eliminable      cannot perfectly           output validation, RAG
                          separate instructions      context grounding,
                          from data.                 Anthropic safety training.
                                                     Monitoring as detection.

Rate limiting             Fail-open is correct       Cost alert fires within
disabled during           for availability.          minutes of unusual spend.
Redis outage              Brief outage (seconds      On-call can manually
                          to minutes before          disable AI endpoint
                          Kubernetes restarts).      via Kong if needed.

HTTP internal             No internet route to       Private subnet network
traffic (Kong             private subnet —           controls make interception
to Go API)                interception requires      impossible from outside VPC.
                          VPC compromise first.
```

---

## 12. Security Document Index

```
This document (security-design.md):
  Single-page security reference and accepted
  risks summary.

threat-model.md:
  Full STRIDE analysis — 22 specific threats,
  severity ratings, mitigations, and status
  for every identified attack vector.

auth-design.md:
  Complete authentication flows (registration,
  login, OAuth, refresh, logout, password reset),
  JWT architecture, authorisation matrix,
  middleware chain, JWT_SECRET rotation procedure.

network-security.md:
  VPC layout, subnet segmentation, security group
  rules, TLS configuration, secrets management,
  least privilege DB user, CORS policy, incident
  response procedure.

rate-limiting-design.md:
  Two-layer rate limiting architecture, Redis
  atomic INCR algorithm, complete limit table,
  response design, monitoring and alerting.
```

---

## References

- ADR-005: JWT vs session-based auth
- ADR-008: Kong API Gateway
- ADR-003: Redis (rate limiting)
- Requirements: NFR-12 through NFR-17, NFR-25,
  NFR-28, NFR-29
- OWASP Top 10
- OWASP Authentication Cheat Sheet
- GDPR Article 33 (breach notification)