import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import admin, applications, health, profiles, resumes

settings = get_settings()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="JobScout API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(resumes.router)
app.include_router(profiles.router)
app.include_router(admin.router)
app.include_router(applications.router)


@app.on_event("startup")
async def startup() -> None:
    logger.info("JobScout API ready")
