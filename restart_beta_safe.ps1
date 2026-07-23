$ErrorActionPreference = 'Stop'

$root = 'F:\StoryMaker_beta'
$python = Join-Path $root '.venv\Scripts\python.exe'
$logDir = Join-Path $root 'logs'
$supervisorLog = Join-Path $logDir 'beta-restart.log'
$stdout = Join-Path $logDir 'beta-8021.stdout.log'
$stderr = Join-Path $logDir 'beta-8021.stderr.log'
$healthUrl = 'http://127.0.0.1:8021/beta-api/health'
$probePort = 8022
$probeUrl = "http://127.0.0.1:$probePort/beta-api/health"

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-SupervisorLog([string]$message) {
    Add-Content -LiteralPath $supervisorLog -Value "$(Get-Date -Format s) $message"
}

function Test-Health([string]$url, [int]$timeoutSeconds = 5) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing $url -TimeoutSec $timeoutSeconds
        return ([int]$response.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Stop-PortListener([int]$port) {
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($listener in @($listeners)) {
        if ($listener.OwningProcess -gt 0) {
            Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop
            Write-SupervisorLog "stopped listener port=$port pid=$($listener.OwningProcess)"
        }
    }
}

Write-SupervisorLog 'safe restart requested'

if (-not (Test-Path -LiteralPath $python)) {
    Write-SupervisorLog "aborted: python missing path=$python"
    exit 2
}

& $python -c "import uvicorn; import app.main; print('PRECHECK_OK')" | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-SupervisorLog 'aborted: uvicorn or app.main import failed'
    exit 3
}
Write-SupervisorLog 'precheck import passed'

Stop-PortListener $probePort
$probeOut = Join-Path $logDir 'beta-8022-probe.stdout.log'
$probeErr = Join-Path $logDir 'beta-8022-probe.stderr.log'
$probe = Start-Process -FilePath $python `
    -ArgumentList @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port',"$probePort") `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $probeOut `
    -RedirectStandardError $probeErr `
    -PassThru

$probeReady = $false
for ($index = 0; $index -lt 12; $index++) {
    Start-Sleep -Milliseconds 500
    if (Test-Health $probeUrl 2) {
        $probeReady = $true
        break
    }
    if ($probe.HasExited) { break }
}

if (-not $probe.HasExited) {
    Stop-Process -Id $probe.Id -Force -ErrorAction SilentlyContinue
}
if (-not $probeReady) {
    Write-SupervisorLog 'aborted: probe server on 8022 failed; existing 8021 preserved'
    exit 4
}
Write-SupervisorLog 'probe server on 8022 passed'

Stop-PortListener 8021
Start-Sleep -Milliseconds 700

$server = Start-Process -FilePath $python `
    -ArgumentList @('-m','uvicorn','app.main:app','--host','0.0.0.0','--port','8021') `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru

$ready = $false
for ($index = 0; $index -lt 20; $index++) {
    Start-Sleep -Milliseconds 500
    if (Test-Health $healthUrl 3) {
        $ready = $true
        break
    }
    if ($server.HasExited) { break }
}

if (-not $ready) {
    Write-SupervisorLog "restart failed pid=$($server.Id)"
    exit 5
}

Write-SupervisorLog "restart succeeded pid=$($server.Id) health=200"
exit 0
