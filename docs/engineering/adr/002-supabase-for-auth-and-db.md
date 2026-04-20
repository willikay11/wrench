# ADR 002: Supabase for Auth, Database, and Storage

**Date:** 2026-03-31  
**Status:** Accepted  
**Deciders:** Engineering team

## Context

Wrench needs:
- User authentication with OAuth (Google login)
- PostgreSQL database with Row Level Security
- File storage for car images
- Vector embeddings for semantic search
- Local development environment that mirrors production
- Real-time subscriptions (future)

Without Supabase, this means managing:
1. Auth service (AWS Cognito, Auth0, or Keycloak)
2. PostgreSQL instance
3. S3 or similar storage
4. Vector database (separate)
5. Local versions of all four

## Decision

We chose **Supabase** as an all-in-one platform for auth, database, storage, and vectors.

## Rationale

### 1. RLS (Row Level Security) at the Database Layer
This is the killer feature. Supabase uses PostgreSQL's native RLS policies:

```sql
-- Rows are filtered by Postgres, not application code
create policy "Users can see their own builds"
  on public.builds for select
  using (auth.uid() = user_id);
```

If the API has a bug that tries to read another user's build, Postgres rejects it. This is **defense in depth** — the database enforces authorization.

Alternatives like Firebase don't have this; you must trust the application layer.

### 2. Local Development Environment
`supabase start` gives you:
- PostgreSQL 17 locally (mirror of production)
- Auth (with Google OAuth configured)
- Storage with S3-compatible API
- pgvector for embeddings
- Supabase Studio UI

No Docker containers to orchestrate manually. This is massive for DX.

### 3. Built-in pgvector
Semantic search on builds (finding similar projects) is just:
```sql
SELECT * FROM builds ORDER BY embedding <-> query_embedding LIMIT 5;
```

No separate vector DB (Pinecone, Weaviate). PostgreSQL handles it.

### 4. TypeScript Types Generated from Schema
`supabase db types` auto-generates TypeScript from your schema. Frontend types stay in sync with backend without manual work.

### 5. One Vendor, Five Services Replaced
| Need | Traditional | Supabase |
|------|-----------|----------|
| Auth | Auth0 / Cognito | Built-in |
| Database | RDS PostgreSQL | Built-in |
| Storage | S3 | Built-in |
| Vectors | Pinecone / Weaviate | pgvector (built-in) |
| Real-time | Socket.io / WebSocket server | Built-in |

This consolidation reduces operational complexity.

### 6. Excellent Python Support
The `supabase-py` client is first-class. FastAPI integrates cleanly:

```python
from supabase import create_client
supabase = create_client(url, key)
response = supabase.table("builds").select("*").execute()
```

Works with async out of the box.

## Tradeoffs

### Downside 1: Vendor Lock-in
- Auth tokens, session management tied to Supabase
- Storage buckets are Supabase-specific
- Migrating away requires rewriting auth and storage layers

**Severity:** Medium. Auth0 or Cognito also lock you in; the difference is degree, not kind.

**Mitigation:** Keep application code loosely coupled via interfaces. If we ever need to swap, the `supabase` client calls are isolated to `apps/api/app/core/supabase.py`.

### Downside 2: Limited Control Over Database
- Can't write arbitrary C extensions
- Can't tune PostgreSQL internals directly (on free tier)
- Backup/restore is Supabase's way, not ours

**Severity:** Low for our use case. We're not running machine learning on Postgres or managing millions of requests.

**Mitigation:** Supabase Cloud gives you more control. Free tier is fine for development; production might need paid tier.

### Downside 3: Cost at Scale
- Supabase Cloud billing is per-project
- Realtime connections have per-month limits
- Storage egress can add up

**Severity:** Low initially. Wrench is small. If we hit scale (10k+ users), we'd re-evaluate, but for MVP, Supabase Cloud free tier is viable.

**Mitigation:** Render FastAPI ($7/month) + Supabase Cloud Pro ($25/month) = $32/month total for production. Acceptable.

### Downside 4: Learning Curve on RLS
RLS policies are powerful but require SQL thinking. Easy to get wrong:

```sql
-- Oops: users can read all builds
create policy "anyone can read"
  on public.builds for select using (true);
```

**Mitigation:** Supabase docs are excellent. We enforce code review on all RLS changes. Schema is in git.

## Alternatives Considered

### Firebase Realtime Database
- **Pros:** Simple, real-time, no schema
- **Cons:** No RLS, denormalized data structure, harder to write complex queries

### Auth0 + RDS + S3
- **Pros:** Maximum control, true multi-cloud
- **Cons:** Manages three vendors, local dev setup is manual, costs more

### Clerk Auth + Supabase Database
- **Pros:** Separates concerns
- **Cons:** Introduces a second OAuth vendor, added complexity

## Related Decisions

- [ADR 001: FastAPI Over Node](./001-fastapi-over-node.md) — FastAPI is Python-first, Supabase has good Python support
- [ADR 003: AI Provider Abstraction](./003-ai-provider-abstraction.md) — Supabase does not lock us into an AI provider

## Implementation Notes

1. **Local dev:** `supabase start` in `packages/supabase/`
2. **Migrations:** SQL files in `packages/supabase/migrations/`, auto-run on `supabase db push`
3. **RLS:** All tables have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
4. **Public schema:** Tables in `public` schema; RLS visible in migrations
5. **Auth methods:** Google OAuth only (configured in `config.toml`)

See [Setup Guide](../setup.md) and [Database Schema](../architecture/database-schema.md).

## Consequences

- ✅ Auth, DB, and storage all in one
- ✅ RLS enforces authorization at the database layer
- ✅ Excellent local development experience
- ✅ pgvector built-in for future embeddings/search
- ⚠️ Locked into Supabase for auth and storage
- 📌 Migration away would require weeks of work
- 📌 Schema changes go through Supabase CLI, not raw SQL (mostly good, sometimes limiting)

## Decision Log

- **Confirmed** 2026-03-31 after spike on local Supabase experience
- **No blockers found** during prototype (image upload, RLS, SSR auth all work)
