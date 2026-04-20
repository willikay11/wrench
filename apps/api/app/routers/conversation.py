import json
import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.schemas.conversation import ConversationMessage, ConversationRequest, ConversationResponse
from app.services import ai_client

router = APIRouter()
logger = logging.getLogger(__name__)

ADVISOR_SYSTEM_PROMPT = """
You are the Wrench advisor — an expert in car modifications,
engine swaps, suspension upgrades, and sourcing parts.

Your job is to understand what a user wants to do with their
car and gather exactly three pieces of information before
generating a parts list:
1. What car they have (make, model, year if possible)
2. What they want to do (the modification goal)
3. How they use the car (daily driver, track, or both)

Rules:
- Extract information from what the user says before asking
  for it. If they mention their car in their first message,
  do not ask for it again.
- Ask only ONE question at a time. Never ask two questions
  in the same message.
- Maximum 3 questions total across the entire conversation.
  Once you have car + goal + use case, confirm and stop.
- Keep replies short — 2-3 sentences maximum.
- Sound like a knowledgeable friend, not a form.
- When you have all three pieces of information, respond
  with a confirmation message in this exact format:
  "Got it: [car] · [goal] · [use case]. Ready to generate
   your parts list?"
  Use state="confirming" at this point (do NOT use "ready" yet).
- If the user has no car yet, suggest 2-3 platforms that
  suit their goal before asking which they prefer.
  Do not ask about budget.

State values:
- "gathering": Still collecting car, goal, or use_case information
- "confirming": You have all three pieces and showed confirmation message
- "ready": NEVER use this — the frontend will create the build after the user sees the confirmation

Always respond in this exact JSON structure, nothing else:
{
  "reply": "your message to the user",
  "state": "gathering or confirming",
  "extracted": {
    "car": null or string,
    "goal": null or string,
    "use_case": null or string
  }
}

Respond with valid JSON only. No markdown fences.
"""


@router.post("/message", response_model=ConversationResponse)
async def send_message(payload: ConversationRequest) -> dict:
    """
    Process a conversation message and return AI advisor response.

    Builds message history with system prompt, generates a JSON response
    from the AI, and parses it into a ConversationResponse.
    """
    session_id = payload.session_id or str(uuid4())

    # Build messages list for the AI
    messages = [{"role": "user", "content": ADVISOR_SYSTEM_PROMPT}]

    # Add conversation history
    for msg in payload.history:
        messages.append({"role": msg.role, "content": msg.content})

    # Add current message
    messages.append({"role": "user", "content": payload.message})

    # Build the full prompt
    prompt = "\n".join([msg["content"] for msg in messages])

    try:
        # Call AI with JSON mode
        response_text = await ai_client.generate(prompt, json_mode=True)

        # Parse JSON response
        try:
            parsed = json.loads(response_text)
            return {
                "reply": parsed.get("reply", ""),
                "state": parsed.get("state", "gathering"),
                "extracted": parsed.get("extracted", {}),
                "session_id": session_id,
            }
        except json.JSONDecodeError:
            logger.warning("AI response was not valid JSON: %s", response_text)
            # Safe fallback
            return {
                "reply": "I didn't catch that — could you tell me more about your car and what you want to do?",
                "state": "gathering",
                "extracted": {},
                "session_id": session_id,
            }

    except Exception as exc:
        logger.exception("Conversation endpoint error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Conversation failed",
        ) from exc
