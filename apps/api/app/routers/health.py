from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.deps import get_current_user

router = APIRouter()


@router.get("/health")
def health(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, str]:
    return {"status": "ok", "env": settings.environment}


@router.get("/me")
def me(
    current_user: Annotated[dict[str, Any], Depends(get_current_user)],
) -> dict[str, Any]:
    return current_user
