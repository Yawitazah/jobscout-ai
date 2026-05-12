JobScout API
============

FastAPI service for JobScout AI.

Local setup
-----------

```powershell
cd apps/api
uv sync
uv run uvicorn app.main:app --reload
```

Health check:

```powershell
curl http://localhost:8000/health
```

Environment
-----------

Copy `.env.example` to `.env` and fill in the Supabase values:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `ANTHROPIC_API_KEY`
- `WEB_ORIGIN`
- `ENVIRONMENT`
