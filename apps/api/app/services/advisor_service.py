import anthropic
from app.core.config import settings


def build_system_prompt(build_context: dict) -> str:
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


async def stream_advisor_response(messages: list[dict], build_context: dict):
    """
    Yields SSE-formatted chunks for streaming to the client.
    """
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    with client.messages.stream(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=build_system_prompt(build_context),
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            yield f"data: {text}\n\n"

    yield "data: [DONE]\n\n"
