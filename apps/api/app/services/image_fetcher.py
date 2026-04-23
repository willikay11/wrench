import logging

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


async def fetch_product_image(url: str) -> str | None:
    """
    Fetches the og:image meta tag from a vendor URL.
    Returns the image URL string or None if not found.
    Times out after 5 seconds — never blocks generation.
    """
    if not url:
        return None
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                timeout=5.0,
                follow_redirects=True,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (compatible; "
                        "Wrench/1.0)"
                    )
                }
            )
            if response.status_code != 200:
                return None

            soup = BeautifulSoup(
                response.text, "html.parser"
            )

            # Try og:image first
            og = soup.find(
                "meta", property="og:image"
            )
            if og and og.get("content"):
                return og["content"]

            # Fall back to twitter:image
            tw = soup.find(
                "meta", attrs={"name": "twitter:image"}
            )
            if tw and tw.get("content"):
                return tw["content"]

            return None

    except Exception:
        # Never raise — image fetch is best-effort only
        return None
