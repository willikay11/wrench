# ADR-002: Vector Storage — PostgreSQL + pgvector vs Dedicated Vector Database

## Status
Accepted

## Date
2026-06-22

## Context
Wrench's AI assistant uses Retrieval-Augmented Generation
(RAG) to answer questions about a user's specific car.
This requires storing and searching vector embeddings
generated from car records (modifications, service
history, build notes, car profile, garage tools).

At 10,000 users with an average of 2 cars and 30
modifications per car, the estimated embedding count
at launch is approximately 1.2 million vectors
(see capacity-estimation.md for full calculations).

Each embedding vector is 1,536 dimensions (OpenAI
text-embedding-3-small), requiring 6KB of storage
per vector.

A vector storage solution must support:
- Storing embeddings alongside their source records
- Cosine similarity search to find the most
  semantically relevant records for a given query
- Filtering by car_id and source_type to scope
  searches to the correct user's car
- Sub-100ms p95 similarity search latency
- Transactional consistency with application data

Four options were evaluated:
1. PostgreSQL with pgvector extension
2. Pinecone (managed vector database)
3. Weaviate (open source vector database)
4. Qdrant (open source vector database)

## Decision
Use **PostgreSQL with the pgvector extension** in the
same Postgres instance as the application database.

Embeddings are stored in a dedicated `embeddings` table
with the following structure:

```sql
CREATE TABLE embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id      UUID REFERENCES cars(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  source_type VARCHAR NOT NULL,
  source_id   UUID NOT NULL,
  content     TEXT NOT NULL,
  vector      VECTOR(1536) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON embeddings
USING hnsw (vector vector_cosine_ops);

CREATE INDEX ON embeddings (car_id, source_type);
CREATE INDEX ON embeddings (user_id, source_type);
```

The HNSW index is used for approximate nearest
neighbour search, providing sub-10ms similarity
search at expected launch scale.

## Reasoning

### Why pgvector over dedicated vector databases

**Operational simplicity:**
Wrench already requires PostgreSQL for relational
data. Adding pgvector is a single SQL command
(CREATE EXTENSION vector) with no additional
service to deploy, monitor, or maintain.

Each dedicated vector database (Pinecone, Weaviate,
Qdrant) adds:
- An additional service in the infrastructure stack
- An additional set of credentials to manage
- An additional failure mode to handle
- An additional cost centre
- An additional API to learn and maintain

For a product at launch stage with a single
engineer, operational simplicity is a material
advantage.

**Transactional consistency:**
When a user adds a modification, two things must
happen atomically:
1. The modification record is saved to Postgres
2. The embedding is generated and stored

With pgvector, both operations occur in the same
database transaction. If either fails, both are
rolled back. The modification record and its
embedding are always in sync.

With a dedicated vector database, these are two
separate write operations across two different
systems. A failure between them leaves the systems
in an inconsistent state — a modification exists
in Postgres with no corresponding embedding, making
it invisible to the AI assistant. Resolving this
requires a reconciliation job and additional
complexity.

**Query simplicity:**
RAG retrieval in Wrench filters embeddings by
car_id and source_type before performing similarity
search. With pgvector this is a single SQL query
combining a standard WHERE clause with a vector
operator:

```sql
SELECT content, source_type, source_id,
       1 - (vector <=> $1) AS similarity
FROM embeddings
WHERE car_id = $2
AND source_type = ANY($3)
ORDER BY vector <=> $1
LIMIT 8;
```

With a dedicated vector database, metadata
filtering and vector search are handled differently
across providers — some support pre-filtering,
some post-filtering, some require storing metadata
as separate fields. The SQL approach is simpler,
more expressive, and easier to reason about.

**Performance at expected scale:**
pgvector with an HNSW index performs cosine
similarity search in 5-50ms for collections up to
approximately 5 million vectors. At launch scale
(1.2 million vectors) this comfortably meets the
sub-100ms latency budget for RAG retrieval.

Dedicated vector databases offer marginally better
performance at very large scale but this advantage
is not material at Wrench's projected user counts
for the first 12-18 months.

**Cost:**
pgvector is free and open source. It runs on the
existing Postgres instance (Neon) at no additional
cost beyond storage.

Pinecone's starter plan is free but the jump to
paid tiers is significant. Weaviate and Qdrant
require self-hosting (operational overhead) or
managed hosting (additional cost).

### Why the embeddings table is separate from source tables

An earlier design considered storing the embedding
vector as a column on each source table
(cars.embeddings, carMods.embeddings, etc.).

This was rejected for three reasons:

1. A single source record may require multiple
   embeddings (car profile, car specifications,
   known issues). An inline column supports only
   one vector per row.

2. Vector columns (6KB each) would inflate every
   row in every table, causing performance
   degradation on queries that do not need vectors
   (e.g. fetching the car list for the garage page).

3. A unified embeddings table allows a single
   similarity search across all source types
   simultaneously, ranked by relevance. Inline
   columns would require separate queries per
   table and manual result merging.

### Why HNSW over IVFFlat index

pgvector supports two index types:
- IVFFlat: faster to build, lower memory, better
  for very large datasets (10M+ vectors)
- HNSW: better recall, faster queries, higher
  memory usage

At Wrench's expected scale (1.2M vectors at launch,
~6M at 50K users) HNSW provides better query
performance and recall accuracy. The higher memory
usage is acceptable on the provisioned database
instance.

## Consequences

### Positive
- Single database to operate, monitor, and back up
- Transactional consistency between app data and
  embeddings at no additional complexity cost
- Familiar SQL query language for all vector
  operations including metadata filtering
- No additional service credentials or failure modes
- Zero additional cost at launch scale
- HNSW index delivers sub-10ms similarity search
  at expected launch scale

### Negative
- pgvector performance degrades above approximately
  5 million vectors without careful index tuning
- Vector storage (7.2GB at 10K users, 72GB at 100K
  users) increases Postgres storage requirements
  significantly
- pgvector does not support distributed vector
  search across multiple Postgres nodes — all
  vectors must fit on one instance

## Migration Trigger
This decision will be revisited when ANY of the
following conditions are met:

1. Total embedding count exceeds 4 million rows
2. p95 cosine similarity search latency exceeds
   80ms under normal load
3. pgvector storage exceeds 60GB on the primary
   instance, causing storage cost to exceed the
   cost of a managed vector database

At that point, migration to Qdrant (self-hosted
for cost control) or Pinecone (managed, less ops)
will be evaluated. The migration path is:
1. Stand up the dedicated vector database
2. Backfill all existing embeddings
3. Dual-write to both stores during transition
4. Verify parity in similarity search results
5. Cut over reads to dedicated store
6. Decommission pgvector table

## Alternatives Rejected

**Pinecone:**
Managed vector database with excellent performance
and developer experience. Rejected because it adds
an additional service with significant cost above
the free tier, no transactional consistency with
Postgres, and operational overhead not justified
at current scale.

**Weaviate:**
Open source vector database with rich filtering
and multi-modal support. Rejected because
self-hosting adds infrastructure complexity,
and the managed cloud offering adds cost. The
multi-modal capabilities (image embeddings) are
not needed at launch as Wrench uses text
embeddings only.

**Qdrant:**
High-performance open source vector database.
Rejected for the same reasons as Weaviate at
this stage. Qdrant is the preferred migration
target if pgvector limits are reached, due to
its performance characteristics and Rust-based
efficiency.

## References
- Capacity estimates: /docs/capacity-estimation.md
- Embedding strategy: /docs/schema.md
- Requirements: FR-15 (RAG pipeline), FR-21, FR-22
- Related ADRs: ADR-001 (REST API), ADR-004 (read replica)
- pgvector documentation: https://github.com/pgvector/pgvector