from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from supabase import Client

from app.config import Settings, get_settings
from app.db.supabase_client import get_supabase_service_client

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError as exc:
        raise _unauthorized() from exc

    user_id = payload.get("sub")
    if not user_id:
        raise _unauthorized()

    return {
        "id": user_id,
        "email": payload.get("email"),
    }


def get_service_or_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    """
    Accepts either:
    - A Supabase user JWT (audience=authenticated)  → returns {"id": user_id, "email": ...}
    - The Supabase service-role JWT                 → returns {"id": body.user_id, "service": True}
      The caller must also pass X-User-Id header with the target user's ID.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()

    token = credentials.credentials

    # 1. Try as a regular user token
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        user_id = payload.get("sub")
        if not user_id:
            raise _unauthorized()
        return {"id": user_id, "email": payload.get("email")}
    except JWTError:
        pass

    # 2. Try as service-role token (no audience required)
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        role = payload.get("role")
        if role != "service_role":
            raise _unauthorized()

        # Require caller to supply the target user's ID via header
        user_id = request.headers.get("X-User-Id")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-User-Id header required for service-role calls",
            )
        return {"id": user_id, "service": True}
    except JWTError as exc:
        raise _unauthorized() from exc


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
