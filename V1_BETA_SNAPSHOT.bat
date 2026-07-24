@echo off
setlocal EnableExtensions
title StoryMaker Beta Snapshot Restore

if /i "%~1"=="__RUN_FROM_TEMP__" goto RUN_FROM_TEMP

set "TEMP_RESTORE=%TEMP%\StoryMakerBetaRestore"
if exist "%TEMP_RESTORE%" rmdir /s /q "%TEMP_RESTORE%"
mkdir "%TEMP_RESTORE%" >nul 2>&1

copy /y "%~dp0V1_BETA_SNAPSHOT.ps1" "%TEMP_RESTORE%\V1_BETA_SNAPSHOT.ps1" >nul
copy /y "%~f0" "%TEMP_RESTORE%\V1_BETA_SNAPSHOT.bat" >nul

if not exist "%TEMP_RESTORE%\V1_BETA_SNAPSHOT.ps1" (
    echo Failed to prepare temporary restore script.
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
