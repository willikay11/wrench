from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

bearer = HTTPBearer()


def verify_internal_secret(
    credentials: HTTPAuthorizationCredentials = Security(bearer),
) -> None:
    """
    Used for internal Next.js → FastAPI calls.
    The web server signs requests with INTERNAL_API_SECRET.
    """
    if credentials.credentials != settings.internal_api_secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid token")
