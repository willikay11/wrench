# apps/api/app/core/dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.supabase import get_supabase

bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    """
    Extracts the JWT from the Authorization header and verifies it
    with Supabase. Returns the user dict if valid, raises 401 if not.

    Every protected route injects this with Depends(get_current_user).
    """
    token = credentials.credentials

    supabase = get_supabase()

    # We use get_user() not decode the JWT ourselves —
    # Supabase validates the signature and expiry for us
    response = supabase.auth.get_user(token)

    if not response or not response.user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    return {
        "id": response.user.id,
        "email": response.user.email,
    }