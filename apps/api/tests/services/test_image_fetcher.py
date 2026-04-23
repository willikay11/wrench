import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.image_fetcher import fetch_product_image


class TestFetchProductImage:
    """Test OG image tag fetching from vendor URLs."""

    @pytest.mark.asyncio
    @patch("app.services.image_fetcher.httpx.AsyncClient")
    async def test_returns_og_image_content(self, mock_client_class):
        """fetch_product_image returns og:image content when present"""
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = '<meta property="og:image" content="https://example.com/image.jpg">'
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_class.return_value.__aenter__.return_value = mock_client

        result = await fetch_product_image("https://example.com/product")

        assert result == "https://example.com/image.jpg"

    @pytest.mark.asyncio
    @patch("app.services.image_fetcher.httpx.AsyncClient")
    async def test_falls_back_to_twitter_image(self, mock_client_class):
        """fetch_product_image falls back to twitter:image when og:image absent"""
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = '<meta name="twitter:image" content="https://example.com/twitter.jpg">'
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_class.return_value.__aenter__.return_value = mock_client

        result = await fetch_product_image("https://example.com/product")

        assert result == "https://example.com/twitter.jpg"

    @pytest.mark.asyncio
    @patch("app.services.image_fetcher.httpx.AsyncClient")
    async def test_returns_none_for_non_200_status(self, mock_client_class):
        """fetch_product_image returns None when status code is not 200"""
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_class.return_value.__aenter__.return_value = mock_client

        result = await fetch_product_image("https://example.com/notfound")

        assert result is None

    @pytest.mark.asyncio
    @patch("app.services.image_fetcher.httpx.AsyncClient")
    async def test_returns_none_on_timeout(self, mock_client_class):
        """fetch_product_image returns None when request times out"""
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=TimeoutError())
        mock_client_class.return_value.__aenter__.return_value = mock_client

        result = await fetch_product_image("https://example.com/slow")

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_empty_url(self):
        """fetch_product_image returns None for empty URL"""
        result = await fetch_product_image("")
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_none_url(self):
        """fetch_product_image returns None for None URL"""
        result = await fetch_product_image(None)
        assert result is None

    @pytest.mark.asyncio
    @patch("app.services.image_fetcher.httpx.AsyncClient")
    async def test_returns_none_when_no_image_tags(self, mock_client_class):
        """fetch_product_image returns None when page has no og:image or twitter:image"""
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "<html><body>No image tags</body></html>"
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_class.return_value.__aenter__.return_value = mock_client

        result = await fetch_product_image("https://example.com/noimage")

        assert result is None

    @pytest.mark.asyncio
    @patch("app.services.image_fetcher.httpx.AsyncClient")
    async def test_never_raises_exception(self, mock_client_class):
        """fetch_product_image never raises — always returns None on any exception"""
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=Exception("Unexpected error"))
        mock_client_class.return_value.__aenter__.return_value = mock_client

        result = await fetch_product_image("https://example.com/error")

        assert result is None

    @pytest.mark.asyncio
    @patch("app.services.image_fetcher.httpx.AsyncClient")
    async def test_uses_correct_headers(self, mock_client_class):
        """fetch_product_image sends correct User-Agent header"""
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = '<meta property="og:image" content="https://example.com/image.jpg">'
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_class.return_value.__aenter__.return_value = mock_client

        await fetch_product_image("https://example.com/product")

        # Verify get was called with correct headers
        mock_client.get.assert_called_once()
        call_kwargs = mock_client.get.call_args[1]
        assert "User-Agent" in call_kwargs["headers"]
        assert "Wrench" in call_kwargs["headers"]["User-Agent"]
