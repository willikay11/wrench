import base64
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.ai_client import generate, AIClientError


class TestVisionRouting:
    """Test vision calls route to VISION_PROVIDER automatically"""

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client.genai")
    async def test_vision_call_routes_to_gemini(self, mock_genai, mock_settings):
        """Vision call with image routes to Gemini even if AI_PROVIDER=groq"""
        mock_settings.ai_provider = "groq"
        mock_settings.ai_model = "llama-3.3-70b-versatile"
        mock_settings.vision_provider = "gemini"
        mock_settings.vision_model = "gemini-1.5-flash"
        mock_settings.gemini_api_key = "test-key"
        mock_settings.groq_api_key = "test-groq-key"

        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Vision result"
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        image_base64 = base64.b64encode(b"test-image").decode()
        result = await generate("Analyze image", image_base64=image_base64)

        assert result == "Vision result"
        # Verify Gemini was called with vision model
        mock_genai.GenerativeModel.assert_called_once_with("gemini-1.5-flash")

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client._call_groq")
    async def test_text_only_call_routes_to_groq(self, mock_groq, mock_settings):
        """Text-only call uses AI_PROVIDER (Groq)"""
        mock_settings.ai_provider = "groq"
        mock_settings.ai_model = "llama-3.3-70b-versatile"
        mock_settings.groq_api_key = "test-key"
        mock_groq.return_value = "Text result"

        result = await generate("Text prompt")

        assert result == "Text result"
        mock_groq.assert_called_once_with("Text prompt", False, "llama-3.3-70b-versatile")

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client._call_groq")
    async def test_force_provider_overrides_routing(self, mock_groq, mock_settings):
        """force_provider parameter overrides automatic routing"""
        mock_settings.ai_provider = "groq"
        mock_settings.ai_model = "llama-3.3-70b-versatile"
        mock_settings.groq_api_key = "test-key"
        mock_groq.return_value = "Result"

        # Force use of groq even though we pass json_mode (which normally uses AI_PROVIDER)
        result = await generate("Prompt", json_mode=True, force_provider="groq")

        assert result == "Result"
        mock_groq.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client._call_groq")
    async def test_groq_with_image_raises_error(self, mock_groq, mock_settings):
        """Groq raises error when image is provided (can't be routed to vision)"""
        mock_settings.ai_provider = "groq"
        mock_settings.ai_model = "llama-3.3-70b-versatile"
        mock_settings.vision_provider = "groq"  # Misconfigured
        mock_settings.groq_api_key = "test-key"

        image_base64 = base64.b64encode(b"test-image").decode()

        with pytest.raises(AIClientError) as exc_info:
            await generate("Analyze", image_base64=image_base64, force_provider="groq")

        assert "does not support vision" in str(exc_info.value)


class TestGenerateGemini:
    """Test Gemini provider"""

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client.genai")
    async def test_generate_calls_gemini_when_provider_is_gemini(self, mock_genai, mock_settings):
        """generate() calls Gemini when AI_PROVIDER=gemini"""
        mock_settings.ai_provider = "gemini"
        mock_settings.ai_model = "gemini-1.5-flash"
        mock_settings.gemini_api_key = "test-key"

        # Mock the GenerativeModel
        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Test response"
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        result = await generate("Test prompt")

        assert result == "Test response"
        mock_genai.configure.assert_called_once_with(api_key="test-key")
        mock_genai.GenerativeModel.assert_called_once_with("gemini-1.5-flash")
        mock_model.generate_content.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client.genai")
    async def test_generate_passes_image_to_gemini(self, mock_genai, mock_settings):
        """generate() passes image correctly to Gemini when image_base64 provided"""
        mock_settings.ai_provider = "groq"
        mock_settings.ai_model = "llama-3.3-70b-versatile"
        mock_settings.vision_provider = "gemini"
        mock_settings.vision_model = "gemini-1.5-flash"
        mock_settings.gemini_api_key = "test-key"

        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Image analysis result"
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        # Mock image data
        image_base64 = base64.b64encode(b"fake-image-data").decode()

        # Mock genai.types.Part
        mock_image_part = MagicMock()
        mock_genai.types.Part.from_data.return_value = mock_image_part

        result = await generate("Analyze this image", image_base64=image_base64, image_mime_type="image/png")

        assert result == "Image analysis result"
        # Verify image was decoded and passed to Part.from_data
        mock_genai.types.Part.from_data.assert_called_once()
        call_args = mock_genai.types.Part.from_data.call_args
        assert call_args[1]["mime_type"] == "image/png"

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client.genai")
    async def test_generate_appends_json_instruction_for_gemini(self, mock_genai, mock_settings):
        """generate() appends JSON instruction when json_mode=True for Gemini"""
        mock_settings.ai_provider = "gemini"
        mock_settings.ai_model = "gemini-1.5-flash"
        mock_settings.gemini_api_key = "test-key"

        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = '{"result": "data"}'
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        result = await generate("Return data", json_mode=True)

        assert result == '{"result": "data"}'
        # Verify the prompt included JSON instruction
        call_args = mock_model.generate_content.call_args
        content = call_args[0][0]
        assert "Return only valid JSON" in content[0]

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client.genai")
    async def test_generate_raises_ai_client_error_on_gemini_failure(self, mock_genai, mock_settings):
        """generate() raises AIClientError when Gemini throws"""
        mock_settings.ai_provider = "gemini"
        mock_settings.ai_model = "gemini-1.5-flash"
        mock_settings.gemini_api_key = "test-key"

        mock_genai.configure.side_effect = Exception("API error")

        with pytest.raises(AIClientError) as exc_info:
            await generate("Test prompt")

        assert exc_info.value.provider == "gemini"
        assert "API error" in str(exc_info.value)


class TestGenerateClaude:
    """Test Claude provider"""

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client.anthropic")
    async def test_generate_calls_claude_when_provider_is_claude(self, mock_anthropic, mock_settings):
        """generate() calls Claude when AI_PROVIDER=claude"""
        mock_settings.ai_provider = "claude"
        mock_settings.ai_model = "claude-3.5-sonnet"
        mock_settings.anthropic_api_key = "test-key"

        # Mock the async client
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_content_block = MagicMock()
        mock_content_block.type = "text"
        mock_content_block.text = "Claude response"
        mock_response.content = [mock_content_block]
        mock_client.messages.create = AsyncMock(return_value=mock_response)
        mock_anthropic.AsyncAnthropic.return_value = mock_client

        result = await generate("Test prompt")

        assert result == "Claude response"
        mock_anthropic.AsyncAnthropic.assert_called_once_with(api_key="test-key")
        mock_client.messages.create.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client.anthropic")
    async def test_generate_passes_image_to_claude(self, mock_anthropic, mock_settings):
        """generate() passes image correctly to Claude when image_base64 provided"""
        mock_settings.ai_provider = "groq"
        mock_settings.ai_model = "llama-3.3-70b-versatile"
        mock_settings.vision_provider = "claude"
        mock_settings.vision_model = "claude-3.5-sonnet"
        mock_settings.anthropic_api_key = "test-key"

        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_content_block = MagicMock()
        mock_content_block.type = "text"
        mock_content_block.text = "Vision result"
        mock_response.content = [mock_content_block]
        mock_client.messages.create = AsyncMock(return_value=mock_response)
        mock_anthropic.AsyncAnthropic.return_value = mock_client

        image_base64 = base64.b64encode(b"fake-image-data").decode()

        result = await generate("Analyze this", image_base64=image_base64, image_mime_type="image/png")

        assert result == "Vision result"
        # Verify the image was included in the message content
        call_args = mock_client.messages.create.call_args
        messages = call_args[1]["messages"]
        content = messages[0]["content"]
        # First item should be image
        assert content[0]["type"] == "image"
        assert content[0]["source"]["type"] == "base64"
        assert content[0]["source"]["media_type"] == "image/png"

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client.anthropic")
    async def test_generate_appends_json_instruction_for_claude(self, mock_anthropic, mock_settings):
        """generate() appends JSON instruction when json_mode=True for Claude"""
        mock_settings.ai_provider = "claude"
        mock_settings.ai_model = "claude-3.5-sonnet"
        mock_settings.anthropic_api_key = "test-key"

        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_content_block = MagicMock()
        mock_content_block.type = "text"
        mock_content_block.text = '{"result": "data"}'
        mock_response.content = [mock_content_block]
        mock_client.messages.create = AsyncMock(return_value=mock_response)
        mock_anthropic.AsyncAnthropic.return_value = mock_client

        result = await generate("Return data", json_mode=True)

        assert result == '{"result": "data"}'
        # Verify JSON instruction was added to prompt
        call_args = mock_client.messages.create.call_args
        messages = call_args[1]["messages"]
        content = messages[0]["content"]
        # Find text content
        text_content = next((item for item in content if item["type"] == "text"), None)
        assert text_content is not None
        assert "Return only valid JSON" in text_content["text"]

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client.anthropic")
    async def test_generate_raises_ai_client_error_on_claude_failure(self, mock_anthropic, mock_settings):
        """generate() raises AIClientError when Claude throws"""
        mock_settings.ai_provider = "claude"
        mock_settings.ai_model = "claude-3.5-sonnet"
        mock_settings.anthropic_api_key = "test-key"

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(side_effect=Exception("API error"))
        mock_anthropic.AsyncAnthropic.return_value = mock_client

        with pytest.raises(AIClientError) as exc_info:
            await generate("Test prompt")

        assert exc_info.value.provider == "claude"
        assert "API error" in str(exc_info.value)


class TestReturnValues:
    """Test return value formats"""

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client.genai")
    async def test_generate_returns_plain_string_for_gemini(self, mock_genai, mock_settings):
        """generate() returns the text response as a plain string for Gemini"""
        mock_settings.ai_provider = "gemini"
        mock_settings.ai_model = "gemini-1.5-flash"
        mock_settings.gemini_api_key = "test-key"

        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Plain text response"
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        result = await generate("Prompt")

        assert isinstance(result, str)
        assert result == "Plain text response"

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client.anthropic")
    async def test_generate_returns_plain_string_for_claude(self, mock_anthropic, mock_settings):
        """generate() returns the text response as a plain string for Claude"""
        mock_settings.ai_provider = "claude"
        mock_settings.ai_model = "claude-3.5-sonnet"
        mock_settings.anthropic_api_key = "test-key"

        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_content_block = MagicMock()
        mock_content_block.type = "text"
        mock_content_block.text = "Plain text response"
        mock_response.content = [mock_content_block]
        mock_client.messages.create = AsyncMock(return_value=mock_response)
        mock_anthropic.AsyncAnthropic.return_value = mock_client

        result = await generate("Prompt")

        assert isinstance(result, str)
        assert result == "Plain text response"


class TestGenerateGroq:
    """Test Groq provider"""

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client.AsyncGroq")
    async def test_generate_calls_groq_when_provider_is_groq(self, mock_async_groq, mock_settings):
        """generate() calls Groq when AI_PROVIDER=groq"""
        mock_settings.ai_provider = "groq"
        mock_settings.ai_model = "llama-3.3-70b-versatile"
        mock_settings.groq_api_key = "test-groq-key"

        # Mock the async client
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_choice = MagicMock()
        mock_choice.message.content = "Groq response"
        mock_response.choices = [mock_choice]
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        mock_async_groq.return_value = mock_client

        result = await generate("Test prompt")

        assert result == "Groq response"
        mock_async_groq.assert_called_once_with(api_key="test-groq-key")
        mock_client.chat.completions.create.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    async def test_generate_raises_error_when_image_provided_with_groq_as_vision(self, mock_settings):
        """generate() raises AIClientError when Groq forced as vision provider"""
        mock_settings.ai_provider = "groq"
        mock_settings.vision_provider = "groq"  # Misconfigured
        mock_settings.groq_api_key = "test-key"

        image_base64 = base64.b64encode(b"fake-image-data").decode()

        with pytest.raises(AIClientError) as exc_info:
            await generate("Analyze this", image_base64=image_base64)

        assert exc_info.value.provider == "groq"
        assert "does not support vision" in str(exc_info.value)

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client.AsyncGroq")
    async def test_generate_appends_json_instruction_for_groq(self, mock_async_groq, mock_settings):
        """generate() appends JSON instruction when json_mode=True for Groq"""
        mock_settings.ai_provider = "groq"
        mock_settings.ai_model = "llama-3.3-70b-versatile"
        mock_settings.groq_api_key = "test-key"

        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_choice = MagicMock()
        mock_choice.message.content = '{"result": "data"}'
        mock_response.choices = [mock_choice]
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        mock_async_groq.return_value = mock_client

        result = await generate("Return data", json_mode=True)

        assert result == '{"result": "data"}'
        # Verify json_object response format was used
        call_args = mock_client.chat.completions.create.call_args
        assert call_args[1]["response_format"] == {"type": "json_object"}

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client.AsyncGroq")
    async def test_generate_raises_ai_client_error_on_groq_failure(self, mock_async_groq, mock_settings):
        """generate() raises AIClientError when Groq throws"""
        mock_settings.ai_provider = "groq"
        mock_settings.ai_model = "llama-3.3-70b-versatile"
        mock_settings.groq_api_key = "test-key"

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(side_effect=Exception("API error"))
        mock_async_groq.return_value = mock_client

        with pytest.raises(AIClientError) as exc_info:
            await generate("Test prompt")

        assert exc_info.value.provider == "groq"
        assert "API error" in str(exc_info.value)

    @pytest.mark.asyncio
    @patch("app.services.ai_client.settings")
    @patch("app.services.ai_client.AsyncGroq")
    async def test_generate_returns_plain_string_for_groq(self, mock_async_groq, mock_settings):
        """generate() returns the text response as a plain string for Groq"""
        mock_settings.ai_provider = "groq"
        mock_settings.ai_model = "llama-3.3-70b-versatile"
        mock_settings.groq_api_key = "test-key"

        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_choice = MagicMock()
        mock_choice.message.content = "Plain text response"
        mock_response.choices = [mock_choice]
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        mock_async_groq.return_value = mock_client

        result = await generate("Prompt")

        assert isinstance(result, str)
        assert result == "Plain text response"
