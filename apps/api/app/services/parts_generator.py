import json
import logging
from typing import Any

from app.services.ai_client import AIClientError, generate

logger = logging.getLogger(__name__)

PARTS_GENERATION_PROMPT = """
You are an expert automotive parts advisor with deep knowledge
of car modifications, engine swaps, and aftermarket parts.

A user wants to modify their car. Generate a complete,
accurate parts list for their specific build.

Build details:
- Car: {car}
- Modification goal: {modification_goal}
- Use case: {use_case}
- Goals: {goals}
- Specific requirements: {specific_requirements}

Generate a comprehensive parts list. For each part:
- Be specific with part names (include brand if relevant)
- Assign ONLY these categories (lowercase): engine, drivetrain, electrical, cooling, safety, other
- Set status to one of: needed, ordered, sourced, installed
  (almost all parts should be "needed" initially)
- Include the goal this part belongs to
- Provide realistic price estimates in USD
- Flag safety-critical parts (anything that affects
  braking, steering, or structural integrity)
- Add helpful notes for installation complexity or
  common mistakes
- Include vendor suggestions where well known
  (e.g. K-Tuned for K-series mounts, Stance for coilovers)

Important rules:
- Only include parts actually needed for this specific build
- Do not include generic maintenance items unless
  directly required by the modification
- For engine swaps, include: engine, mounts, transmission,
  driveshaft, cooling, electrical/ECU components
- For suspension upgrades, use "other" category for
  suspension parts (coilovers/springs, alignment, brackets)
- If specific requirements are provided (brand, size, colour),
  use them exactly. For example, if the user said "19-inch
  bronze Work wheels", find Work wheel part numbers and specs,
  not generic alternatives.
- If a reference image is provided, use it to identify:
  * The exact style, colour and finish of the modification
  * Any brand markings or model numbers visible
  * The fitment and sizing if determinable from the image
  Use this visual information to find exact matching parts.
- Be realistic about prices — use current market rates
- Maximum 40 parts total, minimum 5
- Category must be one of: engine, drivetrain, electrical, cooling, safety, other

Respond with valid JSON only, no markdown:
{{
  "parts": [
    {{
      "name": "K24A2 engine",
      "description": "JDM K24A2 with under 80k miles",
      "category": "engine",
      "goal": "K24 engine swap",
      "status": "needed",
      "price_estimate": 1200.00,
      "vendor_name": "Japanese Engines Inc",
      "vendor_url": null,
      "is_safety_critical": false,
      "notes": "Verify compression before purchase"
    }}
  ],
  "summary": {{
    "estimated_total": 3100.00,
    "safety_critical_count": 3,
    "message": "Complete K24 swap list for a daily/track E30. Three safety-critical items flagged."
  }}
}}
"""


async def generate_parts_for_build(
    build: dict[str, Any],
    specific_requirements: str | None = None,
    image_base64: str | None = None,
) -> dict[str, Any]:
    """
    Takes a build dict and returns generated parts as a dict.
    If image_base64 is provided, Gemini will analyze it to improve part selection.
    Raises AIClientError if generation fails.
    """
    car = build.get("car") or build.get("donor_car") or "Unknown car"
    modification_goal = build.get("modification_goal") or ", ".join(build.get("goals", []))
    use_case = "daily driver"
    if modification_goal and "track" in modification_goal.lower():
        use_case = "daily driver and track use"
    goals = ", ".join(build.get("goals", [modification_goal]))
    specific_reqs = specific_requirements or "None specified — recommend best options"

    prompt = PARTS_GENERATION_PROMPT.format(
        car=car,
        modification_goal=modification_goal,
        use_case=use_case,
        goals=goals,
        specific_requirements=specific_reqs,
    )

    raw = await generate(prompt, image_base64=image_base64, json_mode=True)

    try:
        data = json.loads(raw)
        return data
    except json.JSONDecodeError as e:
        raise AIClientError(
            f"Parts generation returned invalid JSON: {e}",
            "parts_generator",
        )
