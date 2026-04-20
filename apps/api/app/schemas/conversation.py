from typing import Optional

from pydantic import BaseModel


class ConversationMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ConversationRequest(BaseModel):
    message: str
    history: list[ConversationMessage] = []
    session_id: Optional[str] = None


class ExtractedContext(BaseModel):
    car: Optional[str] = None
    goal: Optional[str] = None
    use_case: Optional[str] = None


class ConversationResponse(BaseModel):
    reply: str
    state: str  # "gathering" | "confirming" | "ready"
    extracted: ExtractedContext
    session_id: str
