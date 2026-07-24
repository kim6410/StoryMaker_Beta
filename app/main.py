from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sqlite3

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.beta_jobs import beta_jobs_router
from app.beta_gemini import beta_gemini_router
from app.beta_browser import beta_browser_router
from app.beta_steps import beta_steps_router
from app.beta_gemini_worker import beta_gemini_worker_router
from app.beta_shortform import beta_shortform_router

ROOT = Path(r"F:\StoryMaker_beta")
STATIC_DIR = ROOT / "static"
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "storymaker_beta.db"
JOBS_DIR = DATA_DIR / "jobs"
MEDIA_DIR = DATA_DIR / "media"
ARCHIVE_DIR = DATA_DIR / "archive"
LOGS_DIR = ROOT / "logs"

for directory in (STATIC_DIR, DATA_DIR, JOBS_DIR, MEDIA_DIR, ARCHIVE_DIR, LOGS_DIR):
    directory.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="StoryMaker Beta", version="0.2.0")
app.mount("/beta-static", StaticFiles(directory=STATIC_DIR), name="beta-static")
app.include_router(beta_jobs_router)
app.include_router(beta_gemini_router)
app.include_router(beta_browser_router)
app.include_router(beta_steps_router)
app.include_router(beta_gemini_worker_router)
app.include_router(beta_shortform_router)


def connect_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


@app.get("/beta")
def beta_root() -> FileResponse:
    return FileResponse(STATIC_DIR / "production.html")


@app.get("/beta/production")
def beta_production() -> FileResponse:
    return FileResponse(STATIC_DIR / "production.html")


@app.get("/beta/archive")
def beta_archive() -> FileResponse:
    return FileResponse(STATIC_DIR / "archive.html")


@app.get("/beta/browser-render")
def beta_browser_render() -> FileResponse:
    return FileResponse(STATIC_DIR / "browser-render.html")


@app.get("/beta-api/health")
def beta_health() -> JSONResponse:
    return JSONResponse({
        "ok": True,
        "service": "storymaker-beta",
        "api_prefix": "/beta-api",
        "root": str(ROOT),
        "database": str(DB_PATH),
        "jobs": str(JOBS_DIR),
        "media": str(MEDIA_DIR),
        "archive": str(ARCHIVE_DIR),
        "v1_shared_api": False,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    })


@app.get("/beta-api/archive")
def beta_archive_list() -> JSONResponse:
    with connect_db() as connection:
        table = connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='beta_jobs'").fetchone()
        if not table:
            return JSONResponse({"ok": True, "items": []})
        rows = connection.execute("SELECT beta_job_id, title, status, created_at FROM beta_jobs ORDER BY created_at DESC").fetchall()
    return JSONResponse({"ok": True, "items": [dict(row) for row in rows]})
