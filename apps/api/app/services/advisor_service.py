from collections.abc import AsyncIterator
from typing import Any

from app.services.ai_client import generate


def build_system_prompt(build_context: dict[str, Any]) -> str:
    return f"""You are Wrench Advisor — an expert automotive build consultant.

Current build context:
- Vehicle: {build_context.get('donor_car', 'Unknown')}
- Engine swap: {build_context.get('engine_swap', 'Unknown')}
- Goals: {', '.join(build_context.get('goals', []))}
- Region: {build_context.get('region', 'Unknown')}
- Parts sourced: {build_context.get('parts_sourced', 0)} of {build_context.get('parts_total', 0)}

Your responsibilities:
- Flag compatibility issues, hidden costs, and safety-critical gaps
- Reference real vendors (K-Tuned, Hasport, RockAuto, eBay Motors)
- Be direct and technical — the user is a capable engineer
- Keep responses concise and scannable
- Prefix safety-critical warnings with [SAFETY]"""


async def stream_advisor_response(
    messages: list[dict[str, Any]],
    build_context: dict[str, Any],
) -> AsyncIterator[str]:
    """
    Yields SSE-formatted chunks to the client using configured AI provider.
    """
    # Build conversation context from messages
    system_prompt = build_system_prompt(build_context)
    latest_user_message = None
    for msg in reversed(messages):
        if msg.get("role") == "user":
            latest_user_message = msg.get("content", "")
            break

    if not latest_user_message:
        yield "data: [DONE]\n\n"
        return

    # Prepend system context to the prompt
    prompt = f"{system_prompt}\n\n{latest_user_message}"
    response = await generate(prompt)

    # Stream response line-by-line for SSE compatibility
    for line in response.split("\n"):
        if line.strip():
            yield f"data: {line}\n\n"

    yield "data: [DONE]\n\n"
