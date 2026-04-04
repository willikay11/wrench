from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import CurrentUser, get_current_user
from app.core.supabase import get_supabase
from app.schemas.builds import BuildCreate, BuildResponse

router = APIRouter()


@router.get("/", response_model=list[BuildResponse])
async def get_builds(user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    """
    Returns all builds owned by the authenticated user.
    The user_id filter is enforced here AND by RLS in Postgres —
    defence in depth means a bug in one layer doesn't expose data.
    """
    supabase = get_supabase()

    response = (
        supabase.table("builds")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )

    return cast(list[dict[str, Any]], response.data)

@router.post("/", response_model=BuildResponse, status_code=status.HTTP_201_CREATED)
async def create_build(
    payload: BuildCreate,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Creates a new build owned by the authenticated user.
    user_id is set server-side from the verified JWT —
    the client never sends their own user_id.
    """
    supabase = get_supabase()

    response = (
        supabase.table("builds")
        .insert({
            "title": payload.title,
            "donor_car": payload.donor_car,
            "engine_swap": payload.engine_swap,
            "goals": payload.goals,
            "user_id": user["id"],
        })
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create build",
        )

    return cast(dict[str, Any], response.data[0])


@router.get("/{build_id}", response_model=BuildResponse)
async def get_build(build_id: str, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """
    Returns a single build by ID, but only if it belongs to the authenticated user.
    This is used by the frontend when navigating to /builds/{id} to fetch the build details.
    """
    supabase = get_supabase()

    response = (
        supabase.table("builds")
        .select("*")
        .eq("user_id", user["id"])
        .eq("id", build_id)
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Build not found",
        )

    return cast(dict[str, Any], response.data)