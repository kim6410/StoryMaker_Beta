# StoryMaker Beta snapshot restore
# Restores a verified PASS snapshot to F:\StoryMaker_beta.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$LiveRoot = 'F:\StoryMaker_beta'
$BackupBase = 'F:\v1_backup\V1_BETA0724'
$TimeStamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$SafetyRoot = Join-Path $BackupBase "PRE_RESTORE_$TimeStamp"
$TempScriptRoot = Split-Path -Parent $PSCommandPath
$RestoreLog = Join-Path $BackupBase "RESTORE_$TimeStamp.log"
$TaskState = @()

function Write-Log {
    param([string]$Message, [ValidateSet('INFO','OK','WARN','ERROR')][string]$Level = 'INFO')
    $line = '[{0}] [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    $line | Tee-Object -FilePath $RestoreLog -Append
}

function Pause-End {
    Write-Host ''
    Read-Host 'Press Enter to close'
}

function Stop-PortListener {
    param([int]$Port)
    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
        if ($listener.OwningProcess -gt 0) {
            try {
                Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop
                Write-Log "Stopped listener port=$Port pid=$($listener.OwningProcess)" 'OK'
            } catch {
                Write-Log "Unable to stop port $Port pid=$($listener.OwningProcess): $($_.Exception.Message)" 'WARN'
            }
        }
    }
}

function Get-ValidSnapshots {
    if (-not (Test-Path -LiteralPath $BackupBase -PathType Container)) { return @() }
    $items = foreach ($dir in Get-ChildItem -LiteralPath $BackupBase -Directory -Filter 'SNAPSHOT_*' -Force | Sort-Object Name -Descending) {
        $complete = Join-Path $dir.FullName 'BACKUP_COMPLETE.txt'
        $sqlite = Join-Path $dir.FullName 'RESTORE_INFO\sqlite_backup_integrity_check.txt'
        $manifest = Join-Path $dir.FullName 'SHA256_MANIFEST_BACKUP.txt'
        if (-not (Test-Path -LiteralPath $complete -PathType Leaf)) { continue }
        $statusLine = Get-Content -LiteralPath $complete -ErrorAction SilentlyContinue | Where-Object { $_ -eq 'STATUS=PASS' } | Select-Object -First 1
        $sqliteOk = (Test-Path -LiteralPath $sqlite -PathType Leaf) -and ((Get-Content -LiteralPath $sqlite -ErrorAction SilentlyContinue | Select-Object -First 1).Trim() -eq 'ok')
        if ($statusLine -and $sqliteOk -and (Test-Path -LiteralPath $manifest -PathType Leaf)) {
            [pscustomobject]@{
                Name = $dir.Name
                Path = $dir.FullName
                Created = $dir.CreationTime
                Complete = $complete
                Manifest = $manifest
            }
        }
    }
    return @($items)
}

function Verify-SnapshotManifest {
    param([string]$Snapshot, [string]$Manifest)
    Write-Log "Verifying SHA-256 manifest: $Snapshot"
    $lines = @(Get-Content -LiteralPath $Manifest -ErrorAction Stop | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($lines.Count -eq 0) { throw 'Manifest is empty.' }
    $checked = 0
    foreach ($line in $lines) {
        if ($line -notmatch '^([A-Fa-f0-9]{64}) \*(.+)$') { throw "Invalid manifest line: $line" }
        $expected = $matches[1].ToUpperInvariant()
        $relative = $matches[2]
        $file = Join-Path $Snapshot $relative
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Manifest file missing: $relative" }
        $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256 -ErrorAction Stop).Hash.ToUpperInvariant()
        if ($actual -ne $expected) { throw "SHA-256 mismatch: $relative" }
        $checked++
        if (($checked % 250) -eq 0 -or $checked -eq $lines.Count) {
            Write-Host ("  SHA-256 {0}/{1}" -f $checked, $lines.Count)
        }
    }
    Write-Log "SHA-256 verification passed. Files=$checked" 'OK'
}

function Disable-BetaScheduledTasks {
    $script:TaskState = @()
    try {
        foreach ($task in Get-ScheduledTask -ErrorAction Stop) {
            $actionText = (($task.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments) $($_.WorkingDirectory)" }) -join ' ')
            if ($task.TaskName -match 'StoryMaker.*Beta|Beta.*StoryMaker|Beta.*Supertonic' -or $actionText -match [regex]::Escape($LiveRoot)) {
                $wasEnabled = $task.State -ne 'Disabled'
                $script:TaskState += [pscustomobject]@{ TaskName=$task.TaskName; TaskPath=$task.TaskPath; WasEnabled=$wasEnabled }
                if ($wasEnabled) {
                    Disable-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -ErrorAction Stop | Out-Null
                    Write-Log "Temporarily disabled task: $($task.TaskPath)$($task.TaskName)" 'OK'
                }
            }
        }
    } catch {
        throw "Scheduled task protection failed: $($_.Exception.Message)"
    }
}

function Restore-BetaScheduledTasks {
    foreach ($item in $script:TaskState) {
        if ($item.WasEnabled) {
            try {
                Enable-ScheduledTask -TaskName $item.TaskName -TaskPath $item.TaskPath -ErrorAction Stop | Out-Null
                Write-Log "Re-enabled task: $($item.TaskPath)$($item.TaskName)" 'OK'
            } catch {
                Write-Log "Could not re-enable task $($item.TaskName): $($_.Exception.Message)" 'WARN'
            }
        }
    }
}

function Copy-SnapshotToLive {
    param([string]$Snapshot)
    New-Item -ItemType Directory -Path $LiveRoot -Force | Out-Null

    $metadataDirectories = @('RESTORE_INFO')
    foreach ($dir in Get-ChildItem -LiteralPath $Snapshot -Force -Directory) {
        if ($metadataDirectories -contains $dir.Name) { continue }
        $target = Join-Path $LiveRoot $dir.Name
        New-Item -ItemType Directory -Path $target -Force | Out-Null
        & robocopy.exe $dir.FullName $target /MIR /COPY:DAT /DCOPY:DAT /R:2 /W:1 /XJ /NP /NFL /NDL | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "Robocopy failed for directory $($dir.Name), code=$LASTEXITCODE" }
        Write-Log "Restored directory: $($dir.Name)" 'OK'
    }

    $metadataFiles = @(
        'BACKUP_COMPLETE.txt','BACKUP_LOG.txt','BACKUP_ERRORS.txt','BACKUP_WARNINGS.txt',
        'SHA256_MANIFEST_BACKUP.txt','SHA256_MANIFEST_SOURCE_CRITICAL.txt',
        'VERIFY_RESULT.txt','VERIFY_FOLDER_COUNTS.txt','RESTORE_GUIDE.md'
    )
    foreach ($file in Get-ChildItem -LiteralPath $Snapshot -Force -File) {
        if ($metadataFiles -contains $file.Name) { continue }
        Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $LiveRoot $file.Name) -Force
    }

    # Keep the current restore launcher available after rollback even if the selected snapshot predates it.
    foreach ($name in @('V1_BETA_SNAPSHOT.ps1','V1_BETA_SNAPSHOT.bat')) {
        $source = Join-Path $TempScriptRoot $name
        if (Test-Path -LiteralPath $source -PathType Leaf) {
            Copy-Item -LiteralPath $source -Destination (Join-Path $LiveRoot $name) -Force
        }
    }
}

function Test-RestoredRuntime {
    $python = Join-Path $LiveRoot '.venv\Scripts\python.exe'
    $db = Join-Path $LiveRoot 'data\storymaker_beta.db'
    if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw 'Restored Python executable is missing.' }
    if (-not (Test-Path -LiteralPath $db -PathType Leaf)) { throw 'Restored SQLite database is missing.' }

    Push-Location $LiveRoot
    try {
        $importResult = & $python -c "import fastapi,uvicorn,pydantic; import app.main; print('BETA_RUNTIME_OK')" 2>&1
        if ($LASTEXITCODE -ne 0 -or $importResult -notcontains 'BETA_RUNTIME_OK') { throw "Runtime import failed: $($importResult -join ' ')" }
        Write-Log 'Restored Beta runtime import passed' 'OK'

        $dbResult = & $python -c "import sqlite3; c=sqlite3.connect(r'$db'); print(c.execute('pragma integrity_check').fetchone()[0]); c.close()" 2>&1
        if ($LASTEXITCODE -ne 0 -or (($dbResult | Select-Object -Last 1).ToString().Trim() -ne 'ok')) { throw "SQLite integrity check failed: $($dbResult -join ' ')" }
        Write-Log 'Restored SQLite integrity_check: ok' 'OK'
    } finally {
        Pop-Location
    }
}

function Start-And-TestRuntime {
    $supertonicStart = Join-Path $LiveRoot 'start_beta_supertonic_background.ps1'
    $betaRestart = Join-Path $LiveRoot 'restart_beta_safe.ps1'
    $betaStart = Join-Path $LiveRoot 'start_beta_background.ps1'

    if (Test-Path -LiteralPath $supertonicStart -PathType Leaf) {
        & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $supertonicStart
        for ($i=0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 1
            if (Get-NetTCPConnection -LocalPort 7790 -State Listen -ErrorAction SilentlyContinue) { break }
        }
        if (-not (Get-NetTCPConnection -LocalPort 7790 -State Listen -ErrorAction SilentlyContinue)) { throw 'Supertonic port 7790 did not start.' }
        Write-Log 'Supertonic port 7790 is listening' 'OK'
    } else { throw 'Supertonic startup script is missing.' }

    if (Test-Path -LiteralPath $betaRestart -PathType Leaf) {
        & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $betaRestart
        if ($LASTEXITCODE -ne 0) { throw "Beta safe restart failed with code $LASTEXITCODE" }
    } elseif (Test-Path -LiteralPath $betaStart -PathType Leaf) {
        & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $betaStart
    } else { throw 'Beta startup script is missing.' }

    $healthy = $false
    for ($i=0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        try {
            $response = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8021/beta-api/health' -TimeoutSec 3
            if ([int]$response.StatusCode -eq 200) { $healthy = $true; break }
        } catch {}
    }
    if (-not $healthy) { throw 'Beta health check failed on port 8021.' }
    Write-Log 'Beta health check passed: HTTP 200' 'OK'
}

try {
    Write-Host '============================================================'
    Write-Host ' StoryMaker Beta Snapshot Restore'
    Write-Host '============================================================'
    Write-Log 'Snapshot restore started'

    $snapshots = @(Get-ValidSnapshots)
    if ($snapshots.Count -eq 0) { throw "No verified PASS snapshots found in $BackupBase" }

    Write-Host ''
    Write-Host 'Verified PASS snapshots:'
    for ($i=0; $i -lt $snapshots.Count; $i++) {
        Write-Host (" [{0}] {1}  ({2})" -f ($i+1), $snapshots[$i].Name, $snapshots[$i].Created.ToString('yyyy-MM-dd HH:mm:ss'))
    }
    Write-Host ' [0] Cancel'
    Write-Host ''

    $selection = Read-Host 'Select snapshot number'
    $number = 0
    if (-not [int]::TryParse($selection, [ref]$number) -or $number -lt 0 -or $number -gt $snapshots.Count) { throw 'Invalid selection.' }
    if ($number -eq 0) { Write-Log 'Restore cancelled by user' 'WARN'; exit 0 }
    $chosen = $snapshots[$number-1]

    Write-Host ''
    Write-Host "Selected: $($chosen.Path)"
    Write-Host "Current live folder will be preserved as: $SafetyRoot"
    Write-Host 'Type RESTORE to continue.'
    $confirmation = Read-Host 'Confirmation'
    if ($confirmation -cne 'RESTORE') { Write-Log 'Restore cancelled because confirmation did not match' 'WARN'; exit 0 }

    Verify-SnapshotManifest -Snapshot $chosen.Path -Manifest $chosen.Manifest
    Disable-BetaScheduledTasks

    Stop-PortListener 8022
    Stop-PortListener 8021
    Stop-PortListener 7790
    Start-Sleep -Seconds 2

    if (-not (Test-Path -LiteralPath $LiveRoot -PathType Container)) { throw "Live folder missing: $LiveRoot" }
    if (Test-Path -LiteralPath $SafetyRoot) { throw "Safety folder already exists: $SafetyRoot" }

    # The BAT launches this PS1 from a temporary folder, so the live folder can be moved atomically.
    Move-Item -LiteralPath $LiveRoot -Destination $SafetyRoot -ErrorAction Stop
    Write-Log "Current live folder preserved: $SafetyRoot" 'OK'

    try {
        Copy-SnapshotToLive -Snapshot $chosen.Path
        Test-RestoredRuntime
        Start-And-TestRuntime
        Restore-BetaScheduledTasks
    } catch {
        Write-Log "Restore failed after live folder move: $($_.Exception.Message)" 'ERROR'
        Stop-PortListener 8022
        Stop-PortListener 8021
        Stop-PortListener 7790
        if (Test-Path -LiteralPath $LiveRoot) {
            $failedRoot = Join-Path $BackupBase "FAILED_RESTORE_$TimeStamp"
            Move-Item -LiteralPath $LiveRoot -Destination $failedRoot -ErrorAction SilentlyContinue
            Write-Log "Failed restored folder preserved: $failedRoot" 'WARN'
        }
        Move-Item -LiteralPath $SafetyRoot -Destination $LiveRoot -ErrorAction Stop
        Write-Log 'Original live folder automatically restored after failure' 'OK'
        Restore-BetaScheduledTasks
        throw
    }

    @"
STATUS=PASS
RESTORED=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
SNAPSHOT=$($chosen.Path)
PRE_RESTORE_BACKUP=$SafetyRoot
BETA_HEALTH=http://127.0.0.1:8021/beta-api/health
SUPERTONIC_PORT=7790
"@ | Out-File -LiteralPath (Join-Path $LiveRoot 'LAST_SNAPSHOT_RESTORE.txt') -Encoding utf8

    Write-Log "Restore completed successfully from $($chosen.Name)" 'OK'
    Write-Host ''
    Write-Host '============================================================'
    Write-Host ' Restore completed successfully'
    Write-Host " Snapshot: $($chosen.Path)"
    Write-Host " Previous state: $SafetyRoot"
    Write-Host ' Beta health: PASS (8021)'
    Write-Host ' Supertonic: PASS (7790)'
    Write-Host '============================================================'
    Pause-End
    exit 0
}
catch {
    Write-Log $_.Exception.Message 'ERROR'
    try { Restore-BetaScheduledTasks } catch {}
    Write-Host ''
    Write-Host 'RESTORE FAILED' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Log: $RestoreLog"
    Pause-End
    exit 1
}
