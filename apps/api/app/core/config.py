from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:3000"]

    # Supabase
    supabase_url: str
    supabase_service_role_key: str = Field(
        validation_alias=AliasChoices(
            "SUPABASE_SERVICE_ROLE_KEY",
            "SERVICE_ROLE_KEY",
        ),
    )
    supabase_anon_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "SUPABASE_ANON_KEY",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY",
            "ANON_KEY",
            "PUBLISHABLE_KEY",
        ),
    )

    # Conversation AI (text only — use fast/free provider)
    ai_provider: str = "groq"  # "gemini" | "claude" | "groq"
    ai_model: str = "llama-3.3-70b-versatile"

    # Vision AI (image analysis — must support vision)
    vision_provider: str = "openrouter"  # "openrouter" | "gemini" | "claude"
    vision_model: str = "qwen/qwen2.5-vl-72b-instruct:free"
    vision_fallback_provider: str = "gemini"  # Fallback if primary fails

    # OpenRouter (supports both text and vision)
    openrouter_api_key: str = ""
    openrouter_api_base: str = "https://openrouter.ai/api/v1"
    openrouter_vision_model: str = "meta-llama/llama-4-scout:free"
    openrouter_text_model: str = "meta-llama/llama-3.3-70b-instruct:free"

    # API Keys (optional — only needed if using those providers)
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    groq_api_key: str = ""

    # Internal auth (shared secret between web and api)
    internal_api_secret: str


settings = Settings()  # type: ignore[call-arg]
