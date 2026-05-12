from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
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
