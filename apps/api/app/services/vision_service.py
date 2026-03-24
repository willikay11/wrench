import anthropic
import base64
from app.core.config import settings


async def analyse_car_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """
    Send a car image to Claude Vision and return structured build data.
    Called asynchronously after build creation — never blocks the user.
    """
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    image_data = base64.standard_b64encode(image_bytes).decode("utf-8")

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime_type,
                            "data": image_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": """Analyse this car image and return a JSON object with these fields:
                        {
                          "make": string,
                          "model": string,
                          "year_range": string,
                          "visible_mods": string[],
                          "engine_hints": string[],
                          "confidence": { "make": float, "model": float, "year": float }
                        }
                        Return only valid JSON, no markdown.""",
                    },
                ],
            }
        ],
    )

    import json
    return json.loads(message.content[0].text)
