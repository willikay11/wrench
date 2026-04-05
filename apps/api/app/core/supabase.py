from supabase import Client, create_client

from app.core.config import settings


def _resolve_supabase_api_key(access_token: str | None = None) -> str:
    service_role_key = settings.supabase_service_role_key.strip()
    anon_key = (settings.supabase_anon_key or "").strip()

    if service_role_key and service_role_key != "your-service-role-key":
        return service_role_key

    if anon_key:
        return anon_key

    if access_token:
        return access_token

    return service_role_key


def get_supabase(access_token: str | None = None) -> Client:
    api_key = _resolve_supabase_api_key(access_token)
    client = create_client(settings.supabase_url, api_key)

    if access_token:
        client.postgrest.auth(access_token)
        if api_key != access_token:
            client.storage._headers["authorization"] = f"Bearer {access_token}"

    return client
