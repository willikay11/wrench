# Architecture Overview

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER (User)                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
    ┌───────────▼────────────┐    ┌──▼──────────────────┐
    │   Next.js 14 (Web)     │    │  Supabase Storage   │
    │  - Auth redirect       │    │  (build images)     │
    │  - Session management  │    │  Public bucket      │
    │  - UI components       │    └─────────────────────┘
    └───────────┬────────────┘
                │
    ┌───────────▼────────────────────────────────────────┐
    │          FastAPI Backend (Port 8000)               │
    │  ┌──────────────────────────────────────────────┐  │
    │  │  Routers:                                    │  │
    │  │  - /v1/builds       (CRUD operations)        │  │
    │  │  - /v1/parts        (Parts management)       │  │
    │  │  - /v1/advisor      (Conversation history)   │  │
    │  │  - /v1/vision       (Image analysis)         │  │
    │  ├──────────────────────────────────────────────┤  │
    │  │  Services:                                   │  │
    │  │  - ai_client.py     (Claude or Gemini)       │  │
    │  │  - vision_service   (Image → parts list)     │  │
    │  ├──────────────────────────────────────────────┤  │
    │  │  Dependencies:                               │  │
    │  │  - Auth: Supabase JWT validation             │  │
    │  │  - DB:  Supabase client with user's token   │  │
    │  └──────────────────────────────────────────────┘  │
    └───────────┬────────────┬─────────────┬────────────┘
                │            │             │
      ┌─────────▼──────┐ ┌──▼────────┐ ┌─▼──────────┐
      │ Supabase       │ │  Claude   │ │  Gemini    │
      │ (PostgreSQL    │ │  Sonnet   │ │  Flash     │
      │  + Auth +      │ │  (Prod)   │ │  (Dev)     │
      │  Storage)      │ │           │ │            │
      └────────────────┘ └───────────┘ └────────────┘
```

## Authentication Flow

### 1. User Sign-In (Browser → Supabase)

```
Browser                    Supabase Auth
  │                            │
  ├─ Sign in with Google ─────>│
  │                            │
  │<─── JWT + Refresh token ───│
  │     (stored in cookies)    │
  │                            │
```

**Key files:**
- `apps/web/src/app/auth/` — Sign-in, callback, logout pages
- `apps/web/src/middleware.ts` — Validates JWT on every request
- `apps/web/src/lib/supabase.ts` — Configures Supabase client for SSR

### 2. API Request (Browser → FastAPI)

```
Browser                    FastAPI              Supabase
  │                          │                     │
  ├─ POST /v1/builds/        │                     │
  │  auth: JWT token ────────>                     │
  │                          │                     │
  │                ┌─ Validate JWT ──────────────>│
  │                          │                     │
  │                          │<─ User ID from JWT ─│
  │                          │                     │
  │                ├─ create row in builds ──────>│
  │                │         │                     │
  │                │         │<─ new build ────────│
  │                │                               │
  │<─ 201 + build ─┤
  │
```

**Key files:**
- `apps/api/app/core/dependencies.py:get_current_user()` — Extracts and validates JWT
- `apps/api/app/core/supabase.py:get_supabase()` — Creates client with user's access token
- `apps/api/app/routers/builds.py` — All build endpoints with RLS enforcement

**Security principle:** RLS is enforced both at FastAPI (client filtered) and Postgres (row-level) for defense in depth.

## AI Provider Abstraction

The system supports both Claude Sonnet (production) and Gemini Flash (development) through a single interface:

### Configuration

```python
# apps/api/.env
AI_PROVIDER=gemini        # or "claude"
AI_MODEL=gemini-1.5-flash # or "claude-3-5-sonnet"
GEMINI_API_KEY=xxx
ANTHROPIC_API_KEY=sk-ant-xxx
```

### API

```python
# apps/api/app/services/ai_client.py
from app.services import ai_client

result = await ai_client.generate(
    prompt="Suggest parts for...",
    image_base64=base64_image,  # optional
    json_mode=True              # for structured output
)
```

This function:
1. Checks `settings.ai_provider` 
2. Routes to `_generate_gemini()` or `_generate_claude()`
3. Returns the same format from both

### Why This Pattern?

| Provider | Dev Cost | Quality | Latency |
|----------|----------|---------|---------|
| Gemini Flash | Free (up to 1500 requests/day) | Good for UI | Fast |
| Claude Sonnet | $3–$15 per M tokens | Best-in-class | Slightly slower |

During development, we use Gemini (free) to iterate without burning through budgets. For production reliability and quality, Claude handles user requests.

**To switch:** Change `AI_PROVIDER=claude` and restart the FastAPI server.

## Data Flow: Build Creation with Vision Analysis

```
1. User uploads car image
   POST /v1/builds/{build_id}/image

2. FastAPI stores image in Supabase Storage
   ├─ /build-images/{user_id}/{build_id}.jpg
   └─ Updates build.image_url with public URL

3. Vision analysis runs in background
   ├─ Calls Claude/Gemini with image + build context
   ├─ Extracts: [parts array] from response
   ├─ Stores: vision_data JSON on the build
   └─ Inserts: parts table rows with suggested parts

4. Frontend polls build endpoint
   GET /v1/builds/{build_id}
   
   Returns full parts list once vision task completes
```

**Key files:**
- `apps/api/app/routers/builds.py:upload_build_image()` — Image storage
- `apps/api/app/routers/builds.py:_vision_analyse_and_populate()` — Background task
- `apps/api/app/services/vision_service.py` — Vision API calls + parsing

## Database Architecture

All tables have Row Level Security (RLS) enabled:

```
Public schema
├── users            ← auth.users via FK
├── builds           ← owned by users, RLS: can only see own + public
│   ├── parts        ← can only see if you own the build
│   ├── conversations (1-to-1)
│   │   └── messages
│   └── vision_data  (stored as JSONB)
├── part_listings    ← inherit part access via RLS
└── storage.objects  (build-images bucket)
    ├── Policies: public read, auth upload/update/delete own
```

See [Database Schema](./database-schema.md) for complete table documentation.

## Key Design Decisions

| Decision | Benefit | Trade-off |
|----------|---------|-----------|
| **FastAPI backend** | Native async, Pydantic validation | Two languages in monorepo |
| **Supabase for everything** | One vendor, RLS at DB level, pgvector for embeddings | Vendor lock-in on auth/storage |
| **AI provider abstraction** | Swap Gemini ↔ Claude via env var | Lowest common denominator API |
| **Session in HTTP cookies** | Secure, httpOnly, handled by Supabase | SSR-only (no direct Supabase client in browser) |
| **Background vision analysis** | Non-blocking image uploads | Eventual consistency (parts appear after processing) |

See [Architecture Decision Records](./adr/) for deeper context on each choice.

## Deployment Architecture (Production)

```
┌──────────────────────────────┐
│  Vercel (Next.js)            │
│  - Auto-deploys on push      │
│  - Serverless functions      │
│  - Edge middleware           │
└───────────┬──────────────────┘
            │
┌───────────▼──────────────────┐
│  Render (FastAPI)            │
│  - Python 3.11 runtime       │
│  - Auto-restarts on push     │
│  - Connected to Supabase     │
└───────────┬──────────────────┘
            │
┌───────────▼──────────────────┐
│  Supabase Cloud              │
│  - PostgreSQL managed        │
│  - Auth, Storage, Realtime   │
│  - pgvector for embeddings   │
└──────────────────────────────┘
```

In production:
- Next.js runs on Vercel (free tier available)
- FastAPI runs on Render or Railway
- Supabase Cloud handles database (free tier with limits)
- All connected via public internet + JWT auth

## File Structure

```
apps/api/app/
├── main.py                    # FastAPI app + middleware
├── routers/                   # Endpoint definitions
│   ├── builds.py              # CRUD, image upload, vision
│   ├── parts.py               # Part management
│   ├── advisor.py             # Conversation endpoints
│   └── vision.py              # Vision analysis endpoints
├── services/                  # Business logic
│   ├── ai_client.py           # Claude/Gemini abstraction
│   ├── vision_service.py      # Image analysis
│   └── parts_service.py       # Parts generation
├── schemas/                   # Pydantic models (input/output)
│   ├── builds.py
│   ├── parts.py
│   └── advisor.py
└── core/                      # Infrastructure
    ├── config.py              # Environment + settings
    ├── dependencies.py        # Dependency injection
    └── supabase.py            # Supabase client setup
```

## TODO: Parts Generation Service

Currently, parts generation is a placeholder. The flow should be:

1. **User provides context:** car, goals, budget
2. **Claude analyzes** via few-shot prompt: "For a 2018 Civic hatchback with goals [tuning, reliability], suggest parts"
3. **Response parsed** into Part objects with: name, category, estimated price, vendor URLs
4. **Parts inserted** into the database with goal + source metadata
5. **Frontend groups** parts by goal with color-coded visual indicators

This service doesn't exist yet but the database schema and API endpoints support it.
