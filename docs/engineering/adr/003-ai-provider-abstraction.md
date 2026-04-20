# ADR 003: AI Provider Abstraction (Gemini Dev, Claude Prod)

**Date:** 2026-03-31  
**Status:** Accepted  
**Deciders:** Engineering team

## Context

Vision analysis and parts generation require calling large language models (LLMs). Two viable options:

1. **Claude Sonnet** — Best-in-class quality, $3–$15 per million tokens
2. **Gemini 1.5 Flash** — Good quality, free tier (1500 requests/day), limited to 2M tokens/min

During development, cost matters. During production, quality matters.

We need to make it trivial to swap between providers without code changes.

## Decision

We chose an **AI provider abstraction layer** that allows swapping between Claude (production) and Gemini (development) via a single environment variable:

```bash
# Development (free)
AI_PROVIDER=gemini
AI_MODEL=gemini-1.5-flash
GEMINI_API_KEY=...

# Production (quality)
AI_PROVIDER=claude
AI_MODEL=claude-3-5-sonnet
ANTHROPIC_API_KEY=...
```

Code calls a single interface:
```python
from app.services import ai_client
result = await ai_client.generate(prompt, image_base64=img, json_mode=True)
```

The function routes to either Claude or Gemini based on `settings.ai_provider`.

## Rationale

### 1. Zero Development Cost
Gemini Flash offers 1500 free requests/day. For a small team iterating, this is plenty.

Claude Sonnet costs $3 per 1M input tokens. A 1000-token vision request costs $0.003. 100 iterations/day = $0.30. Small, but it adds up.

Gemini during dev, Claude during prod = zero unnecessary spend.

### 2. Same Function Signature
Both Claude and Gemini accept:
- Text prompts
- Base64-encoded images (with MIME type)
- JSON output mode

By keeping the abstraction to this lowest common denominator, we can swap seamlessly:

```python
async def generate(
    prompt: str,
    image_base64: Optional[str] = None,
    image_mime_type: str = "image/jpeg",
    json_mode: bool = False,
) -> str:
    if provider == "gemini":
        return await _generate_gemini(...)
    elif provider == "claude":
        return await _generate_claude(...)
```

### 3. Production Reliability
Claude Sonnet is more reliable for:
- Complex reasoning tasks
- Structured JSON extraction (for parts lists)
- Edge cases and ambiguous inputs

Gemini Flash is fast but occasionally produces malformed JSON or misses nuance.

By using Claude in production, we ensure users get consistent, high-quality results.

### 4. Easy to Test
We can mock `ai_client.generate()` in tests:

```python
@patch('app.services.ai_client.generate')
async def test_vision_analysis(mock_generate):
    mock_generate.return_value = '{"parts": [...]}'
    # Test without calling real API
```

## Tradeoffs

### Downside 1: Lowest Common Denominator API
Claude supports more features:
- Tool use (function calling)
- Vision metadata (bounding boxes)
- Batch API for cost savings

Our abstraction doesn't expose these. If we need them, the abstraction breaks.

**Severity:** Low. We don't need these features currently. If we do in future, we can:
1. Add new methods (e.g., `generate_with_tools()`)
2. Check the provider and raise an error if unsupported
3. Or, break glass and call Claude directly for that feature

**Mitigation:** Document the limitation. Design features around what both providers can do.

### Downside 2: Quality Differences
Gemini Flash and Claude Sonnet produce different outputs:
- Different formatting
- Different reasoning depth
- Different edge case handling

Testing in dev with Gemini, running prod with Claude might surface issues in prod.

**Severity:** Medium. Mitigated by:
- Prompt engineering to reduce provider-specific behavior
- Integration tests that can run with either provider
- Manual QA before production deploys

**Mitigation:** 
```python
# Test both providers locally
AI_PROVIDER=gemini pytest tests/
AI_PROVIDER=claude pytest tests/

# Or add a fixture that runs tests twice
```

### Downside 3: More Complexity
Instead of "we use Claude," the codebase has branching logic for two providers. This is a small source of confusion.

**Severity:** Low. The branching is localized to `ai_client.py` and config.

## Alternatives Considered

### Only Claude (No Abstraction)
- **Pros:** Simpler, one provider
- **Cons:** Every development decision costs money; harder to iterate

### Only Gemini
- **Pros:** Free
- **Cons:** Quality concerns for production; may frustrate users

### Separate Backend Service (e.g., LLM API Gateway)
- **Pros:** Could route between multiple providers dynamically
- **Cons:** Over-engineered for current scale; adds infrastructure

## Related Decisions

- [ADR 001: FastAPI Over Node](./001-fastapi-over-node.md) — Python has first-class Claude and Gemini SDKs
- [ADR 002: Supabase](./002-supabase-for-auth-and-db.md) — Supabase doesn't lock us into a specific AI provider

## Implementation Notes

1. **Module:** `apps/api/app/services/ai_client.py`
2. **Config:** `apps/api/app/core/config.py` reads `AI_PROVIDER` and `AI_MODEL`
3. **Providers:** `_generate_gemini()` and `_generate_claude()` functions
4. **Error handling:** `AIClientError` with provider name for debugging
5. **Logging:** All calls logged with model and provider

See [Architecture Overview](../../architecture/overview.md#ai-provider-abstraction).

## Consequences

- ✅ Zero cost to iterate on AI features
- ✅ Production-grade quality when it matters
- ✅ Easy to test and mock
- ✅ Can swap providers with one env var change
- ⚠️ Cannot use provider-specific advanced features
- ⚠️ Dev/prod behavior might differ slightly
- 📌 Prompts must be generic enough for both providers

## Future Enhancements

1. **Provider comparison tests:**
   ```bash
   AI_PROVIDER=gemini pytest tests/
   AI_PROVIDER=claude pytest tests/
   # Compare outputs, flag significant diffs
   ```

2. **Metrics/cost tracking:**
   - Log tokens used by each provider
   - Alert if development cost spikes
   - Dashboard for usage analysis

3. **Fallback provider:**
   ```python
   try:
       result = await _generate_claude(...)
   except APIError:
       logger.warning("Claude failed, trying Gemini")
       result = await _generate_gemini(...)
   ```

4. **A/B testing:**
   - Route some users to Gemini, others to Claude
   - Compare quality metrics
   - Decide if Gemini is good enough for prod

## Decision Log

- **Approved** 2026-03-31 after cost analysis
- **Confirmed** during development that both SDKs work with same prompt format
- **Extended** to support `json_mode` for structured output
