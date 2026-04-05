# apps/api/app/schemas/builds.py
from datetime import datetime
from typing import Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class BuildCreate(BaseModel):
    """Shape of data the client sends when creating a build."""

    model_config = ConfigDict(populate_by_name=True)

    title: str
    car: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("car", "donor_car"),
    )
    engine_swap: Optional[str] = None
    goals: list[str] = Field(default_factory=list)


class BuildResponse(BaseModel):
    """Shape of data returned to the client."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    user_id: str
    title: str
    car: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("car", "donor_car"),
    )
    engine_swap: Optional[str] = None
    goals: list[str] = Field(default_factory=list)
    image_url: Optional[str] = None
    status: str
    is_public: bool
    created_at: datetime
    updated_at: datetime
    parts_total: int = 0
    parts_sourced: int = 0

class BuildImageResponse(BaseModel):
    """Shape of data returned to the client after uploading a build image."""
    image_url: str