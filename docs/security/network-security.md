# Wrench — Network Security Design

## Purpose

This document describes the network security
architecture for Wrench — VPC layout, subnet
segmentation, security group rules, TLS
configuration, secrets management, and
the controls that protect the infrastructure
layer independent of application-level security.

Related: threat-model.md — T2 (MITM), S4 (channel token)
Related ADR: ADR-008 — Kong API Gateway

---

## 1. Network Architecture Overview

```
PUBLIC INTERNET
      |
      | HTTPS (TLS 1.2+)
      |
[DNS / Cloud L4 Load Balancer]
      |
      | HTTPS (TLS 1.2+)
      |
PUBLIC SUBNET (internet-accessible)
  [Kong API Gateway — 2 nodes, active/active]
      |
      | HTTP (private network — no internet route)
      |
PRIVATE SUBNET AZ-1 (10.0.1.0/24)     PRIVATE SUBNET AZ-2 (10.0.2.0/24)
  [Go API Pods x3]                       [Go API Pods x3]
      |                                       |
      +---[PgBouncer]---[Postgres Primary]----+
      |                [Postgres Replicas]
      +---[Redis Cluster]
```

Every component that does not need to be
internet-accessible lives in a private subnet.
The public internet can only reach Kong.
Everything behind Kong requires being inside
the VPC.

---

## 2. Subnet Design

### Public Subnet

```
CIDR: determined by hosting provider (Railway/Fly.io)
Contains: Kong API Gateway nodes only
Internet gateway: YES — Kong must be reachable
                  from the internet
Public IP addresses: YES — Kong nodes have
                     publicly routable IPs

What can reach Kong from the internet:
- Any browser/client on the internet (port 443)
- The DNS/Cloud L4 load balancer (port 443)

What Kong can reach:
- Go API pods in private subnets (port 8080)
- Internet (for outbound connections)
```

### Private Subnets

```
AZ-1: 10.0.1.0/24
AZ-2: 10.0.2.0/24

Contains:
- Go API pods (port 8080)
- PgBouncer (port 5432)
- Redis (port 6379)
- Postgres primary + replicas (port 5432)

Internet gateway: NONE
Public IP addresses: NONE
Inbound from internet: IMPOSSIBLE
  (no route exists — packets are dropped
  at the network level, not rejected)

What private subnet components CAN reach:
- Other resources within the VPC (via security groups)
- Internet for OUTBOUND connections only:
  (via NAT Gateway — allows Go API pods to
  call Claude API, OpenAI, Cloudinary, Grafana
  WITHOUT having a public IP themselves)
```

### Why private subnets matter (defence in depth)

```
SCENARIO WITHOUT subnet segmentation (flat network):

Attacker finds a vulnerability in Kong.
Gets code execution on a Kong node.
From Kong, directly connects to Postgres:
  psql -h 10.0.1.5 -U wrench_app -d wrench
Database dumped. All user data stolen.

SCENARIO WITH subnet segmentation:

Same Kong vulnerability exploited.
Attacker has code execution on Kong node.
Tries to connect to Postgres (private subnet):
  Network drops the packet — no route exists.
Kong cannot reach Postgres even if compromised.
Attacker is contained to the public subnet.
Database is protected by network topology itself.

Two independent compromises required:
1. Compromise Kong (public subnet access)
2. Compromise VPC network controls (private access)
Either alone is not sufficient.
```

---

## 3. Security Groups

Security groups are stateful virtual firewalls
attached to each resource. They control which
IPs and ports can connect to each component.

Security groups reference OTHER security groups
rather than static IPs — when a Go API pod is
replaced (deployment, crash), it gets a new IP
but inherits the same security group. Rules
automatically apply to the new pod. No manual
IP management required.

### Kong Security Group

```
INBOUND:
Allow  TCP 443  from 0.0.0.0/0    (HTTPS from internet)
Allow  TCP 80   from 0.0.0.0/0    (redirect to HTTPS)
Deny   all other inbound

OUTBOUND:
Allow  TCP 8080  to Go API SG     (forward to Go API)
Allow  TCP 443   to 0.0.0.0/0    (health check polling,
                                   Kong management)
```

### Go API Security Group

```
INBOUND:
Allow  TCP 8080  from Kong SG     (requests from Kong only)
Deny   all other inbound
  (Go API pods are NOT directly reachable from
  the internet — only via Kong)

OUTBOUND:
Allow  TCP 5432  to Postgres SG   (database queries)
Allow  TCP 6379  to Redis SG      (cache + rate limiting)
Allow  TCP 443   to 0.0.0.0/0    (Claude API, OpenAI,
                                   Cloudinary, Grafana Cloud)
```

### Postgres Security Group

```
INBOUND:
Allow  TCP 5432  from Go API SG   (application queries)
Allow  TCP 5432  from Admin SG    (DBA access, migrations)
Deny   all other inbound
  (Postgres is NOT reachable from Kong,
  from the internet, or from any other service)

OUTBOUND:
Allow  TCP 5432  to Postgres SG   (replication between
                                   primary and replicas)
```

### Redis Security Group

```
INBOUND:
Allow  TCP 6379  from Go API SG   (cache + rate limiting)
Deny   all other inbound
  (Redis is NOT reachable from Kong or internet)

OUTBOUND:
Allow  TCP 6379  to Redis SG      (cluster communication)
```

### The principle these rules enforce

```
Even with DATABASE_URL in hand, an attacker
outside the VPC cannot connect to Postgres:

Attacker on internet → tries port 5432 on Postgres IP
Security group: "is this from Go API SG?" NO
Security group: packet dropped

DATABASE_URL is useless without:
1. Being inside the VPC AND
2. Having the correct security group
   (only possible by running a Go API pod)

To run a Go API pod requires platform credentials
(Railway/Fly.io account access) — a separate
independent credential from DATABASE_URL.

Two independent credentials required:
DATABASE_URL (the secret) +
Platform access (the network path)

This is defence in depth at the infrastructure level.
```

---

## 4. TLS Configuration

### External traffic (internet → Kong)

```
Protocol:  HTTPS only
TLS:       1.2 minimum, 1.3 preferred (NFR-12)
Ciphers:   Modern cipher suites only
           (ECDHE for forward secrecy,
           AES-GCM for authenticated encryption)
           Weak ciphers (RC4, 3DES, export ciphers)
           disabled

Certificate: managed by hosting provider
             (Railway/Fly.io auto-renews Let's Encrypt)

HSTS header (on all responses):
Strict-Transport-Security: max-age=31536000; includeSubDomains

Effect: browser stores the HSTS policy.
All future requests to api.wrench.ai are
automatically upgraded to HTTPS even if the
user types http:// — the browser never sends
an HTTP request for this domain again.

Forward secrecy:
ECDHE key exchange means even if the server's
private key is compromised in the future,
past recorded traffic cannot be decrypted.
Session keys are ephemeral — never stored.
```

### Internal traffic (Kong → Go API)

```
Protocol:  HTTP (plain)
Encryption: NOT encrypted

Why HTTP is acceptable internally:
- Traffic never leaves the private VPC
- Private subnet has no internet route
- An attacker cannot intercept traffic
  they cannot reach
- TLS overhead (CPU, latency, cert management)
  adds cost with no security benefit inside
  a private network

When this would NOT be acceptable:
- If compliance requirements (PCI-DSS, HIPAA)
  mandate encryption everywhere including
  internal networks
- Wrench does not currently process payment
  card data directly, so PCI-DSS does not apply
- Accepted risk: documented here as a known
  architectural decision

Future consideration:
If Wrench introduces payment processing directly
(currently all costs are tracked but not processed),
enable mutual TLS (mTLS) between Kong and Go API pods.
```

### Database and Redis connections

```
Postgres (via Neon):
TLS required by Neon on all connections
Go API connects with: sslmode=require in DATABASE_URL
Connection is encrypted even though it is within
the private network (Neon's requirement)

Redis:
TLS optional (within private subnet)
Enable for compliance if required
Currently: plain TCP within private subnet
```

---

## 5. Secrets Management

### Secrets inventory

```
Secret                  Used by          Rotation frequency
----------------------------------------------------------
JWT_SECRET              Go API           6-12 months
DATABASE_URL            Go API           6-12 months
REDIS_URL               Go API           6-12 months
CLAUDE_API_KEY          Go API           Quarterly
OPENAI_API_KEY          Go API           Quarterly
CLOUDINARY_URL          Go API           Quarterly
CHANNEL_TOKEN           Go API + Kong    Quarterly
```

### Storage

```
WHERE SECRETS LIVE:
Platform secret store (Railway/Fly.io encrypted
environment variables) — encrypted at rest,
injected into pods as environment variables
at startup.

WHERE SECRETS NEVER LIVE:
- Source code (Go files, config files)
- Git history (any branch, any commit)
- Application logs
- HTTP response bodies or headers
- Client-side code (Next.js bundle)
  Exception: CHANNEL_TOKEN must be in Next.js
  to be sent with API requests — accepted risk
  documented in threat model S4

DATABASE_URL in particular:
The connection string contains the password.
It is protected by:
1. Platform secret store encryption at rest
2. Security group network controls
   (useless without VPC access — see Section 3)
3. Least privilege DB user (see Section 6)
```

### Preventing secrets from reaching git

Three independent layers:

```
LAYER 1 — .gitignore:
.env
.env.local
.env.*.local
*.pem
*.key

Prevents git from ever tracking .env files.

LAYER 2 — Pre-commit hook (detect-secrets):
.pre-commit-config.yaml:
repos:
  - repo: https://github.com/Yelp/detect-secrets
    hooks:
      - id: detect-secrets

Scans every staged file for patterns matching
API keys, connection strings, tokens.
Rejects the commit if secrets are found.
Catches secrets hardcoded in Go files,
test files, config files — not just .env.

Install for every new developer:
pre-commit install

LAYER 3 — GitHub secret scanning:
GitHub automatically scans every push.
For supported providers (Anthropic, OpenAI,
AWS, Cloudinary): GitHub notifies the provider
who can auto-revoke the key.
Catches anything that slipped past layers 1 and 2.
```

### Fail-fast on missing secrets

```
Go API refuses to start if any required secret
is missing or insufficiently strong:

func loadConfig() (*Config, error) {
    var missing []string

    cfg.JWTSecret = os.Getenv("JWT_SECRET")
    if cfg.JWTSecret == "" {
        missing = append(missing, "JWT_SECRET")
    }
    if len(cfg.JWTSecret) < 32 {
        return nil, fmt.Errorf(
            "JWT_SECRET must be at least 32 characters")
    }
    // ... same for all secrets

    if len(missing) > 0 {
        return nil, fmt.Errorf(
            "missing required environment variables: %s",
            strings.Join(missing, ", "))
    }
    return cfg, nil
}

Why fail-fast (not graceful degradation):
An empty JWT_SECRET means all JWTs are signed
with an empty string — forgeable by any attacker.
The application in this state is fundamentally
unsafe. Refusing to start and logging clearly
which variable is missing is the correct response.
A pod that fails startup causes a Kubernetes
CrashLoopBackOff — visible, alertable, fixable.
A pod that starts in a broken state causes
silent security vulnerabilities.
```

### Secret rotation procedure

```
CLAUDE_API_KEY rotation (quarterly):

1. Generate new API key in Anthropic console
2. Update platform secret store:
   railway variables set CLAUDE_API_KEY=new_value
3. Rolling restart of Go API pods
   (pods pick up new env var on restart)
4. Verify: AI chat still working
5. Revoke old key in Anthropic console
6. Document rotation in security log

CHANNEL_TOKEN rotation (quarterly):

1. Generate new token (UUID or 32 random bytes)
2. Update Kong configuration (channel auth plugin)
3. Update platform secret store for Next.js
4. Deploy Next.js with new token
5. Old token remains valid in Kong during
   Next.js deployment window (~2 minutes)
6. Remove old token from Kong once Next.js
   deployment is confirmed

JWT_SECRET rotation (6-12 months):
See auth-design.md Section 8 for the
dual-secret rotation procedure that achieves
zero user impact.

DATABASE_URL rotation (6-12 months):

1. Create new Postgres user password in Neon
2. Update PgBouncer configuration with new password
3. Update platform secret store with new DATABASE_URL
4. Rolling restart of Go API pods
5. Verify: DB connectivity working
6. Revoke old password in Neon
Note: brief connection pool drain during restart
(~30 seconds) — acceptable outage window
```

---

## 6. Database User — Least Privilege

```
The Go API connects to Postgres as wrench_app user.
wrench_app has only the permissions needed to
run the application — nothing more.

GRANTED:
SELECT, INSERT, UPDATE, DELETE
on all tables in the wrench schema

NOT GRANTED:
CREATE TABLE       (cannot modify schema)
DROP TABLE         (cannot delete tables)
TRUNCATE           (cannot bulk delete)
CREATE USER        (cannot create new DB users)
GRANT              (cannot elevate other users)
pg_read_file()     (cannot read server files)
COPY TO/FROM       (cannot import/export files)
SUPERUSER          (never)

CREATE ROLE wrench_app WITH LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE wrench TO wrench_app;
GRANT USAGE ON SCHEMA public TO wrench_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO wrench_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLES TO wrench_app;

EFFECT:
If an attacker somehow connects to Postgres
as wrench_app (despite security group controls):
- Can read and write application data
- CANNOT drop tables or corrupt schema
- CANNOT create backdoor users
- CANNOT read server-side files
- CANNOT execute arbitrary OS commands

The blast radius is bounded to application data.
```

### Separate credentials for migrations

```
Database migrations (schema changes) require
CREATE TABLE, ALTER TABLE, etc.
These are NEVER run by the application user.

Migration user: wrench_migrations
Permissions: SUPERUSER or specific DDL grants
Used only during deployment migration steps
Credentials: separate secret, never in
             the application's DATABASE_URL

Migration flow in CI/CD:
1. CI/CD checks out migration files
2. Connects as wrench_migrations
3. Runs goose up
4. Disconnects
5. Go API pods connect as wrench_app (read/write only)
```

---

## 7. CORS Policy

```
Kong enforces CORS before requests reach the Go API.

Allowed origins:
https://wrench.ai        (production frontend)
http://localhost:3000    (local development only —
                          not in production Kong config)

Allowed methods: GET, POST, PATCH, DELETE, OPTIONS
Allowed headers: Authorization, Content-Type,
                 X-Channel-Token, X-Request-ID

Effect:
A request from https://malicious-site.com
with a valid JWT and channel token:
Kong checks Origin header: "https://malicious-site.com"
Kong: not in allowed origins list
Kong: returns 403, request never reaches Go API

Limitation:
CORS is enforced by the BROWSER.
A server-side request (curl, Postman, a script)
can set any Origin header or omit it entirely.
CORS alone is not a security boundary —
it protects against malicious web pages
making requests on behalf of a logged-in user
(CSRF), not against direct API attacks.
Combined with channel token + JWT: all three
layers must be satisfied for a request to succeed.
```

---

## 8. API Key Security for External Services

### Channel Token (Kong)

```
Purpose: identify requests from the Wrench
         frontend vs arbitrary direct API calls

Risk: extractable from Next.js bundle by
      any user with DevTools (threat model S4)

Current mitigation:
- CORS enforcement as second perimeter layer
- JWT required for all data access
- Channel token alone gives no data access

Future mitigation (when risk profile warrants):
Backend-for-Frontend (BFF) pattern:
All API calls made from Next.js SERVER components,
not from the browser. Channel token lives
server-side only, never in the browser bundle.
Eliminates extraction risk entirely.
```

### External API Keys (Claude, OpenAI, Cloudinary)

```
These keys are called FROM the Go API server.
They never reach the browser.
They are never returned in API responses.
They are never logged.

Go API calls external APIs directly from
Go API pods — outbound HTTPS via NAT Gateway.
The browser never sees these credentials.

If CLAUDE_API_KEY is leaked:
- Attacker can call Claude API from anywhere
- Billed to Wrench's Anthropic account
- No user data is exposed (Claude API is stateless)
- Mitigation: revoke and rotate immediately
- Detection: cost spike alert in Grafana
```

---

## 9. Incident Response — Secret Exposure

```
If ANY secret is suspected to be compromised:

IMMEDIATE (within 5 minutes):
1. Revoke the compromised secret at the source
   (Anthropic console, Neon, Railway, etc.)
2. Generate replacement secret
3. Update platform secret store
4. Rolling restart of affected pods

INVESTIGATION (within 1 hour):
5. Review usage logs for the compromised secret
   at the provider (Anthropic usage dashboard,
   Neon connection logs, etc.)
6. Determine: when was it exposed? how?
   who might have accessed it?
7. Assess blast radius: what can be done with
   this secret? was it used maliciously?

REMEDIATION:
8. If user data may have been accessed:
   assess notification obligations (GDPR Article 33
   — notify supervisory authority within 72 hours
   of becoming aware of a breach)
9. Update .gitignore and pre-commit hooks
   to prevent recurrence
10. Document in incident log

GITHUB-SPECIFIC (if committed to a repo):
11. Remove from git history:
    git filter-branch or BFG Repo Cleaner
    Force push — coordinate with team
12. GitHub will flag the secret — follow their
    guidance on the security advisory
```

---

## References

- ADR-008: Kong API Gateway
- ADR-005: JWT authentication (secret rotation)
- Threat model: threat-model.md
  T2 (MITM), S4 (channel token)
- Auth design: auth-design.md (JWT_SECRET rotation)
- Requirements: NFR-12 (TLS), NFR-17 (ownership),
  NFR-28 (GDPR), NFR-29 (PII in logs)
- OWASP Network Security Cheat Sheet