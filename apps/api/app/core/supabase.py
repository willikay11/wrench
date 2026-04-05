from supabase import Client, create_client

from app.core.config import settings


def get_supabase(access_token: str | None = None) -> Client:
    api_key = access_token or settings.supabase_service_role_key
    client = create_client(settings.supabase_url, api_key)

    if access_token:
        client.postgrest.auth(access_token)

    return client
