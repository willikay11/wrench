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

## Commands

```bash
pnpm dev          # Start all services via Docker
pnpm lint         # Lint all apps
pnpm typecheck    # TypeScript check all apps
pnpm test         # Run all tests
pnpm db:migrate   # Run DB migrations
pnpm db:seed      # Seed dev data
pnpm db:types     # Regenerate TypeScript types from DB schema
```
