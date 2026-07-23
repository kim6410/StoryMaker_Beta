$ErrorActionPreference = 'Stop'

$root = 'F:\StoryMaker_beta\Supertonic3'
$python = Join-Path $root '.venv\Scripts\python.exe'
$supertonic = Join-Path $root '.venv\Scripts\supertonic.exe'
$logDir = 'F:\StoryMaker_beta\logs'

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$listener = Get-NetTCPConnection -LocalPort 7790 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    exit 0
}

$env:SUPERTONIC_CACHE_DIR = Join-Path $root 'model_cache'

Start-Process `
    -FilePath $python `
    -ArgumentList @(
        $supertonic,
        'serve',
        '--host', '127.0.0.1',
        '--port', '7790',
        '--model', 'supertonic-3',
        '--cors', 'http://127.0.0.1:8021',
        '--log-level', 'info'
    ) `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir 'beta-supertonic-7790.stdout.log') `
    -RedirectStandardError (Join-Path $logDir 'beta-supertonic-7790.stderr.log')
