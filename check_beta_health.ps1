$ErrorActionPreference = 'Stop'
$root = 'F:\StoryMaker_beta'
$healthUrl = 'http://127.0.0.1:8021/beta-api/health'
$restartScript = Join-Path $root 'restart_beta_safe.ps1'
$logDir = Join-Path $root 'logs'
$healthLog = Join-Path $logDir 'beta-health.log'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
try {
    $response = Invoke-WebRequest -UseBasicParsing $healthUrl -TimeoutSec 8
    if ([int]$response.StatusCode -eq 200) {
        Add-Content -LiteralPath $healthLog -Value "$(Get-Date -Format s) health=200"
        exit 0
    }
    throw "Unexpected HTTP status $($response.StatusCode)"
} catch {
    Add-Content -LiteralPath $healthLog -Value "$(Get-Date -Format s) health failed: $($_.Exception.Message)"
    if (-not (Test-Path -LiteralPath $restartScript)) {
        Add-Content -LiteralPath $healthLog -Value "$(Get-Date -Format s) restart script missing: $restartScript"
        exit 2
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $restartScript
    Start-Sleep -Seconds 6
    try {
        $retry = Invoke-WebRequest -UseBasicParsing $healthUrl -TimeoutSec 8
        Add-Content -LiteralPath $healthLog -Value "$(Get-Date -Format s) recovery health=$($retry.StatusCode)"
        if ([int]$retry.StatusCode -eq 200) { exit 0 }
    } catch {
        Add-Content -LiteralPath $healthLog -Value "$(Get-Date -Format s) recovery failed: $($_.Exception.Message)"
    }
    exit 3
}
