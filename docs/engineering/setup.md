# Development Setup Guide

This guide covers everything needed to run Wrench locally for development.

## Prerequisites

Install these tools before cloning the repository:

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | https://nodejs.org |
| pnpm | 8+ | `npm install -g pnpm` |
| Python | 3.11+ | https://python.org or `brew install python@3.11` |
| Supabase CLI | Latest | https://supabase.com/docs/guides/local-development/cli/installation |
| Docker | Latest | https://www.docker.com/products/docker-desktop |

Verify installation:
```bash
node --version
pnpm --version
python3 --version
supabase --version
docker --version
```

## Clone and Install

```bash
# Clone the repository
git clone <repo-url>
cd wrench

# Install all monorepo dependencies
pnpm install

# Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate  # macOS/Linux
# or: .venv\Scripts\activate  # Windows

# Install API dependencies
pip install -e ./apps/api
pip install pytest pytest-asyncio httpx
```

## Environment Variables

Copy the example env files and fill in your values:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

### apps/web/.env.local

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<YOUR_ANON_KEY>

# Internal API
INTERNAL_API_URL=http://localhost:8000  # http://api:8000 in Docker
INTERNAL_API_SECRET=change-me-in-production

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Getting Supabase keys:**
- Start Supabase locally: `cd packages/supabase && supabase start`
- Keys are printed in the terminal output
- Or view in Supabase Studio: http://localhost:54323

### apps/api/.env

```bash
# Environment
ENVIRONMENT=development

# Supabase
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<YOUR_SERVICE_ROLE_KEY>

# AI Provider (pick one below)
AI_PROVIDER=gemini  # Use "claude" for production
AI_MODEL=gemini-1.5-flash

# Gemini (free during development)
GEMINI_API_KEY=<YOUR_GEMINI_API_KEY>
# Get from: https://aistudio.google.com/apikey

# Claude (production)
ANTHROPIC_API_KEY=sk-ant-...
# Get from: https://console.anthropic.com/account/keys

# Internal API
INTERNAL_API_SECRET=change-me-in-production

# CORS
CORS_ORIGINS=["http://localhost:3000"]
```

## Start Supabase Locally

Supabase provides a local PostgreSQL database with Auth, Storage, and Realtime:

```bash
cd packages/supabase
supabase start
```

This will:
- Start PostgreSQL 17 on port 54322
- Start Supabase API on port 54321
- Start Supabase Studio on port 54323
- Run all migrations automatically

**Output will show:**
```
Supabase local development server has started

API URL: http://localhost:54321
GraphQL URL: http://localhost:54321/graphql/v1
S3 URL: http://localhost:54321/storage/v1/s3
DB URL: postgresql://postgres:postgres@localhost:54322/postgres
Studio URL: http://localhost:54323
Inbucket URL: http://localhost:54324
JWT Secret: super-secret-jwt-token-with-at-least-32-characters-long
anon key: eyJhbGc...
service_role key: eyJhbGc...
```

Copy the `anon key` and `service_role key` into your `.env.local` and `.env` files.

To stop: `supabase stop`
To reset: `supabase db reset`

## Run the Applications

### Option 1: Docker Compose (All Services)

```bash
pnpm dev
```

This starts:
- Supabase (PostgreSQL, Auth, Storage)
- Next.js frontend on http://localhost:3000
- FastAPI backend on http://localhost:8000
- All connected and ready to use

### Option 2: Manual (Better for Development)

Terminal 1 — Supabase:
```bash
cd packages/supabase
supabase start
```

Terminal 2 — Next.js:
```bash
pnpm dev:web
```

Terminal 3 — FastAPI:
```bash
cd apps/api
source ../../.venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Then:
- Web app: http://localhost:3000
- API: http://localhost:8000
- API docs: http://localhost:8000/docs
- Supabase Studio: http://localhost:54323

## Run Tests

```bash
# All tests (web + API)
pnpm test

# Just web tests (Vitest)
pnpm test:web

# Just API tests (Pytest)
cd apps/api
source ../../.venv/bin/activate
pytest -v

# Single test file
pytest tests/routers/test_builds.py -v

# Run with coverage
pytest --cov=app tests/
```

## Common Issues

### Issue: "Connection refused" when calling the API

**Cause:** FastAPI server not running or wrong URL in `.env.local`

**Fix:**
```bash
# Terminal 1: Start Supabase
cd packages/supabase && supabase start

# Terminal 2: Start FastAPI
cd apps/api
source ../../.venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Check:** Can you access http://localhost:8000/health? Should return `{"status":"ok","version":"0.1.0"}`

### Issue: "Failed to get session" or auth errors in web app

**Cause:** Supabase URL or ANON_KEY incorrect, or Supabase not started

**Fix:**
```bash
cd packages/supabase && supabase status
```

Copy the printed keys into `apps/web/.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste from supabase status>
```

Then restart Next.js.

### Issue: "getUser() is throwing an error" in SSR

**Cause:** Using `getSession()` instead of `getUser()` in Server Components

**Fix:** In Next.js 14, always use:
```typescript
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(...)
const { data: { user } } = await supabase.auth.getUser()
```

Not `getSession()` which is for Client Components.

### Issue: Google OAuth login doesn't work locally

**Cause:** Redirect URIs not configured in config.toml or Google Console

**Fix:** Check [packages/supabase/config.toml](../../packages/supabase/config.toml) has:
```toml
[auth.external.google]
enabled = true
client_id = "env(GOOGLE_CLIENT_ID)"
secret = "env(GOOGLE_CLIENT_SECRET)"
```

And set the env vars:
```bash
export GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
export GOOGLE_CLIENT_SECRET=yyy
```

### Issue: Database migrations didn't run

**Cause:** Supabase not started or migrations disabled

**Fix:**
```bash
cd packages/supabase
supabase db reset  # Restart from scratch
```

This will:
1. Drop and recreate the database
2. Run all migrations in order
3. Run seed.sql for dev data

### Issue: AI API keys not working

**For Gemini:**
1. Go to https://aistudio.google.com/apikey
2. Create API key for "Wrench" project
3. Paste into `apps/api/.env`: `GEMINI_API_KEY=xxx`

**For Claude:**
1. Go to https://console.anthropic.com/account/keys
2. Create new API key
3. Paste into `apps/api/.env`: `ANTHROPIC_API_KEY=sk-ant-xxx`

Then restart FastAPI.

## Next Steps

- Read [Architecture Overview](../architecture/overview.md) to understand system design
- Check [Database Schema](../architecture/database-schema.md) for data models
- See [Decisions Log](../engineering/adr/) for technical choices
- Review the [Product Decisions](../product/decisions.md) for why Wrench works the way it does
