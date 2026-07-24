@echo off
setlocal EnableExtensions
title StoryMaker Beta Snapshot Restore

if /i "%~1"=="__RUN_FROM_TEMP__" goto RUN_FROM_TEMP

set "TEMP_RESTORE=%TEMP%\StoryMakerBetaRestore_%RANDOM%_%RANDOM%"
mkdir "%TEMP_RESTORE%" >nul 2>&1
if not exist "%TEMP_RESTORE%" (
    echo Failed to create temporary restore folder.
    pause
    exit /b 1
)

for %%F in (V1_BETA_SNAPSHOT.ps1 V1_BETA_SNAPSHOT.bat V1_BETA_BACKUP.ps1 V1_BETA_BACKUP.bat) do (
    if exist "%~dp0%%F" copy /y "%~dp0%%F" "%TEMP_RESTORE%\%%F" >nul
)

if not exist "%TEMP_RESTORE%\V1_BETA_SNAPSHOT.ps1" (
    echo Failed to prepare temporary restore script.
    pause
    exit /b 1
)

fc /b "%~dp0V1_BETA_SNAPSHOT.ps1" "%TEMP_RESTORE%\V1_BETA_SNAPSHOT.ps1" >nul
if not "%errorlevel%"=="0" (
    echo Temporary restore script verification failed.
    pause
    exit /b 1
)

echo Requesting administrator privileges...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%TEMP_RESTORE%\V1_BETA_SNAPSHOT.bat' -ArgumentList '__RUN_FROM_TEMP__' -Verb RunAs"
exit /b

:RUN_FROM_TEMP
fltmc >nul 2>&1
if not "%errorlevel%"=="0" (
    echo Administrator privileges are required.
    pause
    exit /b 1
)

cd /d F:\
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0V1_BETA_SNAPSHOT.ps1"
set "RESTORE_EXIT=%errorlevel%"

if not "%RESTORE_EXIT%"=="0" (
    echo.
    echo Snapshot restore returned error code %RESTORE_EXIT%.
    pause
)

exit /b %RESTORE_EXIT%
