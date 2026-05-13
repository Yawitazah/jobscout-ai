@echo off
:: JobScout AI — Local Browser Agent
:: This file is auto-run on Windows login via Task Scheduler.
:: Set your values in apps\api\.env before installing the service.

cd /d "%~dp0"

:: Load .env file if it exists
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        if not "%%a"=="" if not "%%b"=="" (
            set "%%a=%%b"
        )
    )
)

:: Activate virtual environment
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
) else if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
)

:: Run the agent — restart automatically if it crashes
:loop
echo [%DATE% %TIME%] Starting JobScout AI Local Agent...
python -m app.agent.local_runner
echo [%DATE% %TIME%] Agent exited (code %ERRORLEVEL%) — restarting in 10s...
timeout /t 10 /nobreak > nul
goto loop
