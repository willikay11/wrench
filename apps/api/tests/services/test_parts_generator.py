import json
import pytest
from unittest.mock import AsyncMock, patch

from app.services.parts_generator import generate_parts_for_build, enrich_parts_with_images
from app.services.ai_client import AIClientError


class TestGeneratePartsForBuild:
    """Test parts generator service"""

    @pytest.mark.asyncio
    @patch("app.services.parts_generator.generate")
    @patch("app.services.parts_generator.enrich_parts_with_images")
    async def test_generate_parts_returns_parsed_dict_on_success(self, mock_enrich, mock_generate):
        """generate_parts_for_build returns parsed dict on success"""
        ai_response = {
            "parts": [
                {
                    "name": "K24A2 engine",
                    "description": "JDM engine",
                    "category": "engine",
                    "goal": "K24 swap",
                    "status": "needed",
                    "price_estimate": 1200.00,
                    "currency": "USD",
                    "vendor_name": "Japanese Engines Inc",
                    "vendor_url": None,
                    "is_safety_critical": False,
                    "notes": "Verify compression",
                }
            ],
            "summary": {
                "estimated_total": 1200.00,
                "safety_critical_count": 0,
                "message": "K24 swap parts list",
            },
        }

        # Enrich adds image_url field
        enriched_parts = [
            {**ai_response["parts"][0], "image_url": None}
        ]

        mock_generate.return_value = json.dumps(ai_response)
        mock_enrich.return_value = enriched_parts

        build = {
            "car": "Honda E30",
            "modification_goal": "K24 engine swap",
            "goals": ["K24 swap"],
        }

        result = await generate_parts_for_build(build)

        # Result should have enriched parts
        assert result["parts"] == enriched_parts
        assert result["summary"] == ai_response["summary"]
        mock_generate.assert_called_once()
        mock_enrich.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.services.parts_generator.generate")
    async def test_generate_parts_raises_error_on_invalid_json(self, mock_generate):
        """generate_parts_for_build raises AIClientError on invalid JSON response"""
        mock_generate.return_value = "not valid json {{"

        build = {"car": "Honda E30", "goals": ["K24 swap"]}

        with pytest.raises(AIClientError) as exc_info:
            await generate_parts_for_build(build)

        assert exc_info.value.provider == "parts_generator"
        assert "invalid JSON" in str(exc_info.value)

    @pytest.mark.asyncio
    @patch("app.services.parts_generator.generate")
    async def test_generate_parts_prompt_includes_car_and_goal(self, mock_generate):
        """generate_parts_for_build includes car and goal in prompt"""
        mock_generate.return_value = json.dumps({"parts": [], "summary": {}})

        build = {
            "car": "BMW E30",
            "modification_goal": "engine swap",
            "goals": ["engine swap", "daily driver"],
        }

        await generate_parts_for_build(build)

        # Get the prompt argument passed to generate
        call_args = mock_generate.call_args
        prompt = call_args[0][0]

        assert "BMW E30" in prompt
        assert "engine swap" in prompt
        assert "daily driver" in prompt

    @pytest.mark.asyncio
    @patch("app.services.parts_generator.generate")
    async def test_generate_parts_fallback_goal_to_modification_goal(self, mock_generate):
        """generate_parts_for_build falls back to modification_goal when goals empty"""
        mock_generate.return_value = json.dumps({"parts": [], "summary": {}})

        build = {
            "car": "Honda Civic",
            "modification_goal": "suspension upgrade",
            "goals": [],
        }

        await generate_parts_for_build(build)

        call_args = mock_generate.call_args
        prompt = call_args[0][0]

        assert "suspension upgrade" in prompt

    @pytest.mark.asyncio
    @patch("app.services.parts_generator.generate")
    async def test_generate_parts_detects_track_use_case(self, mock_generate):
        """generate_parts_for_build detects track use case from goal"""
        mock_generate.return_value = json.dumps({"parts": [], "summary": {}})

        build = {
            "car": "Miata",
            "modification_goal": "track and street racing",
            "goals": ["track preparation"],
        }

        await generate_parts_for_build(build)

        call_args = mock_generate.call_args
        prompt = call_args[0][0]

        assert "track" in prompt.lower()

    @pytest.mark.asyncio
    @patch("app.services.parts_generator.generate")
    async def test_generate_parts_json_mode_enabled(self, mock_generate):
        """generate_parts_for_build calls generate with json_mode=True"""
        mock_generate.return_value = json.dumps({"parts": [], "summary": {}})

        build = {"car": "Civic", "goals": ["swap"]}

        await generate_parts_for_build(build)

        # Verify json_mode=True was passed
        call_args = mock_generate.call_args
        assert call_args[1].get("json_mode") is True

    @pytest.mark.asyncio
    @patch("app.services.parts_generator.generate")
    async def test_generate_parts_includes_specific_requirements(self, mock_generate):
        """generate_parts_for_build includes specific_requirements in prompt"""
        mock_generate.return_value = json.dumps({"parts": [], "summary": {}})

        build = {"car": "Civic", "goals": ["swap"]}

        await generate_parts_for_build(build, specific_requirements="19-inch bronze Work wheels")

        call_args = mock_generate.call_args
        prompt = call_args[0][0]

        assert "19-inch bronze Work wheels" in prompt

    @pytest.mark.asyncio
    @patch("app.services.parts_generator.generate")
    async def test_generate_parts_fallback_when_no_requirements(self, mock_generate):
        """generate_parts_for_build uses fallback when specific_requirements is None"""
        mock_generate.return_value = json.dumps({"parts": [], "summary": {}})

        build = {"car": "Civic", "goals": ["swap"]}

        await generate_parts_for_build(build, specific_requirements=None)

        call_args = mock_generate.call_args
        prompt = call_args[0][0]

        assert "None specified" in prompt

    @pytest.mark.asyncio
    @patch("app.services.parts_generator.generate")
    async def test_generate_parts_passes_image_to_generate(self, mock_generate):
        """generate_parts_for_build passes image_base64 to generate function"""
        mock_generate.return_value = json.dumps({"parts": [], "summary": {}})

        build = {"car": "Civic", "goals": ["swap"]}
        image_base64 = "fake-image-data"

        await generate_parts_for_build(build, image_base64=image_base64)

        call_args = mock_generate.call_args
        assert call_args[1].get("image_base64") == image_base64


class TestEnrichPartsWithImages:
    """Test image enrichment for parts"""

    @pytest.mark.asyncio
    @patch("app.services.parts_generator.fetch_product_image")
    async def test_enrich_parts_fetches_image_for_vendor_url(self, mock_fetch):
        """enrich_parts_with_images fetches image for parts with vendor_url"""
        mock_fetch.return_value = "https://example.com/product-image.jpg"

        parts = [
            {
                "name": "Engine",
                "vendor_url": "https://rockauto.com/products/engine",
            }
        ]

        result = await enrich_parts_with_images(parts)

        assert result[0]["image_url"] == "https://example.com/product-image.jpg"
        mock_fetch.assert_called_once_with("https://rockauto.com/products/engine")

    @pytest.mark.asyncio
    @patch("app.services.parts_generator.fetch_product_image")
    async def test_enrich_parts_sets_none_without_vendor_url(self, mock_fetch):
        """enrich_parts_with_images sets None for parts without vendor_url"""
        parts = [
            {
                "name": "Custom part",
                "vendor_url": None,
            }
        ]

        result = await enrich_parts_with_images(parts)

        assert result[0]["image_url"] is None
        mock_fetch.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.services.parts_generator.fetch_product_image")
    async def test_enrich_parts_runs_concurrently(self, mock_fetch):
        """enrich_parts_with_images runs fetches concurrently"""
        mock_fetch.return_value = "https://example.com/image.jpg"

        parts = [
            {"name": "Part 1", "vendor_url": "https://example.com/1"},
            {"name": "Part 2", "vendor_url": "https://example.com/2"},
            {"name": "Part 3", "vendor_url": "https://example.com/3"},
        ]

        result = await enrich_parts_with_images(parts)

        # All parts should have image_url set
        assert all("image_url" in p for p in result)
        # fetch_product_image should be called 3 times (concurrently)
        assert mock_fetch.call_count == 3

    @pytest.mark.asyncio
    @patch("app.services.parts_generator.generate")
    @patch("app.services.parts_generator.enrich_parts_with_images")
    async def test_generate_parts_includes_image_url(self, mock_enrich, mock_generate):
        """generate_parts_for_build includes image_url in returned parts"""
        parts_with_images = [
            {
                "name": "K24A2 engine",
                "vendor_url": "https://rockauto.com/engine",
                "image_url": "https://example.com/image.jpg",
            }
        ]
        mock_response = {
            "parts": [{"name": "K24A2 engine", "vendor_url": "https://rockauto.com/engine"}],
            "summary": {"estimated_total": 1200.00},
        }
        mock_generate.return_value = json.dumps(mock_response)
        mock_enrich.return_value = parts_with_images

        build = {
            "car": "Honda E30",
            "modification_goal": "K24 swap",
            "goals": ["K24 swap"],
        }

        result = await generate_parts_for_build(build)

        assert result["parts"][0]["image_url"] == "https://example.com/image.jpg"
        mock_enrich.assert_called_once()
