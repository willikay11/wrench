# Wrench

AI-powered car build research platform.

## Structure

```
wrench/
├── apps/
│   ├── web/          # Next.js 14 frontend (App Router)
│   └── api/          # FastAPI backend (AI services)
├── packages/
│   ├── db/           # Migrations, seeds, DB scripts
│   └── shared/       # Shared TypeScript types
├── infra/
│   └── docker/       # Production Docker + Nginx config
└── docker-compose.yml  # Local dev orchestration
```

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env files
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env

# 3. Start all services
docker compose up

# 4. Run DB migrations
pnpm db:migrate
```

## Apps

| App | URL | Stack |
|-----|-----|-------|
| Web | http://localhost:3000 | Next.js 14, Tailwind, Supabase |
| API | http://localhost:8000 | FastAPI, Python 3.11, Anthropic |
| API Docs | http://localhost:8000/docs | Swagger (dev only) |

## Running the FastAPI app (`apps/api`)

```bash
# from the repo root
cd apps/api

# activate the project virtual environment
source ../../.venv/bin/activate

# run the API in development
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

If the virtual environment has not been set up yet:

```bash
# from the repo root
python3 -m venv .venv
source .venv/bin/activate
pip install -e ./apps/api
pip install pytest pytest-asyncio httpx
```

## Testing

```bash
# Web app tests (Vitest)
pnpm test

# API tests (Pytest)
cd apps/api
source ../../.venv/bin/activate
pytest -v

# Run a single API test file
pytest tests/routers/test_builds.py -v
```

> `pnpm test` now runs both the web test suite (`apps/web`, via Vitest) and the FastAPI test suite (`apps/api`, via Pytest in the project `.venv`).

## Commands

```bash
pnpm dev          # Start all services via Docker
pnpm dev:web      # Start only the Next.js web app
pnpm dev:api      # Start only the FastAPI app with uvicorn
pnpm lint         # Lint all apps
pnpm typecheck    # TypeScript check all apps
pnpm test         # Run both web (Vitest) and API (Pytest) tests
pnpm db:migrate   # Run DB migrations
pnpm db:seed      # Seed dev data
pnpm db:types     # Regenerate TypeScript types from DB schema
```
