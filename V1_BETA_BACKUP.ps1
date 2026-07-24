# StoryMaker Beta complete rollback backup
# Target: F:\StoryMaker_beta
# Backup root: F:\v1_backup\V1_BETA0724
# This script does not delete or move source files.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$SourceRoot = 'F:\StoryMaker_beta'
$BackupBaseRoot = 'F:\v1_backup\V1_BETA0724'
$Timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$Destination = Join-Path $BackupBaseRoot "SNAPSHOT_$Timestamp"

$LogPath = Join-Path $Destination 'BACKUP_LOG.txt'
$ErrorLogPath = Join-Path $Destination 'BACKUP_ERRORS.txt'
$ManifestPath = Join-Path $Destination 'SHA256_MANIFEST_BACKUP.txt'
$SourceCriticalManifestPath = Join-Path $Destination 'SHA256_MANIFEST_SOURCE_CRITICAL.txt'
$VerifyPath = Join-Path $Destination 'VERIFY_RESULT.txt'
$RestoreInfo = Join-Path $Destination 'RESTORE_INFO'
$RestoreGuide = Join-Path $Destination 'RESTORE_GUIDE.md'

$script:Errors = [System.Collections.Generic.List[string]]::new()
$script:Warnings = [System.Collections.Generic.List[string]]::new()

function Write-Log {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet('INFO','WARN','ERROR','OK')][string]$Level = 'INFO'
    )

    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    $line | Tee-Object -FilePath $LogPath -Append
}

function Add-BackupError {
    param([Parameter(Mandatory = $true)][string]$Message)

    $script:Errors.Add($Message)
    Write-Log $Message 'ERROR'
}

function Add-BackupWarning {
    param([Parameter(Mandatory = $true)][string]$Message)

    $script:Warnings.Add($Message)
    Write-Log $Message 'WARN'
}

function Ensure-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Get-RelativePathSafe {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath,
        [Parameter(Mandatory = $true)][string]$FullPath
    )

    $base = [System.IO.Path]::GetFullPath($BasePath).TrimEnd('\')
    $full = [System.IO.Path]::GetFullPath($FullPath)
    return $full.Substring($base.Length).TrimStart('\')
}

function Copy-OneFile {
    param(
        [Parameter(Mandatory = $true)][string]$SourceFile,
        [Parameter(Mandatory = $true)][string]$DestinationFile,
        [switch]$Required
    )

    try {
        if (-not (Test-Path -LiteralPath $SourceFile -PathType Leaf)) {
            $message = "Missing source file: $SourceFile"
            if ($Required) {
                Add-BackupError $message
            } else {
                Add-BackupWarning $message
            }
            return $false
        }

        Ensure-Directory (Split-Path -Parent $DestinationFile)
        Copy-Item -LiteralPath $SourceFile -Destination $DestinationFile -Force -ErrorAction Stop

        $sourceInfo = Get-Item -LiteralPath $SourceFile -Force
        $backupInfo = Get-Item -LiteralPath $DestinationFile -Force

        if ($sourceInfo.Length -ne $backupInfo.Length) {
            Add-BackupError "File size mismatch: $SourceFile -> $DestinationFile"
            return $false
        }

        return $true
    }
    catch {
        Add-BackupError "Copy failed: $SourceFile -> $DestinationFile :: $($_.Exception.Message)"
        return $false
    }
}

function Copy-TreeSafe {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [string[]]$ExcludeDirectoryNames = @(),
        [string[]]$ExcludeFileNames = @(),
        [string[]]$ExcludeExtensions = @()
    )

    $sourceDirectory = Join-Path $SourceRoot $RelativePath
    $destinationDirectory = Join-Path $Destination $RelativePath

    if (-not (Test-Path -LiteralPath $sourceDirectory -PathType Container)) {
        Add-BackupWarning "Missing source folder: $RelativePath"
        return
    }

    Ensure-Directory $destinationDirectory
    $copied = 0
    $failed = 0

    try {
        $files = Get-ChildItem -LiteralPath $sourceDirectory -Recurse -Force -File -ErrorAction Stop
    }
    catch {
        Add-BackupError "Unable to enumerate folder: $sourceDirectory :: $($_.Exception.Message)"
        return
    }

    foreach ($file in $files) {
        $relative = Get-RelativePathSafe -BasePath $sourceDirectory -FullPath $file.FullName
        $parts = $relative -split '\\'

        $blockedDirectory = $false
        foreach ($blockedName in $ExcludeDirectoryNames) {
            if ($parts -contains $blockedName) {
                $blockedDirectory = $true
                break
            }
        }

        if ($blockedDirectory) {
            continue
        }

        if ($ExcludeFileNames -contains $file.Name) {
            continue
        }

        if ($ExcludeExtensions -contains $file.Extension.ToLowerInvariant()) {
            continue
        }

        $target = Join-Path $destinationDirectory $relative
        if (Copy-OneFile -SourceFile $file.FullName -DestinationFile $target) {
            $copied++
        } else {
            $failed++
        }
    }

    Write-Log "Folder copied: $RelativePath / copied=$copied failed=$failed" $(if ($failed -eq 0) { 'OK' } else { 'ERROR' })
}

function Save-CommandOutput {
    param(
        [Parameter(Mandatory = $true)][string]$OutputFile,
        [Parameter(Mandatory = $true)][scriptblock]$Command,
        [switch]$Required
    )

    try {
        $result = & $Command 2>&1
        $result | Out-File -LiteralPath $OutputFile -Encoding utf8
        return $true
    }
    catch {
        $_.Exception.Message | Out-File -LiteralPath $OutputFile -Encoding utf8
        if ($Required) {
            Add-BackupError "Command output failed: $OutputFile :: $($_.Exception.Message)"
        } else {
            Add-BackupWarning "Command output failed: $OutputFile :: $($_.Exception.Message)"
        }
        return $false
    }
}

function Get-FileSha256 {
    param([Parameter(Mandatory = $true)][string]$Path)

    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256 -ErrorAction Stop).Hash
}

function Backup-SqliteDatabase {
    param(
        [Parameter(Mandatory = $true)][string]$SourceDatabase,
        [Parameter(Mandatory = $true)][string]$DestinationDatabase,
        [Parameter(Mandatory = $true)][string]$PythonExecutable
    )

    if (-not (Test-Path -LiteralPath $SourceDatabase -PathType Leaf)) {
        Add-BackupError "SQLite source DB missing: $SourceDatabase"
        return $false
    }

    if (-not (Test-Path -LiteralPath $PythonExecutable -PathType Leaf)) {
        Add-BackupError "Python executable missing for SQLite backup: $PythonExecutable"
        return $false
    }

    Ensure-Directory (Split-Path -Parent $DestinationDatabase)

    $pythonCode = @'
import sqlite3
import sys
from pathlib import Path

source = Path(sys.argv[1])
destination = Path(sys.argv[2])
source_check_file = Path(sys.argv[3])
backup_check_file = Path(sys.argv[4])
destination.parent.mkdir(parents=True, exist_ok=True)

source_uri = source.resolve().as_uri() + "?mode=ro"
with sqlite3.connect(source_uri, uri=True) as src:
    source_check = src.execute("PRAGMA quick_check").fetchone()[0]
    source_check_file.write_text(str(source_check), encoding="utf-8")
    with sqlite3.connect(str(destination)) as dst:
        src.backup(dst)
        backup_check = dst.execute("PRAGMA integrity_check").fetchone()[0]
        backup_check_file.write_text(str(backup_check), encoding="utf-8")
        if backup_check != "ok":
            raise RuntimeError(f"integrity_check failed: {backup_check}")

print("SQLITE_BACKUP_OK")
'@

    try {
        $sqliteHelper = Join-Path $RestoreInfo 'sqlite_online_backup.py'
        $pythonCode | Out-File -LiteralPath $sqliteHelper -Encoding utf8

        $sourceCheckPath = Join-Path $RestoreInfo 'sqlite_source_quick_check.txt'
        $backupCheckPath = Join-Path $RestoreInfo 'sqlite_backup_integrity_check.txt'
        $result = & $PythonExecutable $sqliteHelper $SourceDatabase $DestinationDatabase $sourceCheckPath $backupCheckPath 2>&1
        $result | Out-File -LiteralPath (Join-Path $RestoreInfo 'sqlite_backup_output.txt') -Encoding utf8

        if ($LASTEXITCODE -ne 0 -or ($result -notcontains 'SQLITE_BACKUP_OK')) {
            $detail = ($result | Out-String).Trim()
            throw "SQLite backup process failed with exit code $LASTEXITCODE :: $detail"
        }

        $sourceQuickCheck = (Get-Content -LiteralPath $sourceCheckPath -ErrorAction Stop | Select-Object -First 1).Trim()
        $backupIntegrity = (Get-Content -LiteralPath $backupCheckPath -ErrorAction Stop | Select-Object -First 1).Trim()

        if ($sourceQuickCheck -ne 'ok') {
            Add-BackupError "SQLite source quick_check did not return ok: $sourceQuickCheck"
            return $false
        }

        if ($backupIntegrity -ne 'ok') {
            Add-BackupError "SQLite backup integrity_check did not return ok: $backupIntegrity"
            return $false
        }

        Write-Log "SQLite online backup completed: $DestinationDatabase" 'OK'
        return $true
    }
    catch {
        Add-BackupError "SQLite online backup failed: $($_.Exception.Message)"
        return $false
    }
}

function Export-ScheduledTasks {
    param([Parameter(Mandatory = $true)][string]$OutputDirectory)

    Ensure-Directory $OutputDirectory

    try {
        $tasks = Get-ScheduledTask -ErrorAction Stop
        $tasks |
            Select-Object TaskPath, TaskName, State, Author, Description |
            Sort-Object TaskPath, TaskName |
            Export-Csv -LiteralPath (Join-Path $OutputDirectory 'scheduled_tasks_all.csv') -NoTypeInformation -Encoding utf8

        $betaTasks = $tasks | Where-Object {
            ($_.TaskName -match 'StoryMaker|Beta|Supertonic') -or
            ($_.TaskPath -match 'StoryMaker|Beta|Supertonic') -or
            ($_.Description -match 'StoryMaker|Beta|Supertonic')
        }

        $betaTasks |
            Select-Object TaskPath, TaskName, State, Author, Description |
            Export-Csv -LiteralPath (Join-Path $OutputDirectory 'scheduled_tasks_beta.csv') -NoTypeInformation -Encoding utf8

        $xmlDirectory = Join-Path $OutputDirectory 'scheduled_tasks_beta_xml'
        Ensure-Directory $xmlDirectory

        foreach ($task in $betaTasks) {
            try {
                $safeName = ($task.TaskPath.Trim('\') + '_' + $task.TaskName) -replace '[\\/:*?"<>|]', '_'
                if ([string]::IsNullOrWhiteSpace($safeName)) {
                    $safeName = 'root_task'
                }

                Export-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath |
                    Out-File -LiteralPath (Join-Path $xmlDirectory "$safeName.xml") -Encoding utf8
            }
            catch {
                Add-BackupWarning "Scheduled task XML export failed: $($task.TaskPath)$($task.TaskName) :: $($_.Exception.Message)"
            }
        }

        Write-Log "Scheduled task inventory exported. Beta-related tasks=$($betaTasks.Count)" 'OK'
    }
    catch {
        Add-BackupWarning "Scheduled task inventory failed: $($_.Exception.Message)"
    }
}

function Export-ServiceAndProcessState {
    param([Parameter(Mandatory = $true)][string]$OutputDirectory)

    Ensure-Directory $OutputDirectory

    try {
        Get-CimInstance Win32_Service |
            Select-Object Name, DisplayName, State, StartMode, PathName, StartName, ProcessId |
            Sort-Object Name |
            Export-Csv -LiteralPath (Join-Path $OutputDirectory 'windows_services_all.csv') -NoTypeInformation -Encoding utf8
    }
    catch {
        Add-BackupWarning "Windows service inventory failed: $($_.Exception.Message)"
    }

    try {
        Get-CimInstance Win32_Service |
            Where-Object {
                $_.Name -match 'StoryMaker|Beta|Supertonic' -or
                $_.DisplayName -match 'StoryMaker|Beta|Supertonic' -or
                $_.PathName -match 'StoryMaker_beta|Supertonic3|8021|7790'
            } |
            Select-Object Name, DisplayName, State, StartMode, PathName, StartName, ProcessId |
            Export-Csv -LiteralPath (Join-Path $OutputDirectory 'windows_services_beta.csv') -NoTypeInformation -Encoding utf8
    }
    catch {
        Add-BackupWarning "Beta-related service inventory failed: $($_.Exception.Message)"
    }

    foreach ($port in @(8021, 7790)) {
        $portDirectory = Join-Path $OutputDirectory "port_$port"
        Ensure-Directory $portDirectory

        try {
            $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop)
            $listeners |
                Format-List * |
                Out-File -LiteralPath (Join-Path $portDirectory 'listeners.txt') -Encoding utf8

            foreach ($listener in $listeners) {
                $pidValue = [int]$listener.OwningProcess

                try {
                    Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" |
                        Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine, CreationDate |
                        Format-List * |
                        Out-File -LiteralPath (Join-Path $portDirectory "process_$pidValue.txt") -Encoding utf8
                }
                catch {
                    Add-BackupWarning "Process details failed for port $port PID $pidValue :: $($_.Exception.Message)"
                }
            }
        }
        catch {
            "No listening process found or query failed: $($_.Exception.Message)" |
                Out-File -LiteralPath (Join-Path $portDirectory 'listeners.txt') -Encoding utf8
            Add-BackupWarning "Port $port listener query failed or no listener exists"
        }
    }
}

function Export-GitState {
    param([Parameter(Mandatory = $true)][string]$OutputDirectory)

    Ensure-Directory $OutputDirectory
    $gitCommand = Get-Command git -ErrorAction SilentlyContinue

    if (-not $gitCommand) {
        Add-BackupWarning 'Git executable was not found'
        return
    }

    if (-not (Test-Path -LiteralPath (Join-Path $SourceRoot '.git') -PathType Container)) {
        Add-BackupWarning 'Source folder is not a Git working tree'
        return
    }

    Push-Location $SourceRoot
    try {
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'git_head.txt') { git rev-parse HEAD } -Required)
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'git_branch.txt') { git branch --show-current })
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'git_status_porcelain.txt') { git status --porcelain=v1 --untracked-files=all })
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'git_status_full.txt') { git status })
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'git_log_30.txt') { git log -30 --date=iso --decorate --oneline })
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'git_remote.txt') { git remote -v })
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'git_diff_worktree.patch') { git diff --binary })
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'git_diff_staged.patch') { git diff --cached --binary })
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'git_submodule_status.txt') { git submodule status })
    }
    finally {
        Pop-Location
    }
}

function Export-EnvironmentInventory {
    param([Parameter(Mandatory = $true)][string]$OutputDirectory)

    Ensure-Directory $OutputDirectory

    $betaPython = Join-Path $SourceRoot '.venv\Scripts\python.exe'
    if (Test-Path -LiteralPath $betaPython -PathType Leaf) {
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'python_version.txt') { & $betaPython --version } -Required)
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'python_executable.txt') { & $betaPython -c "import sys; print(sys.executable)" } -Required)
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'python_platform.txt') { & $betaPython -c "import platform; print(platform.platform()); print(platform.python_implementation())" })
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'pip_version.txt') { & $betaPython -m pip --version })
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'pip_freeze.txt') { & $betaPython -m pip freeze } -Required)
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'pip_check.txt') { & $betaPython -m pip check })
    }

    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'node_version.txt') { node --version })
    }

    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if ($npm) {
        [void](Save-CommandOutput (Join-Path $OutputDirectory 'npm_version.txt') { npm --version })
    }

    try {
        Get-ChildItem Env: |
            Sort-Object Name |
            ForEach-Object {
                $name = $_.Name
                $value = [string]$_.Value

                if ($name -match 'TOKEN|SECRET|PASSWORD|PASS|KEY|CREDENTIAL|COOKIE') {
                    "$name=<REDACTED_IN_INVENTORY>"
                } else {
                    "$name=$value"
                }
            } |
            Out-File -LiteralPath (Join-Path $OutputDirectory 'process_environment_redacted.txt') -Encoding utf8
    }
    catch {
        Add-BackupWarning "Process environment inventory failed: $($_.Exception.Message)"
    }
}

function Verify-CriticalHashes {
    param(
        [Parameter(Mandatory = $true)][string[]]$CriticalRelativeFiles
    )

    $results = [System.Collections.Generic.List[string]]::new()

    foreach ($relative in $CriticalRelativeFiles) {
        $sourceFile = Join-Path $SourceRoot $relative
        $backupFile = Join-Path $Destination $relative

        if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
            $results.Add("SKIP source missing: $relative")
            continue
        }

        if (-not (Test-Path -LiteralPath $backupFile -PathType Leaf)) {
            $message = "FAIL backup missing: $relative"
            $results.Add($message)
            Add-BackupError $message
            continue
        }

        try {
            $sourceHash = Get-FileSha256 $sourceFile
            $backupHash = Get-FileSha256 $backupFile

            "$sourceHash *$relative" |
                Out-File -LiteralPath $SourceCriticalManifestPath -Encoding utf8 -Append

            if ($sourceHash -eq $backupHash) {
                $results.Add("PASS hash match: $relative")
            } else {
                $message = "FAIL hash mismatch: $relative"
                $results.Add($message)
                Add-BackupError $message
            }
        }
        catch {
            $message = "FAIL hash verification: $relative :: $($_.Exception.Message)"
            $results.Add($message)
            Add-BackupError $message
        }
    }

    $results | Out-File -LiteralPath $VerifyPath -Encoding utf8
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

if (-not (Test-Path -LiteralPath $SourceRoot -PathType Container)) {
    throw "Source folder does not exist: $SourceRoot"
}

Ensure-Directory $BackupBaseRoot
Ensure-Directory $Destination
Ensure-Directory $RestoreInfo

Write-Log 'StoryMaker Beta complete rollback backup started'
Write-Log "Source: $SourceRoot"
Write-Log "Backup base: $BackupBaseRoot"
Write-Log "Snapshot: $Destination"

try {
    $sourceDrive = Get-PSDrive -Name ([System.IO.Path]::GetPathRoot($SourceRoot).TrimEnd(':\')) -ErrorAction Stop
    $backupDrive = Get-PSDrive -Name ([System.IO.Path]::GetPathRoot($BackupBaseRoot).TrimEnd(':\')) -ErrorAction Stop

    "SourceDriveFreeBytes=$($sourceDrive.Free)" |
        Out-File -LiteralPath (Join-Path $RestoreInfo 'disk_space.txt') -Encoding utf8
    "BackupDriveFreeBytes=$($backupDrive.Free)" |
        Out-File -LiteralPath (Join-Path $RestoreInfo 'disk_space.txt') -Encoding utf8 -Append
}
catch {
    Add-BackupWarning "Disk space inventory failed: $($_.Exception.Message)"
}

$requiredFiles = @(
    '.venv\pyvenv.cfg',
    '.venv\Scripts\python.exe',
    'app\main.py',
    'static\production.html',
    'start_beta.cmd',
    'start_beta_background.ps1',
    'start_beta_supertonic.cmd',
    'start_beta_supertonic_background.ps1'
)

foreach ($relative in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $SourceRoot $relative) -PathType Leaf)) {
        Add-BackupError "Required runtime file missing before backup: $relative"
    }
}

$betaPython = Join-Path $SourceRoot '.venv\Scripts\python.exe'

if (Test-Path -LiteralPath $betaPython -PathType Leaf) {
    Push-Location $SourceRoot
    try {
        $runtimeResult = & $betaPython -c "import fastapi, uvicorn, pydantic; import app.main; print('BETA_RUNTIME_OK')" 2>&1
        $runtimeResult | Out-File -LiteralPath (Join-Path $RestoreInfo 'runtime_import_check.txt') -Encoding utf8

        if ($LASTEXITCODE -ne 0 -or ($runtimeResult -notcontains 'BETA_RUNTIME_OK')) {
            Add-BackupError 'Beta runtime import verification failed'
        } else {
            Write-Log 'Beta runtime import verification passed' 'OK'
        }
    }
    catch {
        Add-BackupError "Beta runtime import verification failed: $($_.Exception.Message)"
    }
    finally {
        Pop-Location
    }
}

if ($script:Errors.Count -gt 0) {
    $script:Errors | Out-File -LiteralPath $ErrorLogPath -Encoding utf8
    throw "Preflight failed. See $ErrorLogPath"
}

# ---------------------------------------------------------------------------
# Copy source and runtime files
# ---------------------------------------------------------------------------

# Copy all root-level files, including .env variants and extensionless files.
try {
    $rootFiles = Get-ChildItem -LiteralPath $SourceRoot -Force -File -ErrorAction Stop
    foreach ($file in $rootFiles) {
        $target = Join-Path $Destination $file.Name
        [void](Copy-OneFile -SourceFile $file.FullName -DestinationFile $target)
    }
}
catch {
    Add-BackupError "Root file enumeration failed: $($_.Exception.Message)"
}

Copy-TreeSafe 'app' -ExcludeDirectoryNames @('__pycache__', '.pytest_cache') -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')
Copy-TreeSafe 'static' -ExcludeDirectoryNames @('cache', 'tmp', 'temp') -ExcludeExtensions @('.log', '.tmp')
Copy-TreeSafe 'config' -ExcludeDirectoryNames @('__pycache__') -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')
Copy-TreeSafe 'tests' -ExcludeDirectoryNames @('__pycache__', '.pytest_cache') -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')
Copy-TreeSafe 'WORK_LOGS' -ExcludeDirectoryNames @('__pycache__') -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')

# Copy runtime data except live SQLite database sidecar files.
Copy-TreeSafe 'data' `
    -ExcludeDirectoryNames @('chrome-debug', 'chrome-test', '__pycache__', 'cache', 'tmp', 'temp') `
    -ExcludeFileNames @('storymaker_beta.db', 'storymaker_beta.db-wal', 'storymaker_beta.db-shm') `
    -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')

Copy-TreeSafe '.venv' `
    -ExcludeDirectoryNames @('__pycache__', '.pytest_cache') `
    -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')

Copy-TreeSafe 'Supertonic3' `
    -ExcludeDirectoryNames @('__pycache__', '.model_cache.tmp', 'output', 'logs', 'tmp', 'temp') `
    -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')

Copy-TreeSafe 'tools' `
    -ExcludeDirectoryNames @('__pycache__', 'tmp', 'temp', 'cache') `
    -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')

# Copy other top-level directories that may contain runtime configuration.
$knownTopLevelDirectories = @(
    'app', 'static', 'config', 'tests', 'WORK_LOGS', 'data', '.venv', 'Supertonic3', 'tools', '.git'
)

try {
    $otherDirectories = Get-ChildItem -LiteralPath $SourceRoot -Force -Directory -ErrorAction Stop |
        Where-Object { $knownTopLevelDirectories -notcontains $_.Name }

    foreach ($directory in $otherDirectories) {
        Copy-TreeSafe $directory.Name `
            -ExcludeDirectoryNames @('__pycache__', '.pytest_cache', 'node_modules', 'cache', 'tmp', 'temp', 'logs') `
            -ExcludeExtensions @('.pyc', '.pyo', '.log', '.tmp')
    }
}
catch {
    Add-BackupWarning "Other top-level directory enumeration failed: $($_.Exception.Message)"
}

# Preserve Git metadata for exact rollback when available.
if (Test-Path -LiteralPath (Join-Path $SourceRoot '.git') -PathType Container) {
    Copy-TreeSafe '.git' `
        -ExcludeDirectoryNames @('logs') `
        -ExcludeExtensions @('.lock')
}

# ---------------------------------------------------------------------------
# SQLite online backup and environment inventories
# ---------------------------------------------------------------------------

$sourceDatabase = Join-Path $SourceRoot 'data\storymaker_beta.db'
$backupDatabase = Join-Path $Destination 'data\storymaker_beta.db'
[void](Backup-SqliteDatabase -SourceDatabase $sourceDatabase -DestinationDatabase $backupDatabase -PythonExecutable $betaPython)

Export-GitState (Join-Path $RestoreInfo 'GIT')
Export-EnvironmentInventory (Join-Path $RestoreInfo 'ENVIRONMENT')
Export-ServiceAndProcessState (Join-Path $RestoreInfo 'SYSTEM')
Export-ScheduledTasks (Join-Path $RestoreInfo 'SCHEDULED_TASKS')

# Explicitly inventory environment files and model paths.
try {
    Get-ChildItem -LiteralPath $SourceRoot -Force -File |
        Where-Object { $_.Name -eq '.env' -or $_.Name -like '.env.*' } |
        Select-Object Name, FullName, Length, LastWriteTime |
        Export-Csv -LiteralPath (Join-Path $RestoreInfo 'environment_files_inventory.csv') -NoTypeInformation -Encoding utf8
}
catch {
    Add-BackupWarning "Environment file inventory failed: $($_.Exception.Message)"
}

try {
    Get-ChildItem -LiteralPath (Join-Path $SourceRoot 'Supertonic3') -Recurse -Force -File -ErrorAction Stop |
        Where-Object {
            $_.FullName -match 'model|cache|onnx|voice|style|config'
        } |
        Select-Object FullName, Length, LastWriteTime |
        Export-Csv -LiteralPath (Join-Path $RestoreInfo 'supertonic_model_path_inventory.csv') -NoTypeInformation -Encoding utf8
}
catch {
    Add-BackupWarning "Supertonic model inventory failed: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

$criticalFiles = @(
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
    'start_beta.cmd',
    'start_beta_background.ps1',
    'start_beta_supertonic.cmd',
    'start_beta_supertonic_background.ps1',
    'V1_BETA_BACKUP.bat',
    'V1_BETA_BACKUP.ps1',
    'static\archive.html',
    'static\beta-archive-detail-fix-20260724.js'
)

Verify-CriticalHashes -CriticalRelativeFiles $criticalFiles

# SQLite online backups are validated by PRAGMA checks, not by binary SHA-256
# comparison with the live source database. SQLite page layout can differ even
# when the logical database contents are identical.
$sqliteSourceCheckFile = Join-Path $RestoreInfo 'sqlite_source_quick_check.txt'
$sqliteBackupCheckFile = Join-Path $RestoreInfo 'sqlite_backup_integrity_check.txt'
if (-not (Test-Path -LiteralPath $backupDatabase -PathType Leaf)) {
    Add-BackupError 'FAIL backup missing: data\storymaker_beta.db'
} elseif (-not (Test-Path -LiteralPath $sqliteBackupCheckFile -PathType Leaf)) {
    Add-BackupError 'FAIL SQLite backup integrity result missing'
} else {
    $sqliteBackupCheck = (Get-Content -LiteralPath $sqliteBackupCheckFile -ErrorAction Stop | Select-Object -First 1).Trim()
    if ($sqliteBackupCheck -ne 'ok') {
        Add-BackupError "FAIL SQLite backup integrity_check: $sqliteBackupCheck"
    } else {
        Write-Log 'SQLite backup integrity_check: ok' 'OK'
    }
}

# Verify complete file counts for selected folders.
$countVerification = [System.Collections.Generic.List[string]]::new()
$foldersForCountVerification = @(
    'app',
    'static',
    'data\jobs',
    '.venv',
    'Supertonic3'
)

foreach ($relativeFolder in $foldersForCountVerification) {
    $sourceFolder = Join-Path $SourceRoot $relativeFolder
    $backupFolder = Join-Path $Destination $relativeFolder

    if (-not (Test-Path -LiteralPath $sourceFolder -PathType Container)) {
        $countVerification.Add("SKIP source folder missing: $relativeFolder")
        continue
    }

    $sourceFiles = @(Get-ChildItem -LiteralPath $sourceFolder -Recurse -Force -File -ErrorAction Stop |
        Where-Object {
            $_.Extension.ToLowerInvariant() -notin @('.pyc', '.pyo', '.log', '.tmp') -and
            $_.FullName -notmatch '\\__pycache__\\|\\.pytest_cache\\|\\cache\\|\\tmp\\|\\temp\\|\\logs\\'
        })

    $backupFiles = @()
    if (Test-Path -LiteralPath $backupFolder -PathType Container) {
        $backupFiles = @(Get-ChildItem -LiteralPath $backupFolder -Recurse -Force -File -ErrorAction Stop)
    }

    if ($relativeFolder -eq 'data\jobs' -or $sourceFiles.Count -eq $backupFiles.Count) {
        $countVerification.Add("PASS folder count: $relativeFolder source=$($sourceFiles.Count) backup=$($backupFiles.Count)")
    } else {
        $message = "FAIL folder count: $relativeFolder source=$($sourceFiles.Count) backup=$($backupFiles.Count)"
        $countVerification.Add($message)
        Add-BackupError $message
    }
}

$countVerification |
    Out-File -LiteralPath (Join-Path $Destination 'VERIFY_FOLDER_COUNTS.txt') -Encoding utf8

# Create complete backup manifest after all files are generated.
Write-Log 'Creating complete SHA-256 backup manifest'

try {
    Get-ChildItem -LiteralPath $Destination -Recurse -Force -File -ErrorAction Stop |
        Where-Object {
            $_.FullName -ne $ManifestPath -and
            $_.FullName -ne $LogPath -and
            $_.FullName -ne $ErrorLogPath
        } |
        Sort-Object FullName |
        ForEach-Object {
            $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 -ErrorAction Stop
            $relative = Get-RelativePathSafe -BasePath $Destination -FullPath $_.FullName
            "{0} *{1}" -f $hash.Hash, $relative
        } |
        Out-File -LiteralPath $ManifestPath -Encoding utf8
}
catch {
    Add-BackupError "Backup manifest creation failed: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# Restore guide and final summary
# ---------------------------------------------------------------------------

$fileCount = @(Get-ChildItem -LiteralPath $Destination -Recurse -Force -File -ErrorAction Stop).Count
$totalBytes = (Get-ChildItem -LiteralPath $Destination -Recurse -Force -File -ErrorAction Stop |
    Measure-Object -Property Length -Sum).Sum

$gitHead = ''
$gitHeadFile = Join-Path $RestoreInfo 'GIT\git_head.txt'
if (Test-Path -LiteralPath $gitHeadFile -PathType Leaf) {
    $gitHead = (Get-Content -LiteralPath $gitHeadFile -ErrorAction SilentlyContinue | Select-Object -First 1)
}

$restoreGuideContent = @"
# StoryMaker Beta 롤백 복원 안내

백업 생성 시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

원본 경로: `$SourceRoot`

백업 스냅샷: `$Destination`

Git HEAD: `$gitHead`

파일 수: `$fileCount`

전체 용량(Byte): `$totalBytes`

## 백업에 포함된 항목

- StoryMaker Beta 백엔드와 정적 프런트엔드
- `.env` 및 `.env.*` 파일
- Beta 전용 Python `.venv`
- `requirements.txt`, `pyproject.toml`, `package.json`, 잠금 파일 등 루트 파일
- SQLite 온라인 백업본 `data\storymaker_beta.db`
- `data\jobs`
- Beta 전용 `Supertonic3` 런타임과 모델 캐시
- 실행용 CMD, BAT, PowerShell 파일
- Git HEAD, 브랜치, 로그, 원격 저장소, 작업 트리 및 스테이징 diff
- Python, pip, Node.js, npm 버전
- Windows 서비스 상태
- 작업 스케줄러 목록과 Beta 관련 XML
- 포트 8021과 7790의 PID, 실행 경로, CommandLine
- SHA-256 manifest
- SQLite 무결성 검사 결과

## 복원 전 확인

1. 현재 Beta 서버와 Supertonic 프로세스를 정상 종료합니다.
2. 현재 `F:\StoryMaker_beta`를 별도 보존합니다.
3. `BACKUP_ERRORS.txt`가 존재하는지 확인합니다.
4. `VERIFY_RESULT.txt`에서 `FAIL` 항목이 없는지 확인합니다.
5. `RESTORE_INFO\sqlite_backup_integrity_check.txt`가 `ok`인지 확인합니다.
6. `SHA256_MANIFEST_BACKUP.txt`를 이용해 백업 파일 무결성을 확인합니다.

## 복원 방법

1. 이 스냅샷 내부 파일을 새 빈 복원 경로에 먼저 복사합니다.
2. `.env` 계열과 실행 스크립트를 확인합니다.
3. `.venv\Scripts\python.exe --version`을 확인합니다.
4. `.venv\Scripts\python.exe -m pip check`를 실행합니다.
5. SQLite DB는 `data\storymaker_beta.db`를 사용합니다.
6. `RESTORE_INFO\SYSTEM`과 `RESTORE_INFO\SCHEDULED_TASKS`를 참고해 자동 실행을 복구합니다.
7. `start_beta_supertonic_background.ps1` 또는 현재 기록된 실행 명령으로 7790을 시작합니다.
8. `start_beta_background.ps1` 또는 현재 기록된 실행 명령으로 8021을 시작합니다.
9. 포트 7790과 8021의 Listen 상태를 확인합니다.
10. Beta 제작, Gemini, TTS, SRT, MP3, MP4, 보관함 상세를 순서대로 검증합니다.

## 주의

- 이 백업 스크립트는 원본 파일을 삭제하거나 이동하지 않습니다.
- 복원 시 기존 정상 폴더에 즉시 덮어쓰지 말고 별도 경로에서 먼저 검증합니다.
- Git 미커밋 변경은 `RESTORE_INFO\GIT\git_diff_worktree.patch`와 `git_diff_staged.patch`에 기록됩니다.
"@

$restoreGuideContent |
    Out-File -LiteralPath $RestoreGuide -Encoding utf8

if ($script:Warnings.Count -gt 0) {
    $script:Warnings |
        Out-File -LiteralPath (Join-Path $Destination 'BACKUP_WARNINGS.txt') -Encoding utf8
}

if ($script:Errors.Count -gt 0) {
    $script:Errors |
        Out-File -LiteralPath $ErrorLogPath -Encoding utf8

    Write-Log "Backup finished with errors. Errors=$($script:Errors.Count) Warnings=$($script:Warnings.Count)" 'ERROR'
    throw "Backup verification failed. See $ErrorLogPath"
}

@"
STATUS=PASS
CREATED=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
SOURCE=$SourceRoot
DESTINATION=$Destination
FILES=$fileCount
BYTES=$totalBytes
WARNINGS=$($script:Warnings.Count)
ERRORS=0
SQLITE_INTEGRITY=See RESTORE_INFO\sqlite_backup_integrity_check.txt
GIT_HEAD=$gitHead
"@ |
    Out-File -LiteralPath (Join-Path $Destination 'BACKUP_COMPLETE.txt') -Encoding utf8

Write-Log "Backup completed successfully. Files=$fileCount Bytes=$totalBytes Warnings=$($script:Warnings.Count)" 'OK'

Write-Host ''
Write-Host '============================================================'
Write-Host ' StoryMaker Beta complete rollback backup completed'
Write-Host " Snapshot: $Destination"
Write-Host " Files: $fileCount"
Write-Host " Bytes: $totalBytes"
Write-Host " Warnings: $($script:Warnings.Count)"
Write-Host ' Status: PASS'
Write-Host '============================================================'
