import base64
import json
import logging
from typing import Any

from app.core.config import settings
from app.services.ai_client import generate

logger = logging.getLogger(__name__)

VISION_PROMPT = """You must respond with JSON only. No markdown. Start with {{.

User goal: {modification_goal}
Car: {car}

Look at this image and identify what it shows.

Respond with exactly this JSON structure:
{{
  "image_type": "car" or "rims" or "engine_bay" or "suspension" or "part" or "inspiration" or "unknown",
  "summary": "10 words max describing what you see",
  "extracted": {{
    "make": null or car make string,
    "model": null or car model string,
    "year": null or year string,
    "confidence": null or number 0-100,
    "part_name": null or part name if visible,
    "specifications": null or object with key-value specs,
    "mods_detected": [] or list of visible mods,
    "notes": null or one sentence observation
  }}
}}"""


async def _try_vision_analysis(
    image_base64: str,
    modification_goal: str,
    car: str,
    image_mime_type: str,
    force_provider: str | None = None,
) -> dict[str, Any]:
    """Helper to try vision analysis with a specific provider."""
    try:
        prompt = VISION_PROMPT.format(
            modification_goal=modification_goal or "general build",
            car=car or "unknown car",
        )

        raw = await generate(
            prompt,
            image_base64=image_base64,
            image_mime_type=image_mime_type,
            json_mode=True,
            force_provider=force_provider,
        )

        if not raw or not raw.strip():
            raise ValueError("Empty response")

        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            cleaned = "\n".join(lines).strip()

        json_start = cleaned.find("{")
        json_end = cleaned.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            cleaned = cleaned[json_start:json_end]

        if not cleaned or cleaned == "{}":
            raise ValueError("Could not extract JSON")

        data = json.loads(cleaned)

        if not data.get("image_type"):
            data["image_type"] = "unknown"
        if not data.get("summary"):
            data["summary"] = "Image analysed"
        if "extracted" not in data:
            data["extracted"] = {}

        extracted = data["extracted"]
        defaults = {
            "make": None,
            "model": None,
            "year": None,
            "confidence": None,
            "part_name": None,
            "specifications": None,
            "mods_detected": [],
            "notes": None,
        }
        for key, default in defaults.items():
            if key not in extracted:
                extracted[key] = default

        data["extracted"] = extracted
        return data

    except Exception as e:
        logger.error(
            f"Vision analysis failed (provider={force_provider}): {e}",
            exc_info=True
        )
        return {
            "image_type": "unknown",
            "summary": "Could not analyse image",
            "extracted": {
                "make": None,
                "model": None,
                "year": None,
                "confidence": None,
                "part_name": None,
                "specifications": None,
                "mods_detected": [],
                "notes": None,
            },
        }


async def analyze_build_image(
    image_base64: str,
    modification_goal: str,
    car: str,
    image_mime_type: str = "image/jpeg",
) -> dict[str, Any]:
    """
    Analyses an uploaded image in context of the build goal.
    Returns vision_data dict. Never raises — returns a safe fallback on error.
    Falls back to secondary provider if primary fails.
    """
    logger.info(
        f"Vision analysis starting: "
        f"provider={settings.vision_provider}, "
        f"model={settings.vision_model}, "
        f"goal={modification_goal[:50] if modification_goal else 'none'}, "
        f"image_length={len(image_base64)}"
    )

    # Try primary vision provider
    result = await _try_vision_analysis(
        image_base64,
        modification_goal,
        car,
        image_mime_type,
        force_provider=settings.vision_provider,
    )

    logger.info(f"Primary vision result: summary={result.get('summary')}")

    # If primary returned empty/failed and we have a fallback provider configured
    if (
        result["summary"] in ["Could not analyse image", "Image uploaded", ""]
        and settings.vision_fallback_provider
        and settings.vision_fallback_provider != settings.vision_provider
    ):
        logger.info(
            f"Primary vision failed, trying fallback: {settings.vision_fallback_provider}"
        )
        result = await _try_vision_analysis(
            image_base64,
            modification_goal,
            car,
            image_mime_type,
            force_provider=settings.vision_fallback_provider,
        )
        logger.info(f"Fallback vision result: summary={result.get('summary')}")

    return result
