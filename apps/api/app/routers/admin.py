from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.deps import get_current_user, get_service_or_user, get_supabase_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


class TriggerBody(BaseModel):
    user_id: str | None = None


class ScoreOneBody(BaseModel):
    job_id: str


@router.post("/scout/trigger")
def trigger_scout(
    body: TriggerBody,
    user: Annotated[dict[str, Any], Depends(get_service_or_user)],
):
    from app.worker.tasks.scout import scout_for_user

    target = body.user_id or user["id"]
    task = scout_for_user.delay(target)
    return {"task_id": task.id, "user_id": target}


@router.post("/score_one")
def score_one(
    body: ScoreOneBody,
    user: Annotated[dict[str, Any], Depends(get_current_user)],
    supabase=Depends(get_supabase_admin),
):
    from app.services.ai.job_scorer import score_job
    from app.worker.tasks.scoring import fetch_job, fetch_preferences, fetch_profile

    profile = fetch_profile(supabase, user["id"])
    preferences = fetch_preferences(supabase, user["id"])
    job = fetch_job(supabase, body.job_id)

    if not job:
        return {"error": "job not found"}

    result = score_job(profile or {}, preferences or {}, job)
    return result
