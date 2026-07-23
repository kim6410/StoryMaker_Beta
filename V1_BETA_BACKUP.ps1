$ErrorActionPreference = 'Stop'

$SourceRoot = 'F:\StoryMaker_beta'
$BackupRoot = 'F:\v1_backup'
$Timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$Destination = Join-Path $BackupRoot "V1_BETA_WORKING_$Timestamp"
$LogPath = Join-Path $Destination 'BACKUP_LOG.txt'
$ManifestPath = Join-Path $Destination 'SHA256_MANIFEST.txt'

New-Item -ItemType Directory -Force -Path $BackupRoot, $Destination | Out-Null

function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    $line | Tee-Object -FilePath $LogPath -Append
}

function Copy-BackupFile {
    param([Parameter(Mandatory=$true)][string]$RelativePath)

    $src = Join-Path $SourceRoot $RelativePath
    if (-not (Test-Path $src -PathType Leaf)) {
        Write-Log "SKIP missing file: $RelativePath"
        return
    }

    $dst = Join-Path $Destination $RelativePath
    New-Item -ItemType Directory -Force -Path (Split-Path $dst -Parent) | Out-Null
    Copy-Item $src $dst -Force
    Write-Log "COPIED file: $RelativePath"
}

function Copy-BackupTree {
    param(
        [Parameter(Mandatory=$true)][string]$RelativePath,
        [string[]]$ExcludeDirectoryNames = @(),
        [string[]]$ExcludeExtensions = @()
    )

    $src = Join-Path $SourceRoot $RelativePath
    if (-not (Test-Path $src -PathType Container)) {
        Write-Log "SKIP missing folder: $RelativePath"
        return
    }

    $dstRoot = Join-Path $Destination $RelativePath
    New-Item -ItemType Directory -Force -Path $dstRoot | Out-Null

    Get-ChildItem $src -Recurse -Force -File -ErrorAction SilentlyContinue | Where-Object {
        $relative = $_.FullName.Substring($src.Length).TrimStart('\')
        $parts = $relative -split '\\'
        $blockedDir = $false
        foreach ($name in $ExcludeDirectoryNames) {
            if ($parts -contains $name) { $blockedDir = $true; break }
        }
        (-not $blockedDir) -and ($ExcludeExtensions -notcontains $_.Extension.ToLowerInvariant())
    } | ForEach-Object {
        $relative = $_.FullName.Substring($src.Length).TrimStart('\')
        $dst = Join-Path $dstRoot $relative
        New-Item -ItemType Directory -Force -Path (Split-Path $dst -Parent) | Out-Null
        Copy-Item $_.FullName $dst -Force
    }

    Write-Log "COPIED folder: $RelativePath"
}

# Recovery-critical runtime preflight
$preflightErrors = @()
$requiredRuntimeFiles = @(
    '.venv\pyvenv.cfg',
    '.venv\Scripts\python.exe',
    'app\main.py',
    'static\production.html',
    'start_beta.cmd',
    'start_beta_background.ps1',
    'start_beta_supertonic.cmd',
    'start_beta_supertonic_background.ps1'
)

foreach ($relative in $requiredRuntimeFiles) {
    $full = Join-Path $SourceRoot $relative
    if (-not (Test-Path $full -PathType Leaf)) {
        $preflightErrors += "Missing required runtime file: $relative"
    }
}

$betaPython = Join-Path $SourceRoot '.venv\Scripts\python.exe'
if (Test-Path $betaPython -PathType Leaf) {
    try {
        Push-Location $SourceRoot
        & $betaPython -c "import fastapi,uvicorn,pydantic,multipart; import app.main; print('BETA_RUNTIME_OK')" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Beta runtime import check failed' }
    } catch {
        $preflightErrors += $_.Exception.Message
    } finally {
        Pop-Location
    }
}

if ($preflightErrors.Count -gt 0) {
    $preflightErrors | Out-File (Join-Path $Destination 'PREFLIGHT_ERROR.txt') -Encoding utf8
    throw ($preflightErrors -join '; ')
}

Write-Log 'StoryMaker Beta working-state backup started'
Write-Log "Source: $SourceRoot"
Write-Log "Destination: $Destination"
Write-Log 'PREFLIGHT runtime verification passed'

# Root launchers, operational scripts, package manifests and restore notes
Get-ChildItem $SourceRoot -Force -File | Where-Object {
    $_.Extension.ToLowerInvariant() -in @('.bat', '.cmd', '.ps1', '.py', '.yml', '.yaml', '.json', '.txt', '.md') -and
    $_.Name -ne '$null'
} | ForEach-Object {
    Copy-BackupFile $_.Name
}

# Core application, frontend, tests, configuration and work logs
Copy-BackupTree 'app' -ExcludeDirectoryNames @('__pycache__', '.pytest_cache') -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')
Copy-BackupTree 'static' -ExcludeDirectoryNames @('cache', 'tmp', 'temp') -ExcludeExtensions @('.log', '.tmp')
Copy-BackupTree 'config' -ExcludeDirectoryNames @('__pycache__') -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')
Copy-BackupTree 'tests' -ExcludeDirectoryNames @('__pycache__', '.pytest_cache') -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')
Copy-BackupTree 'WORK_LOGS' -ExcludeDirectoryNames @('__pycache__') -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')

# Runtime data and generated jobs are preserved for full working-state recovery.
Copy-BackupTree 'data' `
    -ExcludeDirectoryNames @('chrome-debug', 'chrome-test', '__pycache__', 'cache', 'tmp', 'temp') `
    -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')

# Preserve complete Beta Python runtime.
Copy-BackupTree '.venv' `
    -ExcludeDirectoryNames @('__pycache__', '.pytest_cache') `
    -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')

# Preserve complete isolated Supertonic runtime and model cache.
Copy-BackupTree 'Supertonic3' `
    -ExcludeDirectoryNames @('__pycache__', '.model_cache.tmp', 'output', 'logs', 'tmp', 'temp') `
    -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')

# Preserve local tools such as ffmpeg, while excluding temporary files.
Copy-BackupTree 'tools' `
    -ExcludeDirectoryNames @('__pycache__', 'tmp', 'temp', 'cache') `
    -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')

# Verify recovery-critical files were included.
$verificationErrors = @()
$criticalExactFiles = @(
    '.venv\pyvenv.cfg',
    '.venv\Scripts\python.exe',
    'app\main.py',
    'app\beta_jobs.py',
    'app\beta_browser.py',
    'app\beta_gemini_worker.py',
    'static\production.html',
    'static\beta-production.js',
    'static\beta-browser-render.js',
    'static\storymaker-beta-gemini-worker.user.js',
    'data\storymaker_beta.db',
    'start_beta.cmd',
    'start_beta_background.ps1',
    'start_beta_supertonic.cmd',
    'start_beta_supertonic_background.ps1'
)

foreach ($relative in $criticalExactFiles) {
    $sourceFile = Join-Path $SourceRoot $relative
    $backupFile = Join-Path $Destination $relative
    if (Test-Path $sourceFile -PathType Leaf) {
        if (Test-Path $backupFile -PathType Leaf) {
            Write-Log "VERIFIED critical file: $relative"
        } else {
            $verificationErrors += "Missing critical backup file: $relative"
        }
    } else {
        Write-Log "SKIP verification; source missing: $relative"
    }
}

$criticalPatterns = @(
    @{ Path = 'static\vendor'; Pattern = '*.wasm'; Label = 'Browser WASM assets' },
    @{ Path = 'Supertonic3\model_cache'; Pattern = '*'; Label = 'Supertonic3 model cache' },
    @{ Path = 'data\jobs'; Pattern = '*'; Label = 'Beta job data' }
)

foreach ($item in $criticalPatterns) {
    $sourceFolder = Join-Path $SourceRoot $item.Path
    $backupFolder = Join-Path $Destination $item.Path

    if (-not (Test-Path $sourceFolder -PathType Container)) {
        Write-Log "SKIP verification; source folder missing: $($item.Path)"
        continue
    }

    $sourceFiles = @(Get-ChildItem $sourceFolder -Recurse -Force -File -Filter $item.Pattern -ErrorAction SilentlyContinue)
    $backupFiles = @()
    if (Test-Path $backupFolder -PathType Container) {
        $backupFiles = @(Get-ChildItem $backupFolder -Recurse -Force -File -Filter $item.Pattern -ErrorAction SilentlyContinue)
    }

    if ($sourceFiles.Count -eq $backupFiles.Count) {
        Write-Log "VERIFIED $($item.Label): files=$($backupFiles.Count)"
    } else {
        $verificationErrors += "$($item.Label) count mismatch: source=$($sourceFiles.Count) backup=$($backupFiles.Count)"
    }
}

if ($verificationErrors.Count -gt 0) {
    $verificationErrors | Out-File (Join-Path $Destination 'CRITICAL_VERIFY_ERROR.txt') -Encoding utf8
    throw ($verificationErrors -join '; ')
}

# Record exact runtime inventories for restore verification.
$restoreInfo = Join-Path $Destination 'RESTORE_INFO'
New-Item -ItemType Directory -Force -Path $restoreInfo | Out-Null

try {
    & $betaPython -m pip freeze 2>&1 |
        Out-File (Join-Path $restoreInfo 'requirements_beta_freeze.txt') -Encoding utf8
} catch {
    $_.Exception.Message | Out-File (Join-Path $restoreInfo 'requirements_beta_error.txt') -Encoding utf8
}

Get-Content (Join-Path $SourceRoot '.venv\pyvenv.cfg') |
    Out-File (Join-Path $restoreInfo 'pyvenv_beta.cfg') -Encoding utf8

try {
    Get-NetTCPConnection -LocalPort 8021,7790 -State Listen -ErrorAction SilentlyContinue |
        Format-List * | Out-File (Join-Path $restoreInfo 'beta_listening_ports.txt') -Encoding utf8
} catch {
    $_.Exception.Message | Out-File (Join-Path $restoreInfo 'beta_ports_error.txt') -Encoding utf8
}

# Integrity manifest
Write-Log 'Creating SHA-256 manifest'
Get-ChildItem $Destination -Recurse -Force -File | Where-Object {
    $_.FullName -ne $ManifestPath -and $_.FullName -ne $LogPath
} | Sort-Object FullName | ForEach-Object {
    $hash = Get-FileHash $_.FullName -Algorithm SHA256
    $relative = $_.FullName.Substring($Destination.Length).TrimStart('\')
    "{0} *{1}" -f $hash.Hash, $relative
} | Out-File $ManifestPath -Encoding utf8

$fileCount = (Get-ChildItem $Destination -Recurse -Force -File | Measure-Object).Count
$totalBytes = (Get-ChildItem $Destination -Recurse -Force -File | Measure-Object Length -Sum).Sum

@"
StoryMaker Beta working-state backup
Created: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Source: $SourceRoot
Destination: $Destination
Files: $fileCount
Bytes: $totalBytes

Purpose:
- Restore the current StoryMaker Beta production flow
- Preserve Beta backend, frontend, Gemini worker and browser renderer
- Preserve Beta database, current jobs and configuration
- Preserve the complete Beta Python virtual environment
- Preserve the complete isolated Supertonic3 runtime and model cache
- Preserve local tools and exact package inventories

Excluded:
- Local safety backups folder
- Runtime logs
- Chrome debug/test browser profiles
- Disposable cache and temporary files
- node_modules (restored with npm install from package-lock.json)
"@ | Out-File (Join-Path $Destination 'README_RESTORE.txt') -Encoding utf8

Write-Log "Backup completed. Files=$fileCount Bytes=$totalBytes"
Write-Host ''
Write-Host '============================================================'
Write-Host ' StoryMaker Beta working-state backup completed'
Write-Host " Folder: $Destination"
Write-Host '============================================================'
