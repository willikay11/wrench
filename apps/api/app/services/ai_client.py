import base64
import json
import logging
from typing import Optional

import anthropic
import google.genai as genai
from groq import AsyncGroq
from openai import AsyncOpenAI

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
    # Determine which provider to use with full priority routing
    if image_base64:
        # Vision calls use VISION_PROVIDER
        provider = settings.vision_provider.lower()
        if provider == "openrouter":
            return await _call_openrouter(
                prompt, image_base64, image_mime_type, json_mode, use_vision_model=True
            )
        elif provider == "gemini":
            return await _generate_gemini(prompt, image_base64, image_mime_type, settings.vision_model, json_mode)
        elif provider == "claude":
            return await _generate_claude(prompt, image_base64, image_mime_type, settings.vision_model, json_mode)
        else:
            raise AIClientError(
                f"Provider {provider} does not support vision", provider
            )
    else:
        # Text-only calls use AI_PROVIDER
        provider = settings.ai_provider.lower()
        if provider == "groq":
            return await _call_groq(prompt, json_mode, settings.ai_model)
        elif provider == "openrouter":
            return await _call_openrouter(prompt, json_mode=json_mode)
        elif provider == "gemini":
            return await _generate_gemini(prompt, None, image_mime_type, settings.ai_model, json_mode)
        elif provider == "claude":
            return await _generate_claude(prompt, None, image_mime_type, settings.ai_model, json_mode)
        else:
            raise AIClientError(f"Unknown provider: {provider}", provider)


async def _generate_gemini(
    prompt: str,
    image_base64: Optional[str],
    image_mime_type: str,
    model: str,
    json_mode: bool = False,
) -> str:
    """Call Gemini API."""
    try:
        genai.configure(api_key=settings.gemini_api_key)
        client = genai.GenerativeModel(model)

        # Build content with text and optional image
        final_prompt = prompt
        if json_mode:
            final_prompt += (
                "\n\nReturn only valid JSON. "
                "No markdown fences, no explanation."
            )

        content: list[str | genai.types.Part] = [final_prompt]
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
    json_mode: bool = False,
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
        final_prompt = prompt
        if json_mode:
            final_prompt += (
                "\n\nReturn only valid JSON. "
                "No markdown fences, no explanation."
            )
        content.append({"type": "text", "text": final_prompt})

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


async def _call_openrouter(
    prompt: str,
    image_base64: str | None = None,
    image_mime_type: str = "image/jpeg",
    json_mode: bool = False,
    use_vision_model: bool = False,
) -> str:
    """Call OpenRouter API (OpenAI-compatible)."""
    try:
        client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_api_base,
            default_headers={
                "HTTP-Referer": "https://wrench.app",
                "X-Title": "Wrench",
            }
        )

        model = (
            settings.openrouter_vision_model
            if (image_base64 or use_vision_model)
            else settings.openrouter_text_model
        )

        final_prompt = prompt
        if json_mode:
            final_prompt += (
                "\n\nReturn only valid JSON. "
                "No markdown fences, no explanation."
            )

        content: list = [{"type": "text", "text": final_prompt}]

        if image_base64:
            content.insert(0, {
                "type": "image_url",
                "image_url": {
                    "url": (
                        f"data:{image_mime_type};"
                        f"base64,{image_base64}"
                    )
                }
            })

        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": content}],
            temperature=0.7,
        )

        text = response.choices[0].message.content
        logger.info("Generated text using OpenRouter model %s", model)
        return text

    except Exception as exc:
        error_msg = str(exc)
        logger.exception("OpenRouter API call failed: %s", error_msg)
        raise AIClientError(error_msg, "openrouter") from exc
