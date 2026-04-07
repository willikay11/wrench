import logging
from typing import Any, cast

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.dependencies import CurrentUser, get_current_user
from app.core.supabase import get_supabase
from app.schemas.builds import (
    BuildCreate,
    BuildDetailResponse,
    BuildImageResponse,
    BuildResponse,
    BuildUpdate,
)

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


def with_parts_detail(build: dict[str, Any]) -> dict[str, Any]:
    """Keep full parts list in the dict and compute counts."""
    build_data = dict(build)
    parts = cast(list[dict[str, Any]], build_data.get("parts", []) or [])
    build_data["parts_total"] = len(parts)
    build_data["parts_sourced"] = sum(
        1 for p in parts if p.get("status") in ("sourced", "installed")
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
            "modification_goal": payload.modification_goal,
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
@router.get("/{build_id}", response_model=BuildDetailResponse)
async def get_build(build_id: str, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """
    Returns a single build with full part data, but only if it belongs to
    the authenticated user.
    """
    supabase = get_supabase(user["access_token"])

    response = (
        supabase.table("builds")
        .select("*, parts(*)")
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

    return with_parts_detail(cast(dict[str, Any], response.data))


# ── PUT /v1/builds/{id} ────────────────────────────────────────────────────────
@router.put("/{build_id}", response_model=BuildResponse)
async def update_build(
    build_id: str,
    payload: BuildCreate,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Full replacement update of a build. All fields from BuildCreate are required.
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

    response = (
        supabase.table("builds")
        .update({
            "title": payload.title,
            "donor_car": payload.car,
            "modification_goal": payload.modification_goal,
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


# ── PATCH /v1/builds/{id} ────────────────────────────────────────────────────────
@router.patch("/{build_id}", response_model=BuildDetailResponse)
async def patch_build(
    build_id: str,
    payload: BuildUpdate,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Partial update — only fields present in the request body are changed.
    Returns the full BuildDetailResponse with parts.
    """
    supabase = get_supabase(user["access_token"])

    existing = (
        supabase.table("builds")
        .select("id, user_id")
        .eq("id", build_id)
        .single()
        .execute()
    )

    if not existing.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Build not found",
        )

    existing_data = cast(dict[str, Any], existing.data)

    if existing_data["user_id"] != user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
        )

    update_data: dict[str, Any] = {}
    if payload.title is not None:
        update_data["title"] = payload.title
    if payload.car is not None:
        update_data["donor_car"] = payload.car
    if payload.modification_goal is not None:
        update_data["modification_goal"] = payload.modification_goal
    if payload.goals is not None:
        update_data["goals"] = payload.goals
    if payload.status is not None:
        update_data["status"] = payload.status

    if update_data:
        supabase.table("builds").update(update_data).eq("id", build_id).execute()

    fresh = (
        supabase.table("builds")
        .select("*, parts(*)")
        .eq("id", build_id)
        .single()
        .execute()
    )

    return with_parts_detail(cast(dict[str, Any], fresh.data))


# ── DELETE /v1/builds/{id} ────────────────────────────────────────────────────────
@router.delete("/{build_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_build(build_id: str, user: CurrentUser = Depends(get_current_user)) -> None:
    """
    Deletes a build by ID, but only if it belongs to the authenticated user.
    This also cascades to delete related parts and conversations via RLS policies.
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
