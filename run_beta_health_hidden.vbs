Option Explicit
Dim shell, command
Set shell = CreateObject("WScript.Shell")
command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ""F:\StoryMaker_beta\check_beta_health.ps1"""
shell.Run command, 0, False
Set shell = Nothing
