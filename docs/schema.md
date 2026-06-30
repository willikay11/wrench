# Wrench — Database Schema Design

## Purpose

This document describes every table in Wrench's
PostgreSQL schema: column types and constraints,
foreign key relationships, index strategy and the
queries that justify each index, and any deliberate
denormalisation decisions.

Database: PostgreSQL with the `pgvector` extension
enabled. Hosted on Neon (primary + 2 read replicas,
see ADR-004).

ER diagram: see `/docs/architecture/wrench-erd.png`
(exported from dbdiagram.io)

---

## Naming Conventions

```
Tables:        camelCase, plural (e.g. userPasswords)
Columns:       camelCase (e.g. createdAt)
Primary keys:  id, UUID, generated via gen_random_uuid()
Foreign keys:  {table}Id (e.g. carId, userId)
Timestamps:    createdAt, updatedAt on every table
               (TIMESTAMPTZ, default NOW())
Money:         stored as BIGINT in cents/pence —
               never DECIMAL/FLOAT — to avoid
               floating point rounding errors
Enums:         stored as VARCHAR with a CHECK
               constraint listing allowed values,
               not native Postgres ENUM type
               (CHECK constraints are easier to
               modify without a schema migration
               that locks the table)
```

---

## Authentication & Authorization

### users

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  displayName   VARCHAR(50) NOT NULL,
  avatarUrl     VARCHAR,
  email         VARCHAR NOT NULL UNIQUE,
  phoneNumber   VARCHAR,
  status        VARCHAR NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'suspended')),
  lastLogin     TIMESTAMPTZ,
  createdAt     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_email ON users(email);
```

**Index rationale:** `email` is queried on every
login attempt and registration (uniqueness check).
A unique index both enforces the constraint and
serves the lookup.

### userPasswords

```sql
CREATE TABLE userPasswords (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId      UUID NOT NULL REFERENCES users(id)
              ON DELETE CASCADE,
  password    TEXT NOT NULL,  -- bcrypt hash, cost 12
  createdAt   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_userpasswords_userid
  ON userPasswords(userId);
```

**Why separate from `users`:** Allows a user to
authenticate via OAuth only (no password row exists)
without nullable password columns cluttering the
core `users` table. See `userIdentities` below for
the OAuth equivalent.

### userIdentities

```sql
CREATE TABLE userIdentities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId          UUID NOT NULL REFERENCES users(id)
                  ON DELETE CASCADE,
  provider        VARCHAR NOT NULL,  -- 'google'
  providerEmail   VARCHAR NOT NULL,
  providerUserId  VARCHAR NOT NULL,
  providerData    JSONB,
  createdAt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_useridentities_provider_userid
  ON userIdentities(provider, providerUserId);
CREATE INDEX idx_useridentities_userid
  ON userIdentities(userId);
```

**Index rationale:** The composite unique index on
`(provider, providerUserId)` is the lookup used on
every Google OAuth login — "does this Google account
already have a Wrench user?" `userId` index supports
listing all linked identities for a given user
(e.g. an account settings page).

### refreshTokens

```sql
CREATE TABLE refreshTokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId      UUID NOT NULL REFERENCES users(id)
              ON DELETE CASCADE,
  tokenHash   VARCHAR NOT NULL,  -- bcrypt hash
  family      UUID NOT NULL,     -- reuse detection group
  expiresAt   TIMESTAMPTZ NOT NULL,
  revokedAt   TIMESTAMPTZ,
  createdAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refreshtokens_userid
  ON refreshTokens(userId);
CREATE INDEX idx_refreshtokens_family
  ON refreshTokens(family);
CREATE INDEX idx_refreshtokens_tokenhash
  ON refreshTokens(tokenHash);
```

**Index rationale:** `tokenHash` is queried on every
refresh request — must be fast. `family` is queried
during reuse detection to revoke an entire token
family at once. `userId` supports "revoke all
sessions for this user" on logout-everywhere or
password reset (see ADR-005).

### roles / permissions / rolePermissions / userRoles

```sql
CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR NOT NULL UNIQUE,
  createdAt   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR NOT NULL UNIQUE,
  description   TEXT,
  createdAt     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rolePermissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roleId        UUID NOT NULL REFERENCES roles(id)
                ON DELETE CASCADE,
  permissionId  UUID NOT NULL REFERENCES permissions(id)
                ON DELETE CASCADE,
  createdAt     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_roleperms_role_perm
  ON rolePermissions(roleId, permissionId);

CREATE TABLE userRoles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId      UUID NOT NULL REFERENCES users(id)
              ON DELETE CASCADE,
  roleId      UUID NOT NULL REFERENCES roles(id)
              ON DELETE CASCADE,
  createdAt   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_userroles_user_role
  ON userRoles(userId, roleId);
CREATE INDEX idx_userroles_userid
  ON userRoles(userId);
```

**Why a join table instead of `roleId` on `users`:**
A direct `users.roleId` column limits a user to
exactly one role. `userRoles` allows a user to hold
multiple roles simultaneously (e.g. both "member"
and "beta_tester") without a schema change.

**Index rationale:** `userId` on `userRoles` supports
the authorization check run on every authenticated
request — "what roles does this user have?"

---

## Cars & Garage

### cars

```sql
CREATE TABLE cars (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId      UUID NOT NULL REFERENCES users(id)
              ON DELETE CASCADE,
  make        VARCHAR(50) NOT NULL,
  model       VARCHAR(50) NOT NULL,
  year        INTEGER NOT NULL
              CHECK (year BETWEEN 1885 AND 2030),
  engine      VARCHAR(100) NOT NULL,
  usageType   VARCHAR NOT NULL
              CHECK (usageType IN
                ('daily', 'track', 'show',
                 'project', 'off-road', 'weekend')),
  notes       TEXT,
  createdAt   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cars_userid ON cars(userId);
```

**Index rationale:** `userId` supports the single
most frequent query in the application — "list all
cars for this user" (the garage page, loaded on
nearly every session).

**Naming note:** `usageType` (not `use`) — `use` is
a reserved word in SQL and would require quoting
on every query.

**Why `engine` is required, not optional:** The AI
assistant's RAG context depends on knowing the car's
engine for nearly every diagnostic or maintenance
question. A car without an engine value produces
materially worse AI responses, so this is enforced
as NOT NULL at creation.

### carMods

```sql
CREATE TABLE carMods (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carId             UUID NOT NULL REFERENCES cars(id)
                    ON DELETE CASCADE,
  name              VARCHAR(100) NOT NULL,
  category          VARCHAR NOT NULL
                    CHECK (category IN
                      ('suspension', 'engine', 'brakes',
                       'exhaust', 'wheels', 'exterior',
                       'interior', 'electronics',
                       'forced_induction', 'drivetrain',
                       'other')),
  description       TEXT,
  notes             TEXT,
  cost              BIGINT CHECK (cost >= 0),  -- cents
  installationDate  DATE,
  isPlanned         BOOLEAN NOT NULL DEFAULT FALSE,
  source            VARCHAR NOT NULL DEFAULT 'user'
                    CHECK (source IN
                      ('user', 'ai_assistant', 'ai_vision')),
  confirmed         BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_carmods_carid ON carMods(carId);
CREATE INDEX idx_carmods_carid_category
  ON carMods(carId, category);
```

**Index rationale:** `carId` supports listing all
mods for a car (mod list view). The composite index
on `(carId, category)` supports the category filter
on the mods list endpoint without a separate scan.

**`confirmed` default:** Defaults to `TRUE` for
`source = 'user'` (a user manually entering data
is inherently confirmed). Application logic sets
`confirmed = FALSE` explicitly when `source` is
`ai_assistant` or `ai_vision`, per FR-33.

### carModPhotos / carServicePhotos / photoUrls

```sql
CREATE TABLE photoUrls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url         VARCHAR NOT NULL,
  createdAt   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE carModPhotos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        VARCHAR NOT NULL,
  carModId    UUID NOT NULL REFERENCES carMods(id)
              ON DELETE CASCADE,
  photoUrlId  UUID NOT NULL REFERENCES photoUrls(id)
              ON DELETE CASCADE,
  createdAt   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_carmodphotos_carmodid
  ON carModPhotos(carModId);

CREATE TABLE carServicePhotos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          VARCHAR NOT NULL,
  carServiceId  UUID NOT NULL REFERENCES carService(id)
                ON DELETE CASCADE,
  photoUrlId    UUID NOT NULL REFERENCES photoUrls(id)
                ON DELETE CASCADE,
  createdAt     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_carservicephotos_carserviceid
  ON carServicePhotos(carServiceId);
```

**Why a central `photoUrls` table:** Both mod photos
and service photos reference Cloudinary URLs through
a shared table rather than storing the URL string
directly on each join table. This normalises the
URL itself in one place, simplifying any future bulk
operations on stored URLs (e.g. a Cloudinary
migration per ADR-007's migration trigger).

### carService

```sql
CREATE TABLE carService (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carId               UUID NOT NULL REFERENCES cars(id)
                      ON DELETE CASCADE,
  type                VARCHAR NOT NULL
                      CHECK (type IN
                        ('oil_change', 'tyre_rotation',
                         'brake_service', 'timing_belt',
                         'coolant_flush',
                         'transmission_service',
                         'differential_service',
                         'alignment', 'inspection', 'other')),
  mileage             INTEGER NOT NULL CHECK (mileage >= 0),
  cost                BIGINT CHECK (cost >= 0),  -- cents
  description         TEXT,
  notes               TEXT,
  performedBy         VARCHAR(100),
  nextServiceMileage  INTEGER,
  servicedAt          DATE NOT NULL DEFAULT CURRENT_DATE,
  createdAt           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_carservice_carid ON carService(carId);
CREATE INDEX idx_carservice_carid_type
  ON carService(carId, type);
```

**Index rationale:** Mirrors `carMods` — `carId`
for the full history list, composite index for the
type filter on the service history endpoint.

**Deliberate non-rejection of out-of-order mileage:**
No CHECK constraint enforces mileage must be higher
than the previous record. This is intentional — see
the service record API design discussion. Lower
mileage is plausible (odometer replacement, importing
historical records out of order) and is handled as
a non-blocking warning at the application layer,
not a database constraint.

---

## Build Planner

### buildStages

```sql
CREATE TABLE buildStages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carId           UUID NOT NULL REFERENCES cars(id)
                  ON DELETE CASCADE,
  userId          UUID NOT NULL REFERENCES users(id)
                  ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  status          VARCHAR NOT NULL DEFAULT 'planned'
                  CHECK (status IN
                    ('planned', 'in_progress', 'complete')),
  "order"         INTEGER NOT NULL,
  estimatedCost   BIGINT CHECK (estimatedCost >= 0),
  actualCost      BIGINT CHECK (actualCost >= 0),
  source          VARCHAR NOT NULL DEFAULT 'user'
                  CHECK (source IN
                    ('user', 'ai_assistant', 'ai_vision')),
  confirmed       BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_buildstages_carid ON buildStages(carId);
CREATE INDEX idx_buildstages_userid ON buildStages(userId);
CREATE INDEX idx_buildstages_carid_order
  ON buildStages(carId, "order");
```

**`order` quoting note:** `order` is a reserved SQL
keyword and must be double-quoted in raw SQL
(`"order"`). sqlc handles this automatically when
generating Go code from named queries — documented
here so it isn't a surprise during migration writing.

**Why `userId` is duplicated here despite `carId`
already implying ownership through `cars.userId`:**
Authorization checks for build stages query
`WHERE carId = $1 AND userId = $2` directly,
avoiding a join through `cars` on every request.
This is a deliberate denormalisation traded for
query simplicity and one fewer join on a
frequently-hit endpoint (the build plan page).

**Index rationale:** The composite index on
`(carId, "order")` directly serves the build plan's
primary read pattern — fetch all stages for a car,
sorted by display order.

### buildTasks

```sql
CREATE TABLE buildTasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buildStageId    UUID NOT NULL REFERENCES buildStages(id)
                  ON DELETE CASCADE,
  title           VARCHAR(200) NOT NULL,
  description     TEXT,
  status          VARCHAR NOT NULL DEFAULT 'pending'
                  CHECK (status IN
                    ('pending', 'in_progress', 'complete')),
  estimatedCost   BIGINT CHECK (estimatedCost >= 0),
  actualCost      BIGINT CHECK (actualCost >= 0),
  dueDate         DATE,
  completedAt     TIMESTAMPTZ,
  source          VARCHAR NOT NULL DEFAULT 'user'
                  CHECK (source IN
                    ('user', 'ai_assistant', 'ai_vision')),
  confirmed       BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_buildtasks_stageid
  ON buildTasks(buildStageId);
```

**Index rationale:** Every task list query is scoped
to a single stage (the build plan's nested response,
see openapi.yaml `/cars/{carId}/build`).

**Application-level invariant (not DB-enforced):**
Setting `status = 'complete'` must set `completedAt`
to the current timestamp; setting it back to
`pending` or `in_progress` must clear `completedAt`.
This is enforced in the service layer, not a DB
trigger, to keep business logic visible in Go code
rather than hidden in the database.

---

## Budget

### budgetEntries

```sql
CREATE TABLE budgetEntries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carId         UUID NOT NULL REFERENCES cars(id)
                ON DELETE CASCADE,
  userId        UUID NOT NULL REFERENCES users(id)
                ON DELETE CASCADE,
  description   VARCHAR(200) NOT NULL,
  amount        BIGINT NOT NULL CHECK (amount > 0),
  category      VARCHAR NOT NULL
                CHECK (category IN
                  ('parts', 'labour', 'tools',
                   'consumables', 'other')),
  entryDate     DATE NOT NULL DEFAULT CURRENT_DATE,
  receiptUrl    VARCHAR,
  createdAt     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_budgetentries_carid ON budgetEntries(carId);
CREATE INDEX idx_budgetentries_carid_category
  ON budgetEntries(carId, category);
CREATE INDEX idx_budgetentries_carid_date
  ON budgetEntries(carId, entryDate);
```

**Index rationale:** Three access patterns drive
the index design — full entry list (`carId`),
category filter (`carId, category`), and date range
filter (`carId, entryDate`) per the budget endpoint's
query parameters.

### budgetTotals (materialised view)

```sql
CREATE MATERIALIZED VIEW budgetTotals AS
SELECT
  carId,
  SUM(amount) AS totalSpend,
  SUM(CASE WHEN category = 'parts'
      THEN amount ELSE 0 END) AS partsTotal,
  SUM(CASE WHEN category = 'labour'
      THEN amount ELSE 0 END) AS labourTotal,
  SUM(CASE WHEN category = 'tools'
      THEN amount ELSE 0 END) AS toolsTotal,
  SUM(CASE WHEN category = 'consumables'
      THEN amount ELSE 0 END) AS consumablesTotal,
  SUM(CASE WHEN category = 'other'
      THEN amount ELSE 0 END) AS otherTotal
FROM budgetEntries
GROUP BY carId;

CREATE UNIQUE INDEX idx_budgettotals_carid
  ON budgetTotals(carId);
```

**Purpose:** Avoids running a `SUM` aggregation on
the primary database on every budget summary read.
Updated incrementally at the application layer on
every budget entry write (not solely via periodic
`REFRESH MATERIALIZED VIEW`, which alone would
serve stale data between refreshes — see the budget
read-routing discussion). A periodic reconciliation
job verifies the view matches a true `SUM` and
corrects any drift. Budget reads always route to
the primary instance (see ADR-004) regardless of
this optimisation, since financial accuracy is
non-negotiable.

---

## Garage Tools

### garageTools

```sql
CREATE TABLE garageTools (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId      UUID NOT NULL REFERENCES users(id)
              ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  brand       VARCHAR(100),
  category    VARCHAR NOT NULL
              CHECK (category IN
                ('hand_tools', 'power_tools', 'lifting',
                 'measuring', 'diagnostic',
                 'consumables', 'other')),
  notes       TEXT,
  createdAt   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_garagetools_userid ON garageTools(userId);
```

**Why `userId`, not `carId`:** Tools belong to the
person, not a specific vehicle — a torque wrench is
reusable across every car a user owns. Modelling
tools as car-scoped would require querying every
car a user owns to assemble a complete tools list
for the AI assistant, and would force duplicate
tool records if a tool is used across multiple cars.
See the dedicated discussion on this design decision
for full reasoning.

**Index rationale:** `userId` is the only access
pattern — "list all tools this user owns" — used
both by the garage tools page and by the AI
assistant's RAG retrieval for tool-aware advice.

---

## AI Assistant

### aiConversations

```sql
CREATE TABLE aiConversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carId       UUID NOT NULL REFERENCES cars(id)
              ON DELETE CASCADE,
  userId      UUID NOT NULL REFERENCES users(id)
              ON DELETE CASCADE,
  title       VARCHAR(200),  -- auto-generated summary
  createdAt   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aiconversations_carid_userid
  ON aiConversations(carId, userId);
CREATE INDEX idx_aiconversations_userid_updated
  ON aiConversations(userId, updatedAt DESC);
```

**Index rationale:** The composite `(carId, userId)`
index serves the ownership check performed on every
chat request when a `conversationId` is provided —
"does this conversation belong to this user and this
car?" The `(userId, updatedAt DESC)` index serves
the conversation list endpoint, ordered most-recent
first.

### aiMessages

```sql
CREATE TABLE aiMessages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversationId    UUID NOT NULL
                    REFERENCES aiConversations(id)
                    ON DELETE CASCADE,
  role              VARCHAR NOT NULL
                    CHECK (role IN ('user', 'assistant')),
  content           TEXT NOT NULL,
  tokenCount        INTEGER,
  createdAt         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aimessages_conversationid_created
  ON aiMessages(conversationId, createdAt ASC);
```

**Index rationale:** Messages are always fetched
for a single conversation, ordered chronologically —
this is the exact shape of the index. `tokenCount`
is nullable to accommodate the user's own messages
(only assistant responses consume Claude output
tokens in a way worth tracking per NFR cost metrics,
though input tokens for context could also be
recorded here if needed for finer-grained cost
attribution later).

---

## AI Embeddings (RAG)

### embeddings

```sql
CREATE TABLE embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carId       UUID REFERENCES cars(id) ON DELETE CASCADE,
  userId      UUID REFERENCES users(id) ON DELETE CASCADE,
  sourceType  VARCHAR NOT NULL
              CHECK (sourceType IN
                ('car_profile', 'car_specs',
                 'car_knowledge', 'modification',
                 'service_record', 'build_stage',
                 'build_task', 'garage_tool')),
  sourceId    UUID NOT NULL,
  content     TEXT NOT NULL,
  vector      VECTOR(1536) NOT NULL,
  createdAt   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_embeddings_carid_sourcetype
  ON embeddings(carId, sourceType);
CREATE INDEX idx_embeddings_userid_sourcetype
  ON embeddings(userId, sourceType);
CREATE INDEX ON embeddings
  USING hnsw (vector vector_cosine_ops);
```

**Why both `carId` and `userId` are nullable:**
Car-scoped embeddings (car profile, mods, service
records — most source types) populate `carId` and
leave `userId` null. Garage tool embeddings are
user-scoped, not car-scoped — they populate `userId`
and leave `carId` null. This single table serves
both RAG retrieval patterns (see ADR-002).

**Index rationale:**
- `(carId, sourceType)` filters embeddings to a
  specific car before similarity search — the
  standard RAG retrieval pattern for car-related
  questions
- `(userId, sourceType)` filters to a specific
  user's garage tools — the RAG retrieval pattern
  for tool-aware AI advice (FR-26)
- The HNSW index on `vector` enables cosine
  similarity search at sub-10ms latency at launch
  scale (see ADR-002 for full reasoning on HNSW
  vs IVFFlat)

**Why this table is separate from source tables
rather than an inline `embeddings` column on
`cars`, `carMods`, etc.:** A single source record
may require multiple distinct embeddings (e.g. a
car has separate `car_profile`, `car_specs`, and
`car_knowledge` embeddings). An inline column
supports only one vector per row. See ADR-002 for
complete reasoning.

---

## Schema-Wide Decisions

### Why UUID primary keys, not auto-incrementing BIGINT

```
UUIDs are used for every primary key despite the
storage cost (16 bytes vs 8 bytes for BIGINT)
because:

1. IDs are exposed in API responses and URLs
   (GET /cars/{carId}). Sequential BIGINT IDs
   leak information — an attacker can infer total
   record counts and enumerate resources by
   incrementing the ID (see the IDOR/enumeration
   discussion in the API design).

2. UUIDs can be generated client-side or in
   application code before an INSERT, useful for
   the embedding ingestion pipeline where an
   embedding's sourceId must reference a record
   that may not yet be committed in the same
   transaction.

This is a deliberate trade-off accepted and
documented — not an oversight. Foreign key storage
cost at current scale (see capacity-estimation.md)
is not a material concern.
```

### Why CHECK constraints instead of native ENUM types

```
Native Postgres ENUM types require ALTER TYPE to
add a new value, and ALTER TYPE ... ADD VALUE
cannot run inside a transaction block in older
Postgres versions, complicating migrations.

VARCHAR + CHECK constraint allows adding a new
allowed value via a simple migration that drops
and recreates the constraint — a more flexible
and predictable migration story as Wrench's
category lists evolve (e.g. adding a new mod
category).
```

### Why money is BIGINT cents, not DECIMAL

```
BIGINT storing the smallest currency unit (cents)
avoids floating point representation errors
entirely. $10.99 is stored as 1099, divided by
100 only at the display layer (see costFormatted
derived fields in the API responses).

DECIMAL(10,2) was considered and rejected — while
DECIMAL avoids floating point issues, BIGINT
arithmetic is simpler, faster, and avoids any
ambiguity around currency precision as Wrench
potentially supports multiple currencies in future
(see the currency field discussion on cost-related
API schemas).
```

---

## References

- ER diagram: /docs/architecture/wrench-erd.png
- ADR-002: pgvector vs dedicated vector database
- ADR-004: Read replica routing strategy
- API contract: /docs/api/openapi.yaml
- Requirements: FR-09 through FR-32