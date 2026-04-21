import base64
import json
import logging
import re
from typing import Any, cast

from app.core.config import settings
from app.services.ai_client import generate

logger = logging.getLogger(__name__)

# Parts categories allowed by the DB check constraint
VALID_CATEGORIES = ("engine", "drivetrain", "electrical", "cooling", "safety", "other")


def _extract_json(text: str) -> str:
    """Strip markdown code fences from JSON responses."""
    # Remove markdown code fence wrappers: ```json ... ``` or ``` ... ```
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    return text.strip()


def _build_parts_prompt(
    goals: list[str],
    modification_goal: str | None,
    car_context: str = "",
) -> str:
    goals_text = "\n".join(f"- {g}" for g in goals) if goals else "- (no specific goals provided)"
    goal_context = f"\nOverall modification intent: {modification_goal}" if modification_goal else ""
    return f"""You are an expert automotive build consultant generating a parts list.

{car_context}{goal_context}

User's build goals:
{goals_text}

For each goal, generate a realistic, detailed parts list. Each part must include:
- "name": short part name (e.g. "K24A2 Longblock")
- "description": 1-2 sentence explanation of what it is and why it's needed
- "category": one of exactly: engine, drivetrain, electrical, cooling, safety, other
- "goal": the goal this part belongs to (copy exactly from the list above)
- "price_estimate": realistic USD price as a number (null if genuinely unknown)
- "is_safety_critical": true only if failure would endanger the driver
- "notes": sourcing tips, compatibility notes, or install tips (null if none)

Include 4-8 parts per goal. Cover the key items needed — don't pad with obvious consumables (oil, bolts).
For safety-critical parts (brakes, harnesses, cages) always set is_safety_critical=true.

Return a JSON array. No markdown, no explanation — only the JSON array."""


async def analyse_car_image(
    image_bytes: bytes,
    mime_type: str = "image/jpeg",
    goals: list[str] | None = None,
    modification_goal: str | None = None,
) -> dict[str, Any]:
    """
    Send a car image to configured vision provider.

    Returns a dict with:
      - make, model, year_range, visible_mods, engine_hints, confidence
      - suggested_parts: list of part dicts ready to insert into the parts table
    """
    effective_goals: list[str] = goals or []
    image_base64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    car_id_prompt = """Analyse this car image and return a JSON object with exactly these fields:
{
  "make": string,
  "model": string,
  "year_range": string,
  "visible_mods": string[],
  "engine_hints": string[],
  "confidence": { "make": float, "model": float, "year": float }
}
Return only valid JSON, no markdown."""

    # ── Step 1: Identify the car ──────────────────────────────────────────────
    id_text = await generate(car_id_prompt, image_base64=image_base64, image_mime_type=mime_type, json_mode=True)

    vision_data: dict[str, Any] = {}
    try:
        clean_text = _extract_json(id_text)
        vision_data = cast(dict[str, Any], json.loads(clean_text))
    except json.JSONDecodeError:
        logger.warning("Vision car-ID response was not valid JSON: %s", id_text[:200])

    # ── Step 2: Generate parts using car context + goals ─────────────────────
    car_label = f"{vision_data.get('make', '')} {vision_data.get('model', '')} {vision_data.get('year_range', '')}".strip()
    car_context = f"Vehicle identified: {car_label}\n" if car_label else ""

    suggested_parts: list[dict[str, Any]] = []
    if effective_goals:
        parts_prompt = _build_parts_prompt(effective_goals, modification_goal, car_context)
        parts_text = await generate(parts_prompt, image_base64=image_base64, image_mime_type=mime_type, json_mode=True)

        try:
            clean_text = _extract_json(parts_text)
            raw = json.loads(clean_text)
            if isinstance(raw, list):
                suggested_parts = _sanitise_parts(raw)
        except json.JSONDecodeError:
            logger.warning("Vision parts response was not valid JSON: %s", parts_text[:200])

    vision_data["suggested_parts"] = suggested_parts
    return vision_data


async def generate_parts_for_build(
    car: str | None,
    modification_goal: str | None,
    goals: list[str],
) -> list[dict[str, Any]]:
    """
    Text-only part generation — no image required.
    Used when the user triggers "Generate parts list" from the workspace.
    Returns a list of part dicts ready to insert into the parts table.
    """
    if not goals:
        return []

    car_context = f"Vehicle: {car}\n" if car else ""
    prompt = _build_parts_prompt(goals, modification_goal, car_context)
    text = await generate(prompt, json_mode=True)

    try:
        clean_text = _extract_json(text)
        raw = json.loads(clean_text)
        if isinstance(raw, list):
            return _sanitise_parts(raw)
    except json.JSONDecodeError:
        logger.warning("Text parts response was not valid JSON: %s", text[:200])

    return []


def _sanitise_parts(raw: list[Any]) -> list[dict[str, Any]]:
    """Validate and normalise raw part dicts from the AI response."""
    parts: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if not name or not isinstance(name, str):
            continue

        category = item.get("category", "other")
        if category not in VALID_CATEGORIES:
            category = "other"

        price = item.get("price_estimate")
        try:
            price = float(price) if price is not None else None
        except (TypeError, ValueError):
            price = None

        parts.append({
            "name": str(name).strip(),
            "description": str(item["description"]).strip() if item.get("description") else None,
            "category": category,
            "goal": str(item["goal"]).strip() if item.get("goal") else None,
            "price_estimate": price,
            "is_safety_critical": bool(item.get("is_safety_critical", False)),
            "notes": str(item["notes"]).strip() if item.get("notes") else None,
            "status": "needed",
        })

    return parts
