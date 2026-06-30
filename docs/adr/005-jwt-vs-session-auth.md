# ADR-005: Authentication — JWT vs Session-Based Auth

## Status
Accepted

## Date
2026-06-22

## Context
Wrench requires an authentication system that:
- Identifies users on every API request
- Works correctly across multiple stateless Go API
  pods deployed across two availability zones
- Supports both email/password and Google OAuth
  login (FR-01, FR-02)
- Allows session revocation on logout and password
  reset (FR-05, FR-08)
- Limits access token validity to minimise damage
  from token theft (NFR-14)
- Protects against brute force on auth endpoints
  (NFR-16)

Two authentication approaches were evaluated:
1. JWT (JSON Web Tokens) with refresh token rotation
2. Server-side sessions with session store

## Decision
Use **JWT access tokens with refresh token rotation**
stored in a dedicated `refreshTokens` table.

### Token architecture

**Access token:**
```
Type:      JWT (JSON Web Token)
Algorithm: HS256 (HMAC SHA-256)
Expiry:    15 minutes (NFR-14)
Storage:   Client memory only — never in
           localStorage or a cookie
Validation: Stateless — verified by Go API
           using the JWT secret. No database
           lookup required.

Payload:
{
  "sub": "user-uuid",    ← user ID only
  "exp": 1735000000,     ← expiry timestamp
  "iat": 1734999100      ← issued at timestamp
}

What is NOT in the payload:
- Email address (PII — never in JWT)
- Role or permissions (changes require reissue)
- Any sensitive data
```

**Refresh token:**
```
Type:      Opaque random token (not a JWT)
Expiry:    7 days
Storage:   Database (refreshTokens table)
           stored as bcrypt hash — never raw

Table structure:
refreshTokens
  id          uuid PK
  userId      uuid FK → users
  tokenHash   varchar  ← bcrypt hash of the token
  family      uuid     ← reuse detection group
  expiresAt   timestamp
  revokedAt   timestamp nullable
  createdAt   timestamp
```

### Token lifecycle

**Login:**
```
1. Verify credentials
2. Generate access token (JWT, 15 min)
3. Generate refresh token (random, opaque)
4. Hash refresh token with bcrypt
5. Store hash + family UUID in refreshTokens
6. Return both tokens to client
```

**Authenticated request:**
```
1. Client sends: Authorization: Bearer {accessToken}
2. Go middleware validates JWT signature
3. Checks exp claim — rejects if expired
4. Extracts sub (userId) into request context
5. No database lookup required
```

**Token refresh:**
```
1. Client sends refresh token
2. Go API hashes the token
3. Queries refreshTokens for matching hash
4. Validates: not revoked, not expired,
   userId matches
5. Revokes the used refresh token
6. Issues new access token + new refresh token
   (new token joins the same family)
7. Returns both new tokens
```

**Logout:**
```
1. Client sends refresh token
2. Go API revokes it in refreshTokens table
3. Access token remains valid until 15 min expiry
   (accepted limitation — see consequences)
```

**Password reset:**
```
1. Password updated in DB
2. ALL refresh tokens for this user are revoked
   (every active session terminated)
3. User must log in again on all devices
```

### Refresh token rotation and reuse detection

Every refresh operation issues a new refresh token
and revokes the used one. Tokens within the same
login session share a `family` UUID.

Reuse detection:
```
If a refresh token is presented that has already
been revoked (used once and replaced):

→ This indicates the original token was stolen
  and used by an attacker after the legitimate
  user had already rotated it

→ Response: revoke ALL tokens in this family
  immediately. Every session using tokens from
  this login is terminated.

→ User is logged out everywhere and must
  log in again. This is the correct, intentional
  behaviour — security over convenience.
```

### Google OAuth flow

Google OAuth tokens are always verified server-side:

```
1. Frontend completes Google OAuth flow
2. Frontend receives Google ID token
3. Frontend sends ID token to POST /auth/login/google
4. Go API verifies ID token against Google's
   public keys (https://www.googleapis.com/oauth2/v3/certs)
5. Never trust the payload without verifying
   the signature — prevents identity spoofing
6. On valid token: extract email, look up or
   create user, issue Wrench JWT + refresh token
```

### Security decisions

**Email enumeration prevention:**
POST /auth/forgot-password always returns 200
regardless of whether the email is registered.
This prevents attackers from discovering which
emails have Wrench accounts.

**Constant error messages on login:**
Invalid email and invalid password return
identical error messages and response times.
Prevents attackers from determining whether
an email is registered via login attempts.

**Password hashing:**
bcrypt with cost factor 12 (NFR-13).
Maximum password length 72 characters
(bcrypt silently truncates beyond this).

**IDOR prevention on all endpoints:**
Resources return 404 (not 403) when they exist
but belong to another user. Prevents attackers
from confirming resource existence via
ownership-check errors.

## Reasoning

### Why JWT over server-side sessions

**Stateless validation across multiple pods:**

The Go API runs as multiple instances across
AZ-1 and AZ-2. Every request must be validated
regardless of which pod it reaches.

With server-side sessions:
```
User logs in → session created on Pod A
User's next request → routed to Pod B by Kong
Pod B has no knowledge of this session
→ User appears unauthenticated
→ Forced to log in again

Fix: use a shared session store (Redis)
→ Redis becomes a hard dependency for authentication
→ If Redis is unavailable, NO user can authenticate
→ Redis outage = complete auth failure for all users
```

With JWT:
```
User logs in → JWT issued and signed with secret
User's next request → routed to any pod
Any pod validates the JWT using the shared secret
→ Stateless — no shared store required for auth
→ Redis can go down without affecting
  user authentication
```

**Horizontal scaling:**

JWT validation is O(1) cryptographic operation
performed in-memory by any pod. No network hop
required. As the number of API pods increases,
auth validation scales linearly at zero additional
infrastructure cost.

Session-based auth scales horizontally only by
scaling the session store — an additional
infrastructure dependency.

### Why refresh tokens are stored in the database

Access tokens are stateless and cannot be revoked
before expiry. This is the fundamental limitation
of JWTs. If an access token is stolen, it remains
valid for up to 15 minutes.

Refresh tokens are stateful — stored in the database
— precisely because they need to be revocable:
- Logout must immediately invalidate the session
- Password reset must immediately terminate all sessions
- Token theft (detected via reuse) must terminate
  all related sessions

This is a deliberate hybrid approach:
```
Access token  → stateless JWT → fast validation,
                                no DB lookup,
                                not revocable
                                (15 min TTL limits risk)

Refresh token → stateful DB   → revocable,
                                enables logout,
                                enables reuse detection,
                                one DB lookup per refresh
                                (every 15 minutes per user)
```

The database is only consulted once per 15-minute
window per user (at token refresh time), not on
every request. This provides revocability without
the per-request database cost of pure session auth.

### Why 15 minutes for access token expiry

15 minutes balances security and user experience:
- Short enough to limit the damage window if stolen
- Long enough that most user sessions do not require
  a visible refresh (silent refresh happens in the
  background before expiry)
- Longer than most individual page interactions,
  preventing mid-session expiry for typical usage

Tokens shorter than 5 minutes cause visible
re-authentication during normal usage.
Tokens longer than 30 minutes provide too large
a theft window.

### Why refresh tokens are opaque (not JWTs)

A JWT refresh token would be stateless —
it could not be revoked without a store.
Refresh tokens must be revocable to support
logout and reuse detection.

An opaque random token stored as a bcrypt hash
in the database provides:
- Full revocability (delete the row)
- No information leakage (random bytes reveal nothing)
- Protection if the database is compromised
  (bcrypt hash cannot be reversed to the raw token)

## Consequences

### Positive
- Stateless access token validation — no Redis
  or database dependency for per-request auth
- Scales horizontally with zero additional
  infrastructure
- Refresh token rotation provides strong session
  security with theft detection
- Google OAuth supported through the same token
  issuance flow
- No sticky session requirement on load balancer

### Negative and accepted limitations

**Access token cannot be immediately revoked:**
If a user's access token is stolen, it remains
valid for up to 15 minutes after logout or
password reset. This is the fundamental limitation
of stateless JWTs.

Mitigation: 15-minute expiry limits the damage
window. For the threat model of a project car
app, this is an accepted risk. A token blocklist
(Redis set of revoked JWTs checked on each request)
would eliminate this window but adds Redis as
a hard auth dependency — the exact problem JWT
was chosen to avoid.

**Refresh requires one database lookup:**
Every 15 minutes, a token refresh requires a
database query to validate and rotate the refresh
token. At 10,000 users with 8-hour active sessions:
10,000 users × (8 hours × 60 min / 15 min)
= 10,000 × 32 = 320,000 refresh operations per day
= ~3.7 refresh DB queries per second

This is well within the primary database capacity
and is not a concern at current or projected scale.

## Migration Trigger
This decision is stable for the foreseeable future.

If Wrench introduces real-time collaborative features
(multiple users editing the same build plan
simultaneously), consider supplementing JWT auth
with WebSocket session management. The JWT layer
itself does not need to change.

If regulatory requirements (SOC 2, ISO 27001)
demand immediate token revocation with zero window,
implement a JWT blocklist in Redis. This adds
Redis as a hard auth dependency — the trade-off
documented above must be re-evaluated at that time.

## Alternatives Rejected

**Server-side sessions with Redis session store:**
Requires Redis as a hard dependency for all
authentication. Redis outage would prevent any
user from authenticating. Rejected in favour
of stateless JWT validation that degrades
gracefully when Redis is unavailable.

**Server-side sessions with database session store:**
Requires a database query on every single API
request to validate the session. At peak load
(500 concurrent users, average 10 requests per
session per minute): 5,000 session validation
queries per minute competing with application
writes. Unacceptable database load for what is
purely an auth concern.

**Pure JWT with no refresh tokens:**
Long-lived access tokens (days or weeks) to avoid
the need for refresh. Rejected because stolen
tokens would remain valid for days with no
revocation mechanism. Incompatible with NFR-14.

**OAuth-only (no email/password):**
Delegates auth entirely to Google. Rejected
because it excludes users without Google accounts
and creates a hard dependency on Google's OAuth
service availability for all user authentication.

## References
- Requirements: FR-01, FR-02, FR-03, FR-04,
  FR-05, FR-07, FR-08, NFR-13, NFR-14, NFR-16
- Auth design: /docs/security/auth-design.md
- Security design: /docs/security/security-design.md
- Related ADRs: ADR-003 (Redis), ADR-008 (Kong)
- OWASP Authentication Cheat Sheet
- RFC 7519 (JSON Web Token specification)