from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import builds, parts, advisor, vision

app = FastAPI(
    title="Wrench API",
    version="0.1.0",
    docs_url="/docs" if settings.environment == "development" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(builds.router, prefix="/v1/builds", tags=["builds"])
app.include_router(parts.router, prefix="/v1/builds/{build_id}/parts", tags=["parts"])
app.include_router(advisor.router, prefix="/v1/builds/{build_id}/conversation", tags=["advisor"])
app.include_router(vision.router, prefix="/v1/vision", tags=["vision"])


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}
