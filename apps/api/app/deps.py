from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from app.config import Settings, get_settings
from app.db.supabase_client import get_supabase_service_client

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    """
    Validate a Supabase user JWT by calling Supabase's own auth API.
    This avoids needing SUPABASE_JWT_SECRET and handles key rotation automatically.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()

    token = credentials.credentials
    supabase = get_supabase_service_client(settings)

    try:
        response = supabase.auth.get_user(token)
        user = response.user
        if not user:
            raise _unauthorized()
        return {"id": user.id, "email": user.email}
    except HTTPException:
        raise
    except Exception as exc:
        raise _unauthorized() from exc


def get_service_or_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    """
    Accepts either:
    - A Supabase user JWT  → validates via auth.get_user(), returns {"id": ..., "email": ...}
    - The service-role key → bypasses user auth for internal server-to-server calls.
      Caller must also pass X-User-Id header with the target user UUID.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()

    token = credentials.credentials

    # Service-role key: direct string match — no JWT decode needed
    if token == settings.supabase_service_role_key:
        user_id = request.headers.get("X-User-Id")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-User-Id header required for service-role calls",
            )
        return {"id": user_id, "service": True}

    # Regular user JWT — delegate to Supabase
    return get_current_user(credentials, settings)


def get_supabase_admin(
    settings: Annotated[Settings, Depends(get_settings)],
) -> Client:
    return get_supabase_service_client(settings)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing authentication token",
        headers={"WWW-Authenticate": "Bearer"},
    )
