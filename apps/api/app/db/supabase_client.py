from functools import lru_cache

from supabase import Client, create_client

from app.config import Settings


@lru_cache
def _create_supabase_service_client(
    supabase_url: str,
    supabase_service_role_key: str,
) -> Client:
    return create_client(supabase_url, supabase_service_role_key)


def get_supabase_service_client(settings: Settings) -> Client:
    return _create_supabase_service_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )
