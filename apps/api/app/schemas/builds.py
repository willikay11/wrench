# apps/api/app/schemas/builds.py
from datetime import datetime
from typing import Any, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class VisionExtracted(BaseModel):
    """Extracted data from vision analysis."""
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[str] = None
    confidence: Optional[int] = None
    part_name: Optional[str] = None
    specifications: Optional[dict[str, Any]] = None
    mods_detected: list[str] = []
    notes: Optional[str] = None


class VisionData(BaseModel):
    """Vision analysis result for an uploaded image."""
    image_type: str  # "car" | "rims" | "engine_bay" | "suspension" | "inspiration" | "part" | "unknown"
    summary: str
    extracted: VisionExtracted


class BuildCreate(BaseModel):
    """Shape of data the client sends when creating a build."""

    model_config = ConfigDict(populate_by_name=True)

    title: str
    car: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("car", "donor_car"),
    )
    modification_goal: Optional[str] = None
    goals: list[str] = Field(default_factory=list)


class BuildUpdate(BaseModel):
    """Shape of data the client sends when partially updating a build."""

    model_config = ConfigDict(populate_by_name=True)

    title: Optional[str] = None
    car: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("car", "donor_car"),
    )
    modification_goal: Optional[str] = None
    goals: Optional[list[str]] = None
    status: Optional[str] = None


class BuildResponse(BaseModel):
    """Shape of data returned to the client for list/create/update responses."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    user_id: str
    title: str
    car: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("car", "donor_car"),
    )
    modification_goal: Optional[str] = None
    goals: list[str] = []
    image_url: Optional[str] = None
    status: str
    is_public: bool
    created_at: datetime
    updated_at: datetime
    parts_total: int = 0
    parts_sourced: int = 0
    vision_data: Optional[VisionData] = None


class PartVendorResponse(BaseModel):
    """Shape of a vendor option for a part."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    part_id: str
    vendor_name: str
    vendor_url: Optional[str] = None
    price: Optional[float] = None
    currency: str = "USD"
    ships_from: Optional[str] = None
    estimated_days_min: Optional[int] = None
    estimated_days_max: Optional[int] = None
    shipping_cost: Optional[float] = None
    is_primary: bool = False
    created_at: datetime


class PartVendorCreate(BaseModel):
    """Schema for creating a vendor option for a part."""

    model_config = ConfigDict(populate_by_name=True)

    vendor_name: str
    vendor_url: Optional[str] = None
    price: Optional[float] = None
    currency: str = "USD"
    ships_from: Optional[str] = None
    estimated_days_min: Optional[int] = None
    estimated_days_max: Optional[int] = None
    shipping_cost: Optional[float] = None
    is_primary: bool = False


class PartResponse(BaseModel):
    """Shape of a single part returned inside BuildDetailResponse."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    build_id: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    status: str
    price_estimate: Optional[float] = None
    vendor_url: Optional[str] = None
    image_url: Optional[str] = None
    is_safety_critical: bool = False
    notes: Optional[str] = None
    goal: Optional[str] = None
    vendors: list[PartVendorResponse] = []
    ordered_from_vendor_id: Optional[str] = None
    ordered_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class BuildDetailResponse(BaseModel):
    """Full build detail including all part data."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    user_id: str
    title: str
    car: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("car", "donor_car"),
    )
    modification_goal: Optional[str] = None
    goals: list[str] = []
    image_url: Optional[str] = None
    status: str
    is_public: bool
    created_at: datetime
    updated_at: datetime
    parts: list[PartResponse] = []
    parts_total: int = 0
    parts_sourced: int = 0
    vision_data: Optional[VisionData] = None


class BuildImageResponse(BaseModel):
    """Shape of data returned to the client after uploading a build image."""
    image_url: str


class GenerateResponse(BaseModel):
    """Returned after a parts generation request."""
    parts_created: int
    build: BuildDetailResponse


class GeneratePartsRequest(BaseModel):
    """Request to generate parts for a build."""
    force_regenerate: bool = False


class GeneratePartsResponse(BaseModel):
    """Response after generating parts for a build."""
    build_id: str
    parts: list[PartResponse]
    total_parts: int
    estimated_total: float
    safety_critical_count: int
    message: str


class OrderPartRequest(BaseModel):
    """Request to order a part from a specific vendor."""
    vendor_id: str
