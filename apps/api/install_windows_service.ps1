# JobScout AI — Windows Auto-Start Installer
# Run this once from an Administrator PowerShell to register the local
# agent as a Task Scheduler job that starts automatically when you log in.
#
# Usage:
#   cd apps\api
#   .\install_windows_service.ps1
#
# To uninstall:
#   Unregister-ScheduledTask -TaskName "JobScout-LocalAgent" -Confirm:$false

$TaskName  = "JobScout-LocalAgent"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BatFile   = Join-Path $ScriptDir "local_agent.bat"

# Verify the bat file exists
if (-not (Test-Path $BatFile)) {
    Write-Error "Could not find local_agent.bat at: $BatFile"
    exit 1
}

# Verify .env exists and has the required vars
$EnvFile = Join-Path $ScriptDir ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Warning ".env file not found at $EnvFile"
    Write-Warning "Create it with: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, AGENT_USER_ID"
    exit 1
}

$required = @("SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","ANTHROPIC_API_KEY","AGENT_USER_ID")
$envContent = Get-Content $EnvFile
foreach ($key in $required) {
    if (-not ($envContent -match "^$key=.+")) {
        Write-Warning "Missing required .env key: $key"
    }
}

Write-Host "Installing Task Scheduler job: $TaskName" -ForegroundColor Cyan
Write-Host "  Script : $BatFile"
Write-Host "  Trigger: At log on (current user)"

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "  Removed existing task."
}

# Build the task
$Action  = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$BatFile`"" `
    -WorkingDirectory $ScriptDir

$Trigger = New-ScheduledTaskTrigger -AtLogOn

$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Days 365) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host ""
Write-Host "Done! The JobScout AI local agent will start automatically on login." -ForegroundColor Green
Write-Host ""
Write-Host "To start it right now without restarting:" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "To check if it's running:"
Write-Host "  Get-ScheduledTask -TaskName '$TaskName' | Select-Object State"
Write-Host ""
Write-Host "To view logs, open Task Scheduler > Task Scheduler Library > $TaskName"
Write-Host "Or tail the agent output by running local_agent.bat directly in a terminal."
