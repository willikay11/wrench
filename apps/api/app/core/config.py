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

    # Anthropic
    anthropic_api_key: str

    # Internal auth (shared secret between web and api)
    internal_api_secret: str


settings = Settings()  # type: ignore[call-arg]
