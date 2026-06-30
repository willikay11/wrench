# Wrench — Capacity Estimation

## Purpose

This document estimates Wrench's infrastructure
requirements at three growth stages: 10,000 users
(launch), 100,000 users, and 1,000,000 users.

Every number below follows a four-step framework:

```
1. ANCHOR       — establish known baseline inputs
2. EXTRAPOLATE  — multiply out to real volumes
3. CONVERT      — get everything into comparable units
4. CONCLUDE     — answer "so what" architectural
                   questions from the numbers
```

All assumptions are stated explicitly. Where an
assumption is deliberately pessimistic (worst case),
this is called out, since capacity planning should
never underestimate load.

---

## 1. Anchor — Known Inputs

```
Users at launch:            10,000
Peak concurrency assumption: 5% of users active
                              at any given moment
Cars per user:               avg 2, max 10
Modifications per car:       avg 30
Service records per car:     avg 20 (estimated)
AI queries per user:         20 per day (max allowed,
                              see NFR-15 rate limit)
Realistic daily active AI users: 10% of registered
                              users (most users do not
                              hit their daily limit
                              every single day)
Photos per car:               avg 10
Photo size:                   avg 2MB
Embedding dimensions:         1536
                              (OpenAI text-embedding-3-small)
Bytes per embedding dimension: 4 (float32)
```

---

## 2. Extrapolate — Real Volumes

### Concurrent users

```
10,000 users × 5% peak concurrency
= 500 concurrent users at peak (10K user stage)
```

### Database records

```
Cars:
10,000 users × 2 cars avg
= 20,000 cars

Modifications:
20,000 cars × 30 mods avg
= 600,000 modification records

Service records:
20,000 cars × 20 records avg
= 400,000 service records

Total core DB records (10K users):
~1,020,000 rows across cars, mods, and
service records (excluding budget entries,
build stages/tasks, and AI conversation data,
which are estimated separately below)
```

### AI requests — converting daily volume to RPS

This conversion uses 86,400 (seconds in a day)
as the standard divisor for any daily-to-per-second
calculation.

```
Theoretical maximum (every user hits their daily
limit — used only to validate the rate limit
design, not as a realistic load assumption):

10,000 users × 20 queries/day (max per NFR-15)
= 200,000 AI requests/day (theoretical ceiling)

200,000 ÷ 86,400 seconds/day
= 2.3 requests/second average (theoretical)

Realistic daily active assumption (10% of users
actually using AI on any given day):

10,000 users × 10% × 20 queries/day
= 20,000 AI requests/day (realistic)

20,000 ÷ 86,400
= 0.23 requests/second average (realistic)

Peak multiplier (evening/weekend usage spike,
assumed 10x average — project car work happens
evenings and weekends):

0.23 × 10
= 2.3 requests/second at peak (realistic)

For infrastructure sizing, the THEORETICAL ceiling
(2.3 req/sec average, ~23 req/sec at 10x peak)
is used as the design target, since rate limiting
(NFR-15) makes this the worst case the system must
survive even if never actually reached in practice.
```

---

## 3. Convert — Storage and Cost

### Storage calculation framework

```
Storage = number of records × size per record
Convert: 1,000 bytes = 1 KB, 1,000 KB = 1 MB,
         1,000 MB = 1 GB, 1,000 GB = 1 TB
```

### Photo storage

```
Cars:                20,000
Photos per car:       × 10
─────────────────────────────
Total photos:         200,000

Photos:               200,000
Size per photo:        × 2 MB
─────────────────────────────
Total:                 400,000 MB
÷ 1,000 MB/GB
─────────────────────────────
Photo storage (10K users): 400 GB
```

### Embedding vector storage

```
Vector size formula:
dimensions × bytes per dimension
= 1536 × 4 bytes
= 6,144 bytes ≈ 6 KB per vector

Records that get embedded (10K users):
Modifications:        600,000
Service records:      400,000
Car profiles:           20,000 (1 per car minimum)
Car specs:               20,000
Car knowledge:           20,000
Build notes (est):      ~200,000
Garage tools (est):       ~50,000
──────────────────────────────────
Total embeddings:      ~1,310,000

Total vector storage:
1,310,000 × 6 KB
= 7,860,000 KB
÷ 1,000 KB/MB
= 7,860 MB
÷ 1,000 MB/GB
≈ 7.9 GB of vector storage (10K users)
```

### Postgres row size estimation

```
Example — modifications table, per row:

Column          Type            Size
─────────────────────────────────────
id              UUID            16 bytes
car_id          UUID            16 bytes
name            VARCHAR(100)    ~30 bytes (avg input)
category        VARCHAR(50)     ~15 bytes
description     TEXT            ~100 bytes (avg)
notes           TEXT            ~100 bytes (avg)
cost            BIGINT          8 bytes (cents)
installation_at TIMESTAMPTZ     8 bytes
created_at      TIMESTAMPTZ     8 bytes
updated_at      TIMESTAMPTZ     8 bytes
source          VARCHAR(20)     ~12 bytes
confirmed       BOOLEAN         1 byte
row overhead    (system MVCC)   ~23 bytes
─────────────────────────────────────
Total per row:                  ~345 bytes ≈ 350 bytes

Modifications table:
600,000 rows × 350 bytes
= 210,000,000 bytes
÷ 1,000,000 bytes/MB
= 210 MB (modifications table, 10K users)

Applying similar estimates across all core tables
(cars, service records, build stages/tasks, budget
entries, AI conversations/messages, garage tools):

Total core Postgres storage (10K users): ~2 GB
(modifications, service records, and AI message
history are the largest contributors; auth and
user tables are comparatively small)
```

### Claude API cost

```
Tokens per AI request (estimate):
System prompt + car context:    800 tokens
Retrieved RAG chunks (5×200):  1,000 tokens
User question:                    50 tokens
─────────────────────────────────────────
Total input tokens:             1,850 tokens

AI response (avg output):         300 tokens

Claude Sonnet pricing (reference):
Input:  $3.00 per million tokens
Output: $15.00 per million tokens

Theoretical ceiling (200,000 requests/day,
every user at their daily limit):

Input cost:
200,000 × 1,850 tokens = 370,000,000 tokens/day
370,000,000 ÷ 1,000,000 × $3.00 = $1,110/day

Output cost:
200,000 × 300 tokens = 60,000,000 tokens/day
60,000,000 ÷ 1,000,000 × $15.00 = $900/day

Theoretical ceiling: ~$2,010/day (~$60,300/month)
This figure exists to validate that rate limiting
(NFR-15) is necessary — without it, a small number
of power users could drive costs to this level.

Realistic estimate (10% daily active, 20,000
requests/day):

20,000 ÷ 200,000 × $2,010/day
= ~$201/day
= ~$6,030/month (10K users, realistic)
```

---

## 4. Conclude — Architectural Decisions Driven by These Numbers

### What read/write ratio do you expect?

```
Typical user session (open app, check car, ask
AI question):

READS:
Load garage (car list):              1
Load car profile (mods, history):  3-5
Load build plan:                     2
AI context retrieval (RAG):          1
Load conversation history:           1
─────────────────────────────────────
Total reads per session:          ~8-10

WRITES:
Add a modification:                  1
Log a service record:                1
Ask AI question (save message):      1
─────────────────────────────────────
Total writes per session:           ~3

Read/write ratio: approximately 3:1 to 4:1

CONCLUSION: Wrench is read-heavy. This justifies:
- Read replicas for the database tier (ADR-004)
- Aggressive caching of car profiles in Redis (ADR-003)
```

### What is the most expensive operation per user?

```
Ranked by cost (compute time + external API +
storage I/O):

1. AI chat with RAG (most expensive)
   Embed query (~10ms, ~$0.00002)
   Vector search (~5-50ms via pgvector HNSW)
   Claude API call (~2-5s, ~$0.01 per query)
   SSE streaming connection held 8-10s

2. Photo/inspiration image upload
   Cloudinary upload (~2-3s for 2MB)
   Optional embedding of caption/metadata

3. Build plan generation from inspiration image
   Vision API call — most expensive single
   operation, ~$0.05+ per call

4. CRUD operations (cheapest)
   DB read/write: ~5-20ms
   No external API calls

CONCLUSION: The AI chat endpoint is the most
expensive operation by roughly 100x relative to
standard CRUD. This justifies:
- Rate limiting AI endpoints first and most
  strictly (NFR-15)
- Designing the circuit breaker (ADR for failure
  modes) around the AI/Claude dependency first
- Tracking Claude API cost as a first-class
  metric (ADR-006)
```

### At what user count do you need a read replica?

```
A single small Postgres instance (2 vCPU, 4GB RAM)
handles roughly 1,000-5,000 simple queries/second.

At 10K users, 3:1 read ratio, 500 peak concurrent
users, ~10 reads per session, ~30 second average
session:

Peak reads/second ≈ 500 × 10 ÷ 30 ≈ 167 reads/second

CONCLUSION: A single primary comfortably handles
10K users on read load alone. However, Wrench
introduces a read replica from DAY ONE — not
because of load, but because RAG vector searches
(50-200ms each) should not compete with write
traffic on the primary (see ADR-004).

Load-driven need for a SECOND replica is expected
around 50K users, when replica CPU utilization
is projected to approach 60-70% under sustained
normal load.
```

### At what volume does pgvector need a dedicated
### vector database?

```
pgvector with an HNSW index performs reliably up
to approximately 5 million vectors before query
latency degrades meaningfully.

Embeddings by user count:
10K users:    ~1.3M vectors   (comfortable)
50K users:    ~6.5M vectors   (approaching limit)
100K users:   ~13M vectors    (over limit)

CONCLUSION: pgvector (ADR-002) is sufficient up to
approximately 40-50K users. The documented
migration trigger is: embedding count exceeds
4 million rows, OR p95 similarity search latency
exceeds 80ms — whichever occurs first.
```

---

## Summary Table — Wrench Capacity Estimates

```
                          10K users   100K users   1M users
─────────────────────────────────────────────────────────
Concurrent users (5%)        500         5,000       50,000
Total cars                20,000      200,000    2,000,000
Total mod records        600,000    6,000,000   60,000,000
Total embeddings           1.3M         13M          130M
AI requests/day (10% DAU) 20,000      200,000    2,000,000
AI requests/sec (peak)       2.3         23           230
─────────────────────────────────────────────────────────
STORAGE
Photo storage              400 GB        4 TB         40 TB
Vector storage              7.9 GB       79 GB        790 GB
Postgres (core tables)      ~2 GB        ~20 GB       ~200 GB
Total storage              ~410 GB      ~4.1 TB       ~41 TB
─────────────────────────────────────────────────────────
COST (realistic, 10% daily active)
Claude API/month          ~$6,030      ~$60,300    ~$603,000
Embedding API/month          ~$50         ~$500        ~$5,000
Cloudinary/month               ~$0*        ~$200        ~$2,000
Postgres (Neon)/month          ~$0*        ~$100         ~$500
─────────────────────────────────────────────────────────
* within free tier at this stage
```

---

## Key Assumptions and Their Limitations

```
Every estimate above uses STATED, PESSIMISTIC
assumptions deliberately, so the system is never
underprovisioned:

- 5% concurrency is a standard industry estimate
  for consumer apps; actual concurrency for Wrench
  is unknown until production data exists
- 10% daily active rate is an estimate; will be
  replaced with real data after launch
- 10x peak multiplier for evening/weekend usage
  is an estimate based on the nature of project
  car work, not measured data
- Theoretical ceiling figures (every user at their
  rate limit) are used for infrastructure sizing
  and cost-control validation, not as realistic
  load assumptions

This document should be revisited and updated
with real production data within the first
3 months after launch.
```

---

## References

- Requirements: NFR-09, NFR-10 (scalability targets),
  NFR-15 (AI rate limiting)
- Related ADRs: ADR-002 (pgvector), ADR-003 (Redis),
  ADR-004 (read replicas), ADR-007 (Cloudinary)
- Schema: /docs/schema.md