import asyncio
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
    GeneratePartsRequest,
    GeneratePartsResponse,
    GenerateResponse,
    PartResponse,
)
from app.services.vision_service import analyse_car_image
from app.services.parts_generator import generate_parts_for_build
from app.services.ai_client import AIClientError

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


def _insert_parts(
    supabase: Any,
    build_id: str,
    parts: list[dict[str, Any]],
) -> int:
    """Delete existing AI parts and insert new ones. Returns count inserted."""
    if not parts:
        return 0

    # Remove previously generated parts before re-populating
    supabase.table("parts").delete().eq("build_id", build_id).execute()

    rows = [{**p, "build_id": build_id} for p in parts]
    supabase.table("parts").insert(rows).execute()
    return len(rows)


async def _vision_analyse_and_populate(
    build_id: str,
    image_bytes: bytes,
    mime_type: str,
    access_token: str,
) -> None:
    """
    Background task: run vision analysis on the uploaded image, persist
    vision_data to the build, then populate the parts table.
    """
    logger.info("Starting vision analysis for build %s (image size: %d bytes, mime: %s)", build_id, len(image_bytes), mime_type)
    try:
        supabase = get_supabase(access_token)

        build_row = (
            supabase.table("builds")
            .select("goals, modification_goal, donor_car")
            .eq("id", build_id)
            .single()
            .execute()
        )
        if not build_row.data:
            logger.warning("Vision background task: build %s not found", build_id)
            return

        build_data = cast(dict[str, Any], build_row.data)
        goals: list[str] = build_data.get("goals") or []

        vision_result = await analyse_car_image(
            image_bytes,
            mime_type=mime_type,
            goals=goals,
            modification_goal=build_data.get("modification_goal"),
        )
        logger.info("analyse_car_image completed for build %s, extracted parts", build_id)

        # Separate parts from vision metadata before storing
        suggested_parts = vision_result.pop("suggested_parts", [])

        # Store vision metadata on the build
        supabase.table("builds").update({"vision_data": vision_result}).eq("id", build_id).execute()

        # Populate parts table
        count = _insert_parts(supabase, build_id, suggested_parts)
        logger.info("Vision analysis complete for build %s — %d parts inserted", build_id, count)

    except Exception as exc:
        logger.exception("Vision background task failed for build %s: %s", build_id, exc)


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

    # Kick off vision analysis asynchronously — does not block the response
    asyncio.create_task(
        _vision_analyse_and_populate(
            build_id,
            image_bytes,
            image.content_type or "image/jpeg",
            user["access_token"],
        )
    )
    logger.info("Vision analysis task queued for build %s", build_id)

    return {"image_url": image_url}


# ── POST /v1/builds/{id}/generate ────────────────────────────────────────────
@router.post("/{build_id}/generate", response_model=GenerateResponse)
async def generate_parts(
    build_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Generate (or regenerate) the parts list for a build using Claude.
    Uses the build's goals, car, and modification_goal as context.
    Any previously generated parts are replaced.
    """
    supabase = get_supabase(user["access_token"])

    build_row = (
        supabase.table("builds")
        .select("*, parts(*)")
        .eq("user_id", user["id"])
        .eq("id", build_id)
        .single()
        .execute()
    )

    if not build_row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Build not found")

    build_data = cast(dict[str, Any], build_row.data)
    goals: list[str] = build_data.get("goals") or []

    if not goals:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Build must have at least one goal before generating a parts list",
        )

    try:
        suggested_parts = await generate_parts_for_build(
            car=build_data.get("donor_car"),
            modification_goal=build_data.get("modification_goal"),
            goals=goals,
        )
    except Exception as exc:
        logger.exception("Parts generation failed for build %s", build_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Parts generation failed",
        ) from exc

    count = _insert_parts(supabase, build_id, suggested_parts)

    # Return the updated build with freshly inserted parts
    fresh = (
        supabase.table("builds")
        .select("*, parts(*)")
        .eq("id", build_id)
        .single()
        .execute()
    )

    return {
        "parts_created": count,
        "build": with_parts_detail(cast(dict[str, Any], fresh.data)),
    }


# ── POST /v1/builds/{id}/parts/generate ──────────────────────────────────────
@router.post("/{build_id}/parts/generate", response_model=GeneratePartsResponse)
async def generate_parts_for_build_new(
    build_id: str,
    payload: GeneratePartsRequest,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Generate parts for a build with force_regenerate option.
    If parts already exist and force_regenerate=False, returns existing parts.
    If force_regenerate=True or no parts exist, generates new parts.
    """
    supabase = get_supabase(user["access_token"])

    # Verify build ownership and get build data
    build_row = (
        supabase.table("builds")
        .select("*, parts(*)")
        .eq("user_id", user["id"])
        .eq("id", build_id)
        .single()
        .execute()
    )

    if not build_row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Build not found")

    build_data = cast(dict[str, Any], build_row.data)
    existing_parts = cast(list[dict[str, Any]], build_data.get("parts", []) or [])

    # If parts exist and not forcing regenerate, return them
    if existing_parts and not payload.force_regenerate:
        estimated_total = sum(float(p.get("price_estimate") or 0) for p in existing_parts)
        safety_critical_count = sum(1 for p in existing_parts if p.get("is_safety_critical"))
        return {
            "build_id": build_id,
            "parts": existing_parts,
            "total_parts": len(existing_parts),
            "estimated_total": estimated_total,
            "safety_critical_count": safety_critical_count,
            "message": f"Loaded {len(existing_parts)} existing parts.",
        }

    # Generate new parts
    goals: list[str] = build_data.get("goals") or []
    if not goals:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Build must have at least one goal before generating a parts list",
        )

    try:
        # Extract specific_requirements from modification_goal if present
        modification_goal = build_data.get("modification_goal", "")
        specific_requirements = None
        if " — Specifically: " in modification_goal:
            base_goal, specific = modification_goal.split(" — Specifically: ", 1)
            specific_requirements = specific
            modification_goal = base_goal

        result = await generate_parts_for_build(
            {
                "car": build_data.get("donor_car"),
                "modification_goal": modification_goal,
                "goals": goals,
            },
            specific_requirements=specific_requirements,
        )
        parts_to_insert = result.get("parts", [])

        # Normalize categories and status to lowercase
        allowed_statuses = {"needed", "ordered", "sourced", "installed"}
        for part in parts_to_insert:
            if part.get("category"):
                part["category"] = part["category"].lower()
            if part.get("status"):
                status_lower = part["status"].lower()
                # Map common variations to allowed status values
                if status_lower not in allowed_statuses:
                    # Default to 'needed' if not a valid status
                    part["status"] = "needed"
                else:
                    part["status"] = status_lower
            else:
                part["status"] = "needed"
    except AIClientError as exc:
        logger.error("Parts generation AI error: %s", exc.message)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Parts generation failed — please try again",
        ) from exc
    except Exception as exc:
        logger.exception("Parts generation failed for build %s", build_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Parts generation failed — please try again",
        ) from exc

    # Insert parts into database
    _insert_parts(supabase, build_id, parts_to_insert)

    # Fetch updated parts with all fields
    fresh = (
        supabase.table("builds")
        .select("*, parts(*)")
        .eq("id", build_id)
        .single()
        .execute()
    )

    fresh_data = cast(dict[str, Any], fresh.data)
    parts = cast(list[dict[str, Any]], fresh_data.get("parts", []) or [])
    estimated_total = sum(float(p.get("price_estimate") or 0) for p in parts)
    safety_critical_count = sum(1 for p in parts if p.get("is_safety_critical"))
    message = result.get("summary", {}).get("message", f"Generated {len(parts)} parts.")

    return {
        "build_id": build_id,
        "parts": parts,
        "total_parts": len(parts),
        "estimated_total": estimated_total,
        "safety_critical_count": safety_critical_count,
        "message": message,
    }


# ── PATCH /v1/builds/{id}/parts/{part_id} ────────────────────────────────────
@router.patch("/{build_id}/parts/{part_id}", response_model=PartResponse)
async def update_part(
    build_id: str,
    part_id: str,
    payload: dict[str, Any],
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Update a single part's status, notes, or vendor info.
    Verifies the user owns the build that contains this part.
    """
    supabase = get_supabase(user["access_token"])

    # Verify build ownership
    build_check = (
        supabase.table("builds")
        .select("id")
        .eq("user_id", user["id"])
        .eq("id", build_id)
        .single()
        .execute()
    )

    if not build_check.data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    # Get the part and verify it belongs to this build
    part_check = (
        supabase.table("parts")
        .select("id")
        .eq("id", part_id)
        .eq("build_id", build_id)
        .single()
        .execute()
    )

    if not part_check.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Part not found")

    # Build update dict from allowed fields
    update_data: dict[str, Any] = {}
    for key in ("status", "notes", "vendor_url", "vendor_name"):
        if key in payload:
            update_data[key] = payload[key]

    if not update_data:
        # No updates requested, return existing part
        part = supabase.table("parts").select("*").eq("id", part_id).single().execute()
        return cast(dict[str, Any], part.data)

    # Update the part
    result = (
        supabase.table("parts")
        .update(update_data)
        .eq("id", part_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update part",
        )

    return cast(dict[str, Any], result.data[0])
