# ADR 001: FastAPI Over Node.js for Backend

**Date:** 2026-03-31  
**Status:** Accepted  
**Deciders:** Engineering team

## Context

Wrench needed a backend API to handle:
- AI service integration (Claude/Gemini API calls)
- Image processing and vision analysis
- User authentication and authorization
- Database operations with Row Level Security
- Background job processing (vision analysis)

Two main candidates emerged:
1. **Node.js** (Express/Hono) — Familiar to the frontend team, JavaScript/TypeScript everywhere
2. **Python FastAPI** — Native async, rich AI ecosystem, strong typing with Pydantic

## Decision

We chose **FastAPI with Python 3.11+** as the backend runtime.

## Rationale

### 1. Native Async/Await
FastAPI has async built into the framework. Vision analysis (waiting on Claude/Gemini) doesn't block other requests:

```python
# This scales well under load
async def vision_analyse_and_populate(...):
    vision_result = await analyse_car_image(...)
    # Process while other requests continue
```

Node.js async is excellent too, but it's opt-in on a per-function basis. FastAPI encourages async-first thinking.

### 2. AI/ML Ecosystem
Python is the lingua franca for AI:
- `anthropic` and `google.generativeai` are first-class libraries with best docs
- If we add embeddings, vector databases, or fine-tuning, Python has better tooling
- NumPy, pandas, scikit-learn all work here if needed for future features

Node.js requires wrappers and workarounds for AI tooling.

### 3. Data Validation (Pydantic v2)
Pydantic provides runtime schema validation and automatic API documentation:

```python
class BuildCreate(BaseModel):
    title: str
    car: str
    goals: list[str]

# Automatic validation + swagger /docs endpoint
# Type hints act as documentation
```

Express/Hono need manual validation or additional libraries. FastAPI generates OpenAPI (Swagger) for free.

### 4. Backend Isolation from Frontend
By using a different language, we force better API contracts:
- No shared TypeScript interfaces (reduces "just import it" temptation)
- Clear client-server boundary
- Easier to evolve backend independently

If both were Node, there'd be pressure to share code (utils, helpers, schemas), leading to tight coupling.

## Tradeoffs

### Downside 1: Two Languages in Monorepo
- Developers need Python 3.11+ installed
- CI/CD must test both Node and Python
- Documentation needs to cover both setups

**Mitigation:** Docker handles this in production. Development setup guide provides clear Python version requirements.

### Downside 2: Smaller Team Expertise
- Frontend team is very familiar with TypeScript
- Python knowledge is lower across the team
- Hiring for Python backend harder than Node in some markets

**Mitigation:** FastAPI is low-ceremony and well-documented. The codebase is small (few endpoints). Framework choice should not be a blocker for engineers comfortable with any web framework.

### Downside 3: Deployment Complexity
- Need a Python runtime (Render, Railway, etc.)
- Can't deploy to Vercel Edge Functions
- More infrastructure moving pieces

**Mitigation:** Vercel + Render split is the production design anyway. Next.js frontend on Vercel (serverless), FastAPI on Render (containerized Python). This is a standard architecture and well-supported.

## Alternatives Considered

### Node.js / Express
- **Pros:** Team familiarity, single language
- **Cons:** Weaker AI ecosystem, less natural async patterns, requires more validation plumbing

### Django + Django REST Framework
- **Pros:** More batteries included, larger ecosystem
- **Cons:** Heavier framework, slower to start, overkill for this API size

### Hono (Edge Runtime)
- **Pros:** Tiny, fast
- **Cons:** Still JavaScript, no help with AI/validation trade-offs

## Related Decisions

- [ADR 002: Supabase for Auth and DB](./002-supabase-for-auth-and-db.md) — Supabase is Python-friendly
- [ADR 003: AI Provider Abstraction](./003-ai-provider-abstraction.md) — Python SDKs are first-class

## Implementation Notes

1. **Framework:** FastAPI 0.111+
2. **Runtime:** Python 3.11 (as per `pyproject.toml`)
3. **Async:** All I/O is async (database, API calls)
4. **Validation:** Pydantic v2 models for all endpoints
5. **Testing:** pytest + pytest-asyncio for async tests
6. **Local dev:** `uvicorn` reload mode

See [Setup Guide](../setup.md#running-the-fastapi-app) for development commands.

## Consequences

- ✅ Faster iteration on AI features
- ✅ Type-safe APIs with automatic docs
- ✅ Natural async/background job handling
- ⚠️ Python environment setup required
- ⚠️ Two languages to maintain and test
- 📌 Commits developers to Render/Railway for production (not Vercel Edge)
