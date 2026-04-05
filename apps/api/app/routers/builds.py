import logging
from typing import Any, cast

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.dependencies import CurrentUser, get_current_user
from app.core.supabase import get_supabase
from app.schemas.builds import BuildCreate, BuildResponse, BuildImageResponse

router = APIRouter()
logger = logging.getLogger(__name__)


def with_part_counts(build: dict[str, Any]) -> dict[str, Any]:
    build_data = dict(build)
    parts = cast(list[dict[str, Any]], build_data.pop("parts", []) or [])
    build_data["parts_total"] = len(parts)
    build_data["parts_sourced"] = sum(
        1 for part in parts if part.get("status") in ("sourced", "installed")
    )
    return build_data


# ── GET /v1/builds ────────────────────────────────────────────────────────
@router.get("/", response_model=list[BuildResponse])
async def get_builds(user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    """
    Returns all builds owned by the authenticated user.
    The user_id filter is enforced here AND by RLS in Postgres —
    defence in depth means a bug in one layer doesn't expose data.
    """
    supabase = get_supabase(user["access_token"])

    response = (
        supabase.table("builds")
        .select("*, parts(status)")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )

    builds = [
        with_part_counts(build)
        for build in cast(list[dict[str, Any]], response.data or [])
    ]

    return builds

#─ POST /v1/builds ────────────────────────────────────────────────────────
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
    supabase = get_supabase(user["access_token"])

    response = (
        supabase.table("builds")
        .insert({
            "title": payload.title,
            "donor_car": payload.car,
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

    return with_part_counts(cast(dict[str, Any], response.data[0]))


#── GET /v1/builds/{id} ────────────────────────────────────────────────────────
@router.get("/{build_id}", response_model=BuildResponse)
async def get_build(build_id: str, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """
    Returns a single build by ID, but only if it belongs to the authenticated user.
    This is used by the frontend when navigating to /builds/{id} to fetch the build details.
    """
    supabase = get_supabase(user["access_token"])

    response = (
        supabase.table("builds")
        .select("*, parts(status)")
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

    return with_part_counts(cast(dict[str, Any], response.data))


# ── PUT /v1/builds/{id} ────────────────────────────────────────────────────────
@router.put("/{build_id}", response_model=BuildResponse)
async def update_build(
    build_id: str,
    payload: BuildCreate,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Updates an existing build by ID, but only if it belongs to the authenticated user.
    The client can update the title, car, optional engine swap, and goals.
    """
    supabase = get_supabase(user["access_token"])

    # First, verify the build exists and belongs to the user
    existing = (
        supabase.table("builds")
        .select("*")
        .eq("user_id", user["id"])
        .eq("id", build_id)
        .single()
        .execute()
    )

    if not existing.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Build not found",
        )

    # Then perform the update
    response = (
        supabase.table("builds")
        .update({
            "title": payload.title,
            "donor_car": payload.car,
            "engine_swap": payload.engine_swap,
            "goals": payload.goals,
        })
        .eq("id", build_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update build",
        )

    return with_part_counts(cast(dict[str, Any], response.data[0]))

# ── DELETE /v1/builds/{id} ────────────────────────────────────────────────────────
@router.delete("/{build_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_build(build_id: str, user: CurrentUser = Depends(get_current_user)) -> None:
    """
    Deletes a build by ID, but only if it belongs to the authenticated user.
    This also cascades to delete related parts and conversations via RLS policies.
    """
    supabase = get_supabase(user["access_token"])

    # First, verify the build exists and belongs to the user
    existing = (
        supabase.table("builds")
        .select("*")
        .eq("user_id", user["id"])
        .eq("id", build_id)
        .single()
        .execute()
    )

    if not existing.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Build not found",
        )

    # Then perform the delete
    response = (
        supabase.table("builds")
        .delete()
        .eq("id", build_id)
        .execute()
    )

    if response.data is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete build",
        )

# ── POST /v1/builds/{id}/image ────────────────────────────────────────────────────────
@router.post("/{build_id}/image", response_model=BuildImageResponse, status_code=status.HTTP_201_CREATED)
async def upload_build_image(
    build_id: str,
    image: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Upload an image to the `build-images` bucket, update the build record,
    and return the stored public URL.
    """
    supabase = get_supabase(user["access_token"])

    existing = (
        supabase.table("builds")
        .select("*")
        .eq("user_id", user["id"])
        .eq("id", build_id)
        .single()
        .execute()
    )

    if not existing.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Build not found",
        )

    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be an image",
        )

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )

    storage_path = f"{user['id']}/{build_id}.jpg"

    try:
        supabase.storage.from_("build-images").upload(
            storage_path,
            image_bytes,
            file_options={
                "content-type": image.content_type or "image/jpeg",
                "upsert": "true",
            },
        )
        image_url = supabase.storage.from_("build-images").get_public_url(storage_path)
    except Exception as exc:
        logger.exception("Failed to upload build image for build %s", build_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload build image: {exc}",
        ) from exc

    update_response = (
        supabase.table("builds")
        .update({"image_url": image_url})
        .eq("user_id", user["id"])
        .eq("id", build_id)
        .execute()
    )

    if not update_response.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update build image",
        )

    return {"image_url": image_url}
