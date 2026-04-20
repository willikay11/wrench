import base64
import json
import logging
from typing import Optional

import anthropic
import google.genai as genai
from groq import AsyncGroq

from app.core.config import settings

logger = logging.getLogger(__name__)


class AIClientError(Exception):
    """Raised when AI provider calls fail."""

    def __init__(self, message: str, provider: str):
        self.message = message
        self.provider = provider
        super().__init__(f"{provider}: {message}")


async def generate(
    prompt: str,
    image_base64: str | None = None,
    image_mime_type: str = "image/jpeg",
    json_mode: bool = False,
    force_provider: str | None = None,
) -> str:
    """
    Generate text using the configured AI provider.

    Vision calls automatically route to VISION_PROVIDER (Gemini by default),
    while text-only calls use AI_PROVIDER (Groq by default).

    Args:
        prompt: The text prompt to send to the model
        image_base64: Optional base64-encoded image data for vision tasks
        image_mime_type: MIME type of the image (default: image/jpeg)
        json_mode: If True, instruct the model to return only valid JSON
        force_provider: Override the provider selection ("gemini", "claude", "groq")

    Returns:
        The model's text response as a plain string

    Raises:
        AIClientError: If the API call fails
    """
    # Determine which provider to use
    if force_provider:
        provider = force_provider.lower()
        model = settings.ai_model  # Use default model for forced provider
    elif image_base64:
        # Vision calls always use VISION_PROVIDER
        provider = settings.vision_provider.lower()
        model = settings.vision_model
    else:
        # Text-only calls use AI_PROVIDER
        provider = settings.ai_provider.lower()
        model = settings.ai_model

    # Add JSON instruction if requested
    if json_mode:
        prompt = f"{prompt}\n\nReturn only valid JSON. No markdown, no explanation."

    if provider == "gemini":
        return await _generate_gemini(prompt, image_base64, image_mime_type, model)
    elif provider == "claude":
        return await _generate_claude(prompt, image_base64, image_mime_type, model)
    elif provider == "groq":
        if image_base64:
            raise AIClientError(
                "Groq does not support vision. Use VISION_PROVIDER=gemini or VISION_PROVIDER=claude.",
                "groq"
            )
        return await _call_groq(prompt, json_mode, model)
    else:
        raise AIClientError(f"Unknown provider: {provider}", provider)


async def _generate_gemini(
    prompt: str,
    image_base64: Optional[str],
    image_mime_type: str,
    model: str,
) -> str:
    """Call Gemini API."""
    try:
        genai.configure(api_key=settings.gemini_api_key)
        client = genai.GenerativeModel(model)

        # Build content with text and optional image
        content: list[str | genai.types.Part] = [prompt]
        if image_base64:
            image_data = base64.b64decode(image_base64)
            image_part = genai.types.Part.from_data(data=image_data, mime_type=image_mime_type)
            content.append(image_part)

        response = client.generate_content(content)
        text = response.text

        logger.info("Generated text using Gemini model %s", model)
        return text

    except Exception as exc:
        error_msg = str(exc)
        logger.exception("Gemini API call failed: %s", error_msg)
        raise AIClientError(error_msg, "gemini") from exc


async def _generate_claude(
    prompt: str,
    image_base64: Optional[str],
    image_mime_type: str,
    model: str,
) -> str:
    """Call Claude API."""
    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

        # Build message content with text and optional image
        content: list[dict | str] = []

        # Add image first if provided (Claude vision best practices)
        if image_base64:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": image_mime_type,
                    "data": image_base64,
                },
            })

        # Add text prompt
        content.append({"type": "text", "text": prompt})

        response = await client.messages.create(
            model=model,
            max_tokens=4096,
            messages=[{"role": "user", "content": content}],
        )

        # Extract text from response
        text = ""
        for block in response.content:
            if block.type == "text":
                text += block.text

        logger.info("Generated text using Claude model %s", model)
        return text

    except Exception as exc:
        error_msg = str(exc)
        logger.exception("Claude API call failed: %s", error_msg)
        raise AIClientError(error_msg, "claude") from exc


async def _call_groq(
    prompt: str,
    json_mode: bool = False,
    model: str = "llama-3.3-70b-versatile",
) -> str:
    """Call Groq API."""
    try:
        client = AsyncGroq(api_key=settings.groq_api_key)

        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"} if json_mode else None,
            temperature=0.7,
        )

        text = response.choices[0].message.content
        logger.info("Generated text using Groq model %s", model)
        return text

    except Exception as exc:
        error_msg = str(exc)
        logger.exception("Groq API call failed: %s", error_msg)
        raise AIClientError(error_msg, "groq") from exc
