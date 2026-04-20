# Wrench

AI-powered car build research platform that helps automotive enthusiasts research, plan, and track custom car modifications. Wrench uses Claude/Gemini vision analysis and generative AI to suggest parts, manage budgets, and connect builders with experienced mechanics.

## User Personas

**Enthusiast Builder** — DIY car enthusiast planning a modification; needs curated parts lists, community validation, and sourcing help.

**Casual Researcher** — Car owner curious about "what would it take to do X"; values quick answers without commitment to a full project.

**Mechanic Network** — Experienced technicians offering expertise on builds they've seen; connects to projects to validate parts choices and offer labour.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14 (App Router) | React with file-based routing, built-in SSR |
| Styling | Tailwind CSS | Utility-first, zero-runtime CSS |
| Backend | FastAPI + Python 3.11+ | Native async, Pydantic validation, rich Python AI ecosystem |
| Database | Supabase (PostgreSQL 17) | RLS at the DB layer, vector embeddings (pgvector), local dev |
| Auth | Supabase Auth + OAuth | Google login, session management, user isolation |
| Storage | Supabase Storage | Image uploads with public bucket policies |
| AI Providers | Claude Sonnet (prod) / Gemini Flash (dev) | Cost trade-off: free Gemini in dev, production-grade Claude in prod |
| Package Manager | pnpm | Monorepo workspace support, faster installs |
| Infrastructure | Docker + Nginx | Local dev environment mirrors production |

## Monorepo Structure

```
wrench/
├── apps/
│   ├── web/            # Next.js 14 frontend
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   └── lib/
│   │   └── .env.example
│   └── api/            # FastAPI backend
│       ├── app/
│       │   ├── routers/       # builds, parts, advisor, vision
│       │   ├── services/      # AI integration, vision analysis
│       │   ├── schemas/       # Pydantic models
│       │   ├── core/          # config, dependencies, auth
│       │   └── main.py
│       ├── tests/
│       ├── pyproject.toml
│       └── .env.example
├── packages/
│   ├── supabase/        # Migrations, local dev config
│   │   ├── migrations/  # Schema + RLS policies
│   │   ├── config.toml  # Supabase CLI configuration
│   │   └── seed.sql     # Dev data seed
│   └── shared/          # Shared TypeScript types
├── infra/
│   └── docker/          # Production Docker + Nginx
└── docs/                # Project documentation
```

## Quick Start

See [docs/engineering/setup.md](docs/engineering/setup.md) for detailed setup instructions including prerequisites, environment variables, and troubleshooting.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
pnpm dev
```

## Documentation

- **[Engineering Setup](docs/engineering/setup.md)** — Prerequisites, installation, environment variables
- **[Architecture Overview](docs/architecture/overview.md)** — System diagram, auth flow, AI abstraction
- **[Database Schema](docs/architecture/database-schema.md)** — Tables, relationships, RLS policies
- **[Architecture Decision Records](docs/engineering/adr/)** — Why we chose FastAPI, Supabase, and AI provider abstraction
- **[Product Decisions](docs/product/decisions.md)** — Conversation-first UX, goals, budget, mechanic connection
- **[User Journeys](docs/product/user-journeys/)** — Step-by-step flows for each persona

## Apps

| App | URL | Stack |
|-----|-----|-------|
| Web | http://localhost:3000 | Next.js 14, Tailwind, Supabase |
| API | http://localhost:8000 | FastAPI, Python 3.11, Anthropic/Gemini |
| API Docs | http://localhost:8000/docs | Swagger (dev only) |

## Running Locally

### FastAPI Backend

```bash
cd apps/api
source ../../.venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Next.js Frontend

```bash
pnpm dev:web
```

### All Services (Docker)

```bash
pnpm dev
```

## Testing

```bash
pnpm test                          # Both web (Vitest) and API (Pytest)
pnpm test:web                      # Just Next.js tests
pnpm test:api                      # Just FastAPI tests
pytest tests/routers/test_builds.py -v  # Single API test file
```

## All Commands

```bash
pnpm dev          # Start all services via Docker
pnpm dev:web      # Start only Next.js
pnpm dev:api      # Start only FastAPI
pnpm lint         # Lint all apps
pnpm typecheck    # TypeScript check
pnpm test         # Run all tests
pnpm db:migrate   # Run DB migrations
pnpm db:seed      # Seed dev data
pnpm db:types     # Regenerate TS types from schema
```
