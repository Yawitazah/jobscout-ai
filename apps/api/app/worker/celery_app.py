import os

from celery import Celery
from celery.schedules import crontab

celery_app = Celery(
    "jobscout",
    broker=os.environ["REDIS_URL"],
    backend=os.environ["REDIS_URL"],
    include=[
        "app.worker.tasks.scout",
        "app.worker.tasks.scoring",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,
    task_soft_time_limit=540,
    worker_max_tasks_per_child=100,
    beat_schedule={
        "scout-all-users-morning": {
            "task": "app.worker.tasks.scout.scout_all_users",
            "schedule": crontab(hour=11, minute=0),  # 6am ET
        },
        "scout-all-users-afternoon": {
            "task": "app.worker.tasks.scout.scout_all_users",
            "schedule": crontab(hour=20, minute=0),  # 4pm ET
        },
    },
)
