param()

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Warnings = New-Object System.Collections.Generic.List[string]

function Section([string]$Title) { Write-Host "`n=== $Title ===" }
function Test-Port([int]$Port) {
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1) { return 'LISTEN' }
    return 'CLOSED'
}

Write-Host 'BETA POST-WORK CHECK'
Write-Host ('Time: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Host ('Root: ' + $Root)

Section 'GIT DIFF'
Push-Location $Root
try {
    git status --short --untracked-files=all
    git diff --check
    if ($LASTEXITCODE -eq 0) { Write-Host 'git diff --check: PASS' } else { $Warnings.Add('git diff --check failed.') }
    Write-Host 'Changed paths:'
    git diff --name-status
    git diff --cached --name-status
} finally { Pop-Location }

Section 'PYTHON'
$python = Join-Path $Root '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { $python = 'python' }
& $python -m compileall -q (Join-Path $Root 'app')
if ($LASTEXITCODE -eq 0) { Write-Host 'Python compile: PASS' } else { Write-Host 'Python compile: FAIL'; $Warnings.Add('Python compileall failed.') }
Push-Location $Root
try {
    & $python -c "import app.main; print('Python import: PASS')"
    if ($LASTEXITCODE -ne 0) { $Warnings.Add('Python import app.main failed.') }
} finally { Pop-Location }

Section 'JAVASCRIPT'
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $files = Get-ChildItem -LiteralPath (Join-Path $Root 'static') -Filter '*.js' -File -ErrorAction SilentlyContinue
    $failed = 0
    foreach ($file in $files) {
        & node --check $file.FullName 2>$null
        if ($LASTEXITCODE -ne 0) { Write-Host "FAIL: $($file.FullName)"; $failed++ }
    }
    if ($failed -eq 0) { Write-Host "JavaScript syntax: PASS ($($files.Count) root files)" } else { $Warnings.Add("JavaScript syntax failures: $failed") }
} else { $Warnings.Add('Node.js unavailable; JavaScript syntax not checked.') }

Section 'SERVICES AND HTTP'
$port8021 = Test-Port 8021
$port7790 = Test-Port 7790
Write-Host "Port 8021: $port8021"
Write-Host "Port 7790: $port7790"
foreach ($url in @(
    'http://127.0.0.1:8021/beta-api/health',
    'http://127.0.0.1:8021/beta',
    'http://127.0.0.1:8021/beta/archive',
    'http://127.0.0.1:8021/beta/browser-render'
)) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8
        Write-Host "$url : $($r.StatusCode)"
        if ($r.StatusCode -ne 200) { $Warnings.Add("Unexpected HTTP status: $url") }
    } catch {
        Write-Host "$url : FAIL"
        $Warnings.Add("HTTP failed: $url - $($_.Exception.Message)")
    }
}

Section 'DATABASE'
$db = Join-Path $Root 'data\storymaker_beta.db'
if (Test-Path -LiteralPath $db) {
    $item = Get-Item -LiteralPath $db
    Write-Host "Database exists: PASS ($($item.Length) bytes)"
    try {
        $check = & $python -c "import sqlite3; c=sqlite3.connect(r'$db'); print(c.execute('PRAGMA quick_check').fetchone()[0]); c.close()"
        Write-Host "SQLite quick_check: $check"
        if (($check | Out-String).Trim() -ne 'ok') { $Warnings.Add('SQLite quick_check did not return ok.') }
    } catch { $Warnings.Add('SQLite quick_check execution failed.') }
} else { $Warnings.Add('Beta database missing.') }

Section 'JOB RESULT AUDIT'
$jobsRoot = Join-Path $Root 'data\jobs'
$badJson = 0
$emptyMedia = 0
$jobCount = 0
if (Test-Path -LiteralPath $jobsRoot) {
    $jobs = Get-ChildItem -LiteralPath $jobsRoot -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'beta_*' }
    $jobCount = $jobs.Count
    foreach ($job in $jobs) {
        $resultPath = Join-Path $job.FullName 'result.json'
        if (-not (Test-Path -LiteralPath $resultPath)) { Write-Host "Missing result.json: $($job.Name)"; $badJson++; continue }
        try { $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json } catch { Write-Host "Invalid result.json: $($job.Name)"; $badJson++; continue }
        foreach ($key in @('audio','mixed_audio','subtitle','thumbnail','video','browser_audio','browser_video')) {
            $value = $result.assets.$key
            if ($value -and (Test-Path -LiteralPath $value)) {
                if ((Get-Item -LiteralPath $value).Length -eq 0) { Write-Host "Empty asset $key : $value"; $emptyMedia++ }
            }
        }
    }
}
Write-Host "Jobs audited: $jobCount"
Write-Host "Invalid or missing result.json: $badJson"
Write-Host "Empty media files: $emptyMedia"
if ($badJson) { $Warnings.Add("Job result problems: $badJson") }
if ($emptyMedia) { $Warnings.Add("Empty media files: $emptyMedia") }

Section 'DOCUMENTATION'
foreach ($relative in @('00_READ_FIRST.md','ACTIVE_WORK.md','CURRENT_STATE.md','KNOWN_ISSUES.md','ARCHITECTURE.md','DECISIONS.md','AI_HANDOFF_CHECKLIST.md','WORK_LOGS\00_INDEX.md','WORK_LOGS\00_WORK_LOG_TEMPLATE.md')) {
    $path = Join-Path $Root $relative
    if (Test-Path -LiteralPath $path) { Write-Host "PASS: $relative" } else { Write-Host "MISSING: $relative"; $Warnings.Add("Required document missing: $relative") }
}
$latestLog = Get-ChildItem -LiteralPath (Join-Path $Root 'WORK_LOGS') -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike '00_*' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latestLog) { Write-Host "Latest work log: $($latestLog.Name)" } else { $Warnings.Add('No dated work log found.') }

Section 'V1 BOUNDARY'
$v1Refs = Get-ChildItem -LiteralPath (Join-Path $Root 'app'),(Join-Path $Root 'static') -File -Recurse -ErrorAction SilentlyContinue |
    Select-String -SimpleMatch 'F:\StoryMaker_V1' -ErrorAction SilentlyContinue
if ($v1Refs) {
    $v1Refs | Select-Object Path,LineNumber,Line | Format-Table -AutoSize
    $Warnings.Add('V1 absolute path references exist; verify they are read-only and approved.')
} else { Write-Host 'V1 absolute path references: NONE' }

Section 'WARNINGS'
if ($Warnings.Count -eq 0) { Write-Host 'None'; Write-Host 'READY FOR MANUAL BROWSER VERIFICATION AND REVIEW' }
else { $Warnings | ForEach-Object { Write-Host ('- ' + $_) }; Write-Host 'NOT READY TO CLAIM FINAL SUCCESS' }

Write-Host "`nPOST-WORK CHECK COMPLETE (no project files were modified)"
