param()

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Warnings = New-Object System.Collections.Generic.List[string]

function Section([string]$Title) { Write-Host "`n=== $Title ===" }
function Test-Port([int]$Port) {
    $item = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($item) { return 'LISTEN' }
    return 'CLOSED'
}

Write-Host 'BETA PRE-WORK CHECK'
Write-Host ('Time: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Host ('Root: ' + $Root)

Section 'GIT'
Push-Location $Root
try {
    $branch = (git branch --show-current 2>$null).Trim()
    $head = (git rev-parse HEAD 2>$null).Trim()
    $status = @(git status --porcelain=v1 --untracked-files=all 2>$null)
    $modified = @($status | Where-Object { $_ -match '^.?M|^M' })
    $deleted = @($status | Where-Object { $_ -match '^.?D|^D' })
    $untracked = @($status | Where-Object { $_ -like '??*' })
    Write-Host "Git branch: $branch"
    Write-Host "Git HEAD: $head"
    Write-Host ('Working tree: ' + $(if ($status.Count) { 'DIRTY' } else { 'CLEAN' }))
    Write-Host "Modified files: $($modified.Count)"
    Write-Host "Deleted files: $($deleted.Count)"
    Write-Host "Untracked files: $($untracked.Count)"
    if ($status.Count) {
        $status | ForEach-Object { Write-Host $_ }
        $Warnings.Add('Existing uncommitted work detected. Do not restore, delete, or commit unrelated files.')
    }
} finally { Pop-Location }

Section 'SERVICES'
$port8021 = Test-Port 8021
$port7790 = Test-Port 7790
Write-Host "Port 8021: $port8021"
Write-Host "Port 7790: $port7790"
if ($port8021 -ne 'LISTEN') { $Warnings.Add('Beta port 8021 is not listening.') }
if ($port7790 -ne 'LISTEN') { $Warnings.Add('Beta Supertonic port 7790 is not listening.') }

$health = 'FAIL'
try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8021/beta-api/health' -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) { $health = 'PASS' }
} catch { $Warnings.Add('Health endpoint request failed: ' + $_.Exception.Message) }
Write-Host "Health: $health"

Section 'DATABASE'
$db = Join-Path $Root 'data\storymaker_beta.db'
if (Test-Path -LiteralPath $db -PathType Leaf) {
    $dbItem = Get-Item -LiteralPath $db
    Write-Host 'Database: PASS'
    Write-Host "DB size bytes: $($dbItem.Length)"
} else {
    Write-Host 'Database: FAIL'
    $Warnings.Add('Beta database is missing.')
}

Section 'BACKUP AND DOCUMENTS'
$backupRoot = 'F:\v1_backup\V1_BETA0724'
$latestPass = $null
if (Test-Path -LiteralPath $backupRoot) {
    $latestPass = Get-ChildItem -LiteralPath $backupRoot -Directory -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Where-Object {
            $statusFiles = Get-ChildItem -LiteralPath $_.FullName -File -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match 'status|summary|report|log' }
            foreach ($file in $statusFiles) {
                if (Select-String -LiteralPath $file.FullName -SimpleMatch 'STATUS=PASS' -Quiet -ErrorAction SilentlyContinue) { return $true }
            }
            return $false
        } | Select-Object -First 1
}
if ($latestPass) { Write-Host "Latest backup PASS: $($latestPass.FullName)" } else { Write-Host 'Latest backup PASS: NOT FOUND'; $Warnings.Add('No recent STATUS=PASS backup was located automatically.') }

$logs = Join-Path $Root 'WORK_LOGS'
$latestLog = Get-ChildItem -LiteralPath $logs -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike '00_*' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latestLog) { Write-Host "Latest work log: $($latestLog.FullName)" } else { Write-Host 'Latest work log: NOT FOUND' }

$currentState = Join-Path $Root 'CURRENT_STATE.md'
if (Test-Path -LiteralPath $currentState) {
    $currentItem = Get-Item -LiteralPath $currentState
    Write-Host "CURRENT_STATE updated: $($currentItem.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
    $newestSource = Get-ChildItem -LiteralPath (Join-Path $Root 'app'),(Join-Path $Root 'static') -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($newestSource -and $newestSource.LastWriteTime -gt $currentItem.LastWriteTime) {
        $Warnings.Add("CURRENT_STATE.md is older than source file: $($newestSource.FullName)")
    }
} else { $Warnings.Add('CURRENT_STATE.md is missing.') }

Section 'BOUNDARY CHECK'
$v1Matches = Get-ChildItem -LiteralPath (Join-Path $Root 'app'),(Join-Path $Root 'static') -File -Recurse -ErrorAction SilentlyContinue |
    Select-String -SimpleMatch 'F:\StoryMaker_V1' -ErrorAction SilentlyContinue
if ($v1Matches) {
    $v1Matches | Select-Object Path,LineNumber,Line | Format-Table -AutoSize
    $Warnings.Add('V1 absolute path reference detected in Beta source. Verify that it is not a runtime file or DB dependency.')
} else { Write-Host 'V1 absolute path references: NONE' }

Section 'UNDEFINED FUNCTION CANDIDATES'
$pyFiles = Get-ChildItem -LiteralPath (Join-Path $Root 'app') -Filter '*.py' -File -Recurse
$defs = @{}
$calls = @{}
foreach ($file in $pyFiles) {
    $text = Get-Content -LiteralPath $file.FullName -Raw`r`n    if ($null -eq $text) { continue }
    [regex]::Matches($text, '(?m)^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(') | ForEach-Object { $defs[$_.Groups[1].Value] = $true }
    [regex]::Matches($text, '\b(beta_[A-Za-z_]\w*|validate_worker)\s*\(') | ForEach-Object { $calls[$_.Groups[1].Value] = $true }
}
$candidates = @($calls.Keys | Where-Object { -not $defs.ContainsKey($_) } | Sort-Object)
if ($candidates.Count) { $candidates | ForEach-Object { Write-Host $_ }; $Warnings.Add('Undefined function candidates were found. Review imports and definitions before editing.') } else { Write-Host 'None found by heuristic scan.' }

Section 'PYTHON IMPORT CHECK'
$python = Join-Path $Root '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { $python = 'python' }
& $python -m compileall -q (Join-Path $Root 'app')
if ($LASTEXITCODE -eq 0) { Write-Host 'Python compile: PASS' } else { Write-Host 'Python compile: FAIL'; $Warnings.Add('Python compileall failed.') }
Push-Location $Root
try {
    & $python -c "import app.main; print('Python import: PASS')"
    if ($LASTEXITCODE -ne 0) { $Warnings.Add('Python import app.main failed.') }
} finally { Pop-Location }

Section 'JAVASCRIPT SYNTAX'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host 'Node: NOT FOUND'
    $Warnings.Add('Node.js is unavailable; JavaScript syntax was not checked.')
} else {
    $jsFiles = Get-ChildItem -LiteralPath (Join-Path $Root 'static') -Filter '*.js' -File -ErrorAction SilentlyContinue
    $failed = 0
    foreach ($file in $jsFiles) {
        & node --check $file.FullName 2>$null
        if ($LASTEXITCODE -ne 0) { Write-Host "FAIL: $($file.FullName)"; $failed++ }
    }
    if ($failed -eq 0) { Write-Host "JavaScript syntax: PASS ($($jsFiles.Count) root files)" } else { $Warnings.Add("JavaScript syntax failures: $failed") }
}

Section 'WARNINGS'
if ($Warnings.Count -eq 0) { Write-Host 'None' } else { $Warnings | ForEach-Object { Write-Host ('- ' + $_) } }

Write-Host "`nPRE-WORK CHECK COMPLETE (read-only)"
