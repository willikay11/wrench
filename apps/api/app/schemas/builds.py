# apps/api/app/schemas/builds.py
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class BuildCreate(BaseModel):
    """Shape of data the client sends when creating a build."""
    title: str
    donor_car: Optional[str] = None
    engine_swap: Optional[str] = None
    goals: list[str] = []


class BuildResponse(BaseModel):
    """Shape of data returned to the client."""
    id: str
    user_id: str
    title: str
    donor_car: Optional[str] = None
    engine_swap: Optional[str] = None
    goals: list[str] = []
    image_url: Optional[str] = None
    status: str
    is_public: bool
    created_at: datetime
    updated_at: datetime