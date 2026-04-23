import asyncio
import json
import logging
from typing import Any

from app.services.ai_client import AIClientError, generate
from app.services.image_fetcher import fetch_product_image

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
- Vision analysis: {vision_analysis}

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
- Include multiple vendor options (2-3 per part when possible)
  with specific pricing and shipping information

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
- vendors: array of 1-3 vendor options per part.
  For each vendor provide:
    vendor_name: the store or seller name
    vendor_url: specific product URL if known,
                otherwise vendor homepage
    price: price in USD
    ships_from: country or city
    estimated_days_min: minimum shipping days
    estimated_days_max: maximum shipping days
    shipping_cost: estimated shipping in USD,
                   0 if free
    is_primary: true for the recommended vendor only

  Always try to provide at least 2 vendor options.
  For JDM parts: include a Japanese source and
    a US-based importer
  For suspension/brakes: include the brand direct
    site and at least one marketplace (eBay/Amazon)
  Mark the best value option as is_primary: true
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
      "is_safety_critical": false,
      "notes": "Verify compression before purchase",
      "vendors": [
        {{
          "vendor_name": "Japanese Engines Inc",
          "vendor_url": "https://japaneseenginesinc.com",
          "price": 1200.00,
          "currency": "USD",
          "ships_from": "Japan",
          "estimated_days_min": 14,
          "estimated_days_max": 21,
          "shipping_cost": 180.00,
          "is_primary": true
        }},
        {{
          "vendor_name": "eBay",
          "vendor_url": "https://ebay.com/sch/k24a2+engine",
          "price": 1350.00,
          "currency": "USD",
          "ships_from": "United States",
          "estimated_days_min": 7,
          "estimated_days_max": 10,
          "shipping_cost": 0.00,
          "is_primary": false
        }}
      ]
    }}
  ],
  "summary": {{
    "estimated_total": 3100.00,
    "safety_critical_count": 3,
    "message": "Complete K24 swap list for a daily/track E30. Three safety-critical items flagged."
  }}
}}
"""


async def enrich_parts_with_images(
    parts: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """
    Fetches product images for all parts concurrently.
    If vendors array exists, fetches image from primary vendor.
    Never raises — image fetch is best-effort.
    """
    async def fetch_one(part: dict[str, Any]) -> dict[str, Any]:
        # Get URL from vendors array (primary vendor) or fallback to vendor_url
        vendors = part.get("vendors", [])
        primary_vendor = next(
            (v for v in vendors if v.get("is_primary")),
            vendors[0] if vendors else None
        )
        url = primary_vendor.get("vendor_url") if primary_vendor else part.get("vendor_url")

        if url:
            part["image_url"] = await fetch_product_image(url)
        else:
            part["image_url"] = None
        return part

    return await asyncio.gather(
        *[fetch_one(p) for p in parts]
    )


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

    # Extract vision analysis from build
    vision_data = build.get("vision_data")
    if vision_data and isinstance(vision_data, dict):
        vision_analysis = (
            f"Image type: {vision_data.get('image_type')}\n"
            f"Summary: {vision_data.get('summary')}\n"
            f"Extracted notes: {vision_data.get('extracted', {}).get('notes', 'None')}\n"
            f"Specifications: {vision_data.get('extracted', {}).get('specifications', 'None')}\n"
            f"Mods detected: {', '.join(vision_data.get('extracted', {}).get('mods_detected', []))}"
        )
    else:
        vision_analysis = "No image provided"

    prompt = PARTS_GENERATION_PROMPT.format(
        car=car,
        modification_goal=modification_goal,
        use_case=use_case,
        goals=goals,
        specific_requirements=specific_reqs,
        vision_analysis=vision_analysis,
    )

    raw = await generate(prompt, image_base64=image_base64, json_mode=True)

    try:
        data = json.loads(raw)
        parts = data.get("parts", [])

        # Enrich with images concurrently
        parts = await enrich_parts_with_images(parts)

        # Extract price_estimate and vendor_url from primary vendor
        for part in parts:
            vendors = part.get("vendors", [])
            primary = next(
                (v for v in vendors if v.get("is_primary")),
                vendors[0] if vendors else None
            )
            if primary:
                part["price_estimate"] = primary.get("price")
                part["vendor_url"] = primary.get("vendor_url")
                part["vendor_name"] = primary.get("vendor_name")

        data["parts"] = parts
        return data
    except json.JSONDecodeError as e:
        raise AIClientError(
            f"Parts generation returned invalid JSON: {e}",
            "parts_generator",
        )
