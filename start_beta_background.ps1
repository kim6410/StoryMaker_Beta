$ErrorActionPreference = 'Stop'
$root = 'F:\StoryMaker_beta'
$python = Join-Path $root '.venv\Scripts\python.exe'
$logDir = Join-Path $root 'logs'
$stdout = Join-Path $logDir 'beta-8021.stdout.log'
$stderr = Join-Path $logDir 'beta-8021.stderr.log'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$listener = Get-NetTCPConnection -LocalPort 8021 -State Listen -ErrorAction SilentlyContinue
if ($listener) { exit 0 }
if (-not (Test-Path -LiteralPath $python)) {
    Add-Content -LiteralPath $stderr -Value "$(Get-Date -Format s) python missing: $python"
    exit 2
}
Start-Process -FilePath $python `
    -ArgumentList @('-m','uvicorn','app.main:app','--host','0.0.0.0','--port','8021') `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr
Start-Sleep -Seconds 4
try {
    $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8021/beta-api/health' -TimeoutSec 8
    Add-Content -LiteralPath $stdout -Value "$(Get-Date -Format s) startup health $($r.StatusCode)"
} catch {
    Add-Content -LiteralPath $stderr -Value "$(Get-Date -Format s) startup health failed: $($_.Exception.Message)"
    exit 3
}
