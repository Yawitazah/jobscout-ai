@echo off
setlocal

REM ============================================================================
REM Start Chrome with --remote-debugging-port for the JobScout agent to attach.
REM
REM This Chrome window uses a DEDICATED profile (JobScoutChromeProfile), so it
REM doesn't fight with your normal Chrome. You can keep your normal Chrome open
REM in parallel.
REM
REM First time you run this:
REM   1. The window opens to a blank Chrome with no logins.
REM   2. Manually log in to LinkedIn, Indeed, or any other site the agent needs.
REM   3. Cookies persist - next runs you skip the login.
REM
REM Leave the Chrome window open while the agent runs. The agent opens NEW tabs
REM in it for each application; tabs are left open after fill so you can review
REM and complete manually.
REM ============================================================================

set "CHROME_PROFILE=%LOCALAPPDATA%\JobScoutChromeProfile"
set "DEBUG_PORT=9222"
set "CHROME_EXE="

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if not defined CHROME_EXE (
  echo Could not find chrome.exe in the usual install locations.
  echo Set CHROME_EXE manually in this batch file and try again.
  exit /b 1
)

echo Starting Chrome with remote debugging on port %DEBUG_PORT% ...
echo Profile: %CHROME_PROFILE%
echo.
echo Leave this Chrome window open. The agent will attach when you run it.

start "" "%CHROME_EXE%" --remote-debugging-port=%DEBUG_PORT% --user-data-dir="%CHROME_PROFILE%" --no-first-run --no-default-browser-check --disable-blink-features=AutomationControlled

endlocal
