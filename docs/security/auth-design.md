# Wrench — Authentication & Authorisation Design

## Purpose

This document describes Wrench's complete
authentication and authorisation architecture.

Related ADR: ADR-005 — JWT vs session-based auth
Related: threat-model.md — S1, S2, S3, E1, E2, E3

---

## 1. Authentication Overview

Wrench uses a hybrid stateless/stateful model:

ACCESS TOKEN (JWT — stateless):
- Issued on login, valid for 15 minutes
- Validated by any Go API pod without a DB lookup
- Cannot be revoked before expiry (accepted risk)
- Contains only: userId, expiry, issued-at

REFRESH TOKEN (opaque — stateful):
- Issued on login, valid for 7 days
- Stored as a bcrypt hash in the refreshTokens table
- Can be revoked immediately (logout, password reset)
- Single-use: rotated on every refresh call
- Supports reuse detection (theft detection)

WHY HYBRID:
Access token: stateless = fast validation,
no DB lookup on every request, scales horizontally

Refresh token: stateful = revocable,
enables logout, enables reuse detection

---

## 2. Token Architecture

### Access Token (JWT)

```
Header (base64url encoded):
{
  "alg": "HS256",
  "typ": "JWT"
}

Payload (base64url encoded):
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "exp": 1735000900,
  "iat": 1735000000
}

Signature:
HMACSHA256(
  base64url(header) + "." + base64url(payload),
  JWT_SECRET
)
```

WHAT IS IN THE PAYLOAD:
- sub (subject): userId (UUID only)
- exp: expiry timestamp (Unix epoch)
- iat: issued-at timestamp (Unix epoch)

WHAT IS NEVER IN THE PAYLOAD:
- email — PII, never in JWT
- role — changes require token reissue
- displayName — PII
- any sensitive data — JWTs are base64 encoded,
  not encrypted — anyone can decode the payload

ALGORITHM: HS256 (HMAC SHA-256)
JWT library configured to ONLY accept HS256.
Tokens with alg: "none" are rejected immediately (S1 mitigation).

EXPIRY: 15 minutes (NFR-14)

### Refresh Token

```
STRUCTURE: 32 random bytes, base64url encoded
           ~43 characters, opaque to the client

STORAGE in refreshTokens table:
id          UUID
userId      UUID FK — users
tokenHash   VARCHAR — bcrypt hash of the raw token
family      UUID — reuse detection group ID
expiresAt   TIMESTAMPTZ — 7 days from issuance
revokedAt   TIMESTAMPTZ — null until revoked
createdAt   TIMESTAMPTZ
```

WHY BCRYPT HASH (not raw token):
If the refreshTokens table is breached,
an attacker gets only bcrypt hashes.
bcrypt is a one-way function — cannot be reversed.

WHY OPAQUE (not a JWT):
A JWT refresh token would be stateless and
cannot be revoked. Refresh tokens must be
revocable for logout and reuse detection.

---

## 3. Authentication Flows

### 3.1 Email/Password Registration

```
POST /auth/register
{ email, password, displayName }

Go API:
1. Validate input (email format, password 8-72 chars)
2. Check email uniqueness on Primary DB
   If exists: return 409 (same message always —
   no information about existing accounts)
3. Hash password: bcrypt(password, cost=12)
4. Create user record in transaction:
   INSERT INTO users
   INSERT INTO userPasswords
   COMMIT
5. Issue tokens (same as login)
6. Return AuthResponse
```

User is immediately authenticated after registration.

### 3.2 Email/Password Login

```
POST /auth/login
{ email, password }

Go API:
1. Look up user by email on Primary DB

2. ALWAYS run bcrypt comparison (constant-time):
   if user not found:
       bcrypt.Compare(dummyHash, password) (~250ms)
       return 401 "The email or password is incorrect"
   if suspended:
       bcrypt.Compare(storedHash, password) (~250ms)
       return 401 (same message)

3. Compare password:
   bcrypt.Compare(storedHash, password)
   if mismatch: return 401 (same message)

4. Generate access token (JWT, 15 min)
5. Generate refresh token (32 random bytes)
6. Store hashed refresh token in refreshTokens
   family = gen_random_uuid() (new per login)
7. Update lastLogin
8. Return AuthResponse
```

CONSTANT-TIME GUARANTEE:
Wrong email, wrong password, suspended account
all take ~250ms. Timing cannot reveal which
condition triggered the error. (I2, S2 mitigations)

### 3.3 Google OAuth Login

```
POST /auth/login/google
{ idToken: "[Google ID token from frontend]" }

Go API:
1. Verify ID token against Google public keys:
   https://www.googleapis.com/oauth2/v3/certs
   NEVER trust payload without signature verification
   (NFR-25, S2 mitigation)

2. Extract verified claims: email, sub, name, picture

3. Look up userIdentities by provider + providerUserId

4a. Identity exists (returning user):
    Load user, issue tokens, return 200

4b. Identity does not exist (new user):
    Check if email has a password account:
    If yes: link Google identity to existing account
    If no: create new user + identity record
    Issue tokens, return 201
```

### 3.4 Token Refresh

```
POST /auth/refresh
{ refreshToken }

Go API:
1. Look up token by fast hash (SHA-256 lookup column)
2. Verify with bcrypt (authentication)
3. Check validity: not revoked, not expired

4. REUSE DETECTION:
   If token is already revoked:
   REVOKE ENTIRE FAMILY:
     UPDATE refreshTokens SET revokedAt = NOW()
     WHERE family = $tokenFamily
   Log security event
   Return 401 — user must log in again
   Attacker's token (same family) also revoked

5. Issue new tokens (new refresh token, same family)
6. Revoke old refresh token
7. Return AuthResponse
```

ROTATION GUARANTEE:
Every refresh token is single-use. A stolen token
used by an attacker causes reuse detection when
the legitimate user next refreshes — ejecting
the attacker from all sessions in that family.

### 3.5 Logout

```
POST /auth/logout
{ refreshToken }
Authorization: Bearer {accessToken}

Go API:
1. Validate JWT
2. Look up refresh token
3. Revoke it:
   UPDATE refreshTokens SET revokedAt = NOW()
   WHERE id = $tokenId AND userId = $authenticatedUserId
4. Return 204

LIMITATION: Access token valid until 15-min expiry.
Accepted risk per ADR-005.
```

### 3.6 Password Reset

```
POST /auth/forgot-password { email }
Always returns 200 (email enumeration prevention)
If email exists: send reset link (1-hour expiry)

POST /auth/reset-password { token, newPassword }
1. Verify reset token (not expired, not used)
2. Hash new password (bcrypt, cost 12)
3. Update userPasswords
4. REVOKE ALL refresh tokens for this user
   (terminates every active session)
5. Return 200
```

---

## 4. Request Authentication Middleware

Every authenticated endpoint passes through:

```
Request arrives
      |
[1] Rate limit check (Redis)
      | 429 if exceeded
[2] JWT extraction from Authorization header
      | 401 if missing/malformed
[3] JWT validation (signature, alg, expiry)
      | 401 if invalid/expired
[4] userId injected into request context
      |
[5] Handler
      |
[6] Service layer — ownership check
      |
[7] Repository — WHERE resource.userId = $authenticatedUserId
      | 404 if resource exists but belongs to another user
```

```go
func AuthMiddleware(jwtSecret string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(
            w http.ResponseWriter, r *http.Request,
        ) {
            authHeader := r.Header.Get("Authorization")
            if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
                writeError(w, 401, "unauthorized", "Access token is missing")
                return
            }
            tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

            token, err := jwt.Parse(tokenStr,
                func(t *jwt.Token) (interface{}, error) {
                    if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
                        return nil, fmt.Errorf("unexpected signing method: %v",
                            t.Header["alg"])
                    }
                    return []byte(jwtSecret), nil
                })

            if err != nil || !token.Valid {
                writeError(w, 401, "unauthorized",
                    "Access token is invalid or expired")
                return
            }

            claims := token.Claims.(jwt.MapClaims)
            userId, ok := claims["sub"].(string)
            if !ok || userId == "" {
                writeError(w, 401, "unauthorized", "Access token is malformed")
                return
            }

            ctx := context.WithValue(r.Context(), contextKeyUserId, userId)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

---

## 5. Authorisation Matrix

```
Resource          Action    Enforcement rule
--------------------------------------------------
cars              All       cars.userId = authenticated
carMods           All       via carId -> cars.userId = authenticated
carService        All       via carId -> cars.userId = authenticated
buildStages       All       buildStages.userId = authenticated
buildTasks        All       via stageId -> buildStages.userId = authenticated
budgetEntries     All       budgetEntries.userId = authenticated
garageTools       All       garageTools.userId = authenticated
aiConversations   All       aiConversations.userId = authenticated
aiMessages        Read      via conversationId -> aiConversations.userId = authenticated
embeddings        All       via userId or carId -> cars.userId = authenticated
```

### Why 404 not 403 for ownership failures

403 Forbidden confirms the resource EXISTS.
An attacker learns the carId is valid and belongs
to someone — useful for enumeration attacks.

404 Not Found reveals nothing about existence.
Identical response whether carId is invalid OR
valid but owned by another user.
(IDOR mitigation — threat model I1 and E1)

---

## 6. Password Security

```
ALGORITHM: bcrypt
COST FACTOR: 12 (NFR-13)
COMPUTATION TIME: ~250ms per verification

Why bcrypt over SHA-256:
SHA-256: millions of hashes per second per GPU
         breached DB brute-forced in hours
bcrypt:  4 hashes per second per core
         intentional slowness is the defence

CONSTRAINTS:
Minimum: 8 characters
Maximum: 72 characters (bcrypt truncates silently
         beyond 72 — enforced at API layer)

STORAGE:
userPasswords.password = full bcrypt output
e.g. $2a$12$K8RDN...[53 chars]...
Contains algorithm, cost, salt, hash — one string
```

---

## 7. Session Management

```
SESSION LIFETIME:
Access token:  15 minutes (stateless)
Refresh token: 7 days (stateful, revocable)

SESSION ENDS when:
- Refresh token expires (7 days)
- User logs out (refresh token revoked)
- Password reset (ALL tokens revoked)
- Reuse detected (entire family revoked)

MULTIPLE SESSIONS:
Each device has its own refresh token family.
Logging out on one device does not affect others.

LOGOUT EVERYWHERE:
UPDATE refreshTokens
SET revokedAt = NOW()
WHERE userId = $userId AND revokedAt IS NULL

SILENT REFRESH:
Frontend refreshes access token ~2 minutes before
expiry. User never sees a login prompt during
normal usage.
```

---

## 8. JWT_SECRET Rotation (Zero User Impact)

```
NAIVE ROTATION: Update secret, restart pods,
all users logged out immediately. Unacceptable.

CORRECT ROTATION — dual-secret window:

Phase 1: Add JWT_SECRET_NEW alongside JWT_SECRET
         Middleware issues with NEW, validates EITHER
         Rolling restart — old tokens still valid

Phase 2: Wait 15 minutes
         All old access tokens expire naturally

Phase 3: Remove JWT_SECRET, keep only JWT_SECRET_NEW
         Rolling restart

Total time: ~20 minutes. Zero user impact.
```

---

## References

- ADR-005: JWT vs session-based auth
- Threat model: threat-model.md (S1, S2, S3, E1, E2, E3)
- Schema: schema.md (refreshTokens, userIdentities tables)
- OpenAPI spec: openapi.yaml (auth endpoint contracts)
- Requirements: FR-01 through FR-08, NFR-13, NFR-14, NFR-16, NFR-25
- OWASP Authentication Cheat Sheet
- RFC 7519 (JWT specification)