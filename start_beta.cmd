@echo off
cd /d F:\StoryMaker_beta
F:\StoryMaker_beta\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8021
