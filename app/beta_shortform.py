from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import hashlib
import json
import re
import random
import subprocess
import shutil
import sqlite3

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

ROOT = Path(r"F:\StoryMaker_beta")
DB_PATH = ROOT / "data" / "storymaker_beta.db"
JOBS_DIR = ROOT / "data" / "jobs"

beta_shortform_router = APIRouter(prefix="/beta-api/shortform", tags=["beta-shortform"])

DEFAULT_SETTINGS: dict[str, Any] = {
    "female_voice": "random",
    "male_voice": "random",
    "voice_speed": 1.35,
    "voice_volume": 0.8,
    "bgm_mood": "random",
    "bgm_volume": 0.15,
    "fps": 24,
    "transition_type": "random",
    "transition_duration": 0.45,
    "subtitle_font_size": 30,
    "subtitle_position": "bottom",
    "subtitle_color": "#ffffff",
    "subtitle_outline": True,
    "brand_font_size": 46,
    "phone_font_size": 43,
    "watermark_position": "bottom-right",
    "bottom_margin": 80,
}


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_tables() -> None:
    with connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS beta_shortform_user_settings (
                user_key TEXT PRIMARY KEY,
                settings_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_job_dir(job_id: str) -> Path:
    if not re.fullmatch(r"beta_[0-9A-Za-z_-]+", job_id or ""):
        raise HTTPException(status_code=400, detail="잘못된 Beta 작업 ID입니다.")
    path = JOBS_DIR / job_id
    if not path.exists():
        raise HTTPException(status_code=404, detail="Beta 작업을 찾을 수 없습니다.")
    return path


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def user_key(request: Request) -> str:
    cookie = request.headers.get("cookie", "").strip()
    forwarded = request.headers.get("x-forwarded-for", "").strip()
    identity = cookie or forwarded or (request.client.host if request.client else "local") or "local"
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]


def compact_title(value: str, limit: int = 22) -> str:
    text = re.sub(r"\s+", " ", (value or "").strip())
    if len(text) <= limit:
        return text
    pieces = re.split(r"[,|·/\-–—:]|\s{2,}", text)
    for piece in pieces:
        piece = piece.strip()
        if 6 <= len(piece) <= limit:
            return piece
    words = text.split()
    selected: list[str] = []
    for word in words:
        candidate = " ".join([*selected, word])
        if len(candidate) > limit:
            break
        selected.append(word)
    return " ".join(selected) or text[:limit]


init_tables()


@beta_shortform_router.get("/jobs/{job_id}/context")
def shortform_context(job_id: str, request: Request) -> JSONResponse:
    job_dir = safe_job_dir(job_id)
    result = read_json(job_dir / "result.json")
    content = result.get("content", {}) or {}
    channels = content.get("channels", {}) or {}
    blog = channels.get("BLOG", {}) if isinstance(channels, dict) else {}
    blog_text = str(blog.get("content") or content.get("title") or result.get("title") or "")
    blog_title = ""
    for line in blog_text.splitlines():
        cleaned = line.strip(" #*-\t")
        if cleaned and not cleaned.lower().startswith(("저장 키", "추천 제목", "[추천 제목", "blog")):
            blog_title = cleaned
            break
    business = result.get("business", {}) or {}
    images = result.get("assets", {}).get("images", []) or []
    videos = result.get("assets", {}).get("videos", []) or []
    script = content.get("podcast_50") or channels.get("PODCAST_50", {}).get("content") or ""
    with connect() as connection:
        row = connection.execute(
            "SELECT settings_json FROM beta_shortform_user_settings WHERE user_key=?",
            (user_key(request),),
        ).fetchone()
    settings = dict(DEFAULT_SETTINGS)
    if row:
        try:
            settings.update(json.loads(row["settings_json"]))
        except Exception:
            pass
    payload = {
        "job_id": job_id,
        "title_line_1": business.get("name") or "StoryMaker Beta",
        "title_line_2": compact_title(blog_title or result.get("title") or "StoryMaker Beta"),
        "business_name": business.get("name") or "",
        "business_phone": business.get("phone") or "",
        "script": script,
        "image_count": len(images),
        "video_count": len(videos),
        "images": [f"/beta-api/browser/jobs/{job_id}/image/{i}" for i in range(1, len(images) + 1)],
        "videos": [f"/beta-api/browser/jobs/{job_id}/video/{i}" for i in range(1, len(videos) + 1)],
        "settings": settings,
    }
    return JSONResponse({"ok": True, "context": payload})


@beta_shortform_router.put("/settings")
async def save_settings(request: Request) -> JSONResponse:
    payload = await request.json()
    settings = dict(DEFAULT_SETTINGS)
    if isinstance(payload, dict):
        settings.update(payload)
    stamp = now()
    key = user_key(request)
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO beta_shortform_user_settings(user_key, settings_json, created_at, updated_at)
            VALUES(?,?,?,?)
            ON CONFLICT(user_key) DO UPDATE SET settings_json=excluded.settings_json, updated_at=excluded.updated_at
            """,
            (key, json.dumps(settings, ensure_ascii=False), stamp, stamp),
        )
    return JSONResponse({"ok": True, "settings": settings})


@beta_shortform_router.post("/jobs/{job_id}/save")
async def save_shortform_result(
    job_id: str,
    shortform_mp4: UploadFile | None = File(None),
    shortform_mp3: UploadFile | None = File(None),
    shortform_srt: UploadFile | None = File(None),
    metadata: str = Form("{}"),
) -> JSONResponse:
    job_dir = safe_job_dir(job_id)
    output = job_dir / "output" / "shortform"
    output.mkdir(parents=True, exist_ok=True)
    saved: dict[str, str] = {}
    for upload, filename, key, minimum in (
        (shortform_mp4, "shortform_final.mp4", "shortform_video", 1024),
        (shortform_mp3, "shortform_audio.mp3", "shortform_audio", 128),
        (shortform_srt, "shortform_subtitle.srt", "shortform_subtitle", 16),
    ):
        if upload and upload.filename:
            target = output / filename
            with target.open("wb") as stream:
                shutil.copyfileobj(upload.file, stream)
            if target.stat().st_size < minimum:
                target.unlink(missing_ok=True)
                raise HTTPException(status_code=400, detail=f"{filename} 파일이 비어 있습니다.")
            saved[key] = str(target)
    try:
        meta = json.loads(metadata or "{}")
    except json.JSONDecodeError:
        meta = {"raw": metadata[:2000]}
    result_path = job_dir / "result.json"
    result = read_json(result_path)
    result.setdefault("assets", {}).update(saved)
    if "shortform_video" in saved:
        result["assets"]["browser_video"] = saved["shortform_video"]
    if "shortform_audio" in saved:
        result["assets"]["browser_audio"] = saved["shortform_audio"]
    result["shortform"] = {
        **(result.get("shortform") or {}),
        **meta,
        "saved_at": now(),
        "output_dir": str(output),
        "assets": saved,
    }
    write_json(result_path, result)
    (output / "settings.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return JSONResponse({"ok": True, "saved": saved, "shortform": result["shortform"]})


@beta_shortform_router.post("/jobs/{job_id}/prepare-audio")
async def prepare_shortform_audio(job_id: str, request: Request) -> JSONResponse:
    job_dir = safe_job_dir(job_id)
    payload = await request.json()
    output = job_dir / "output"
    voice = output / "voice.wav"
    if not voice.exists():
        raise HTTPException(status_code=409, detail="먼저 PODCAST_50 음성을 준비해야 합니다.")
    music_root = (ROOT / "media" / "music").resolve()
    music_candidates = [
        path for path in music_root.glob("*")
        if path.is_file()
        and path.suffix.lower() in {".mp3", ".wav", ".m4a", ".aac"}
        and path.name.lower() != "beta_test_music.mp3"
        and "voice" not in path.name.lower()
    ] if music_root.exists() else []
    if not music_candidates:
        raise HTTPException(status_code=404, detail="Beta 랜덤 배경음악 파일이 없습니다.")
    result_path = job_dir / "result.json"
    result = read_json(result_path)
    previous = str((result.get("shortform") or {}).get("selected_music") or "")
    previous_path = Path(previous).resolve() if previous and Path(previous).exists() else None
    previous_is_library_music = bool(
        previous_path
        and previous_path.parent == music_root
        and previous_path.name.lower() != "beta_test_music.mp3"
    )
    selected = previous_path if previous_is_library_music else random.choice(music_candidates)
    volume = max(0.0, min(float(payload.get("bgm_volume", 0.15) or 0.15), 0.5))
    shortform_dir = output / "shortform"
    shortform_dir.mkdir(parents=True, exist_ok=True)
    mixed = shortform_dir / "mixed_voice_music.wav"
    ffmpeg = ROOT / "tools" / "ffmpeg.exe"
    command = [str(ffmpeg), "-hide_banner", "-loglevel", "error", "-y", "-i", str(voice), "-stream_loop", "-1", "-i", str(selected), "-filter_complex", f"[1:a]volume={volume},afade=t=in:st=0:d=0.5[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]", "-map", "[a]", "-c:a", "pcm_s16le", str(mixed)]
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if completed.returncode != 0 or not mixed.exists() or mixed.stat().st_size < 1024:
        raise HTTPException(status_code=500, detail=completed.stderr.strip() or "배경음악 믹싱 실패")
    result.setdefault("shortform", {}).update({"selected_music": str(selected), "music_name": selected.name, "bgm_volume": volume, "mixed_audio": str(mixed)})
    result.setdefault("assets", {})["shortform_mixed_audio"] = str(mixed)
    write_json(result_path, result)
    return JSONResponse({"ok": True, "audio_url": f"/beta-api/shortform/jobs/{job_id}/mixed-audio", "music_name": selected.name})


@beta_shortform_router.get("/jobs/{job_id}/mixed-audio")
def shortform_mixed_audio(job_id: str):
    from fastapi.responses import FileResponse
    path = safe_job_dir(job_id) / "output" / "shortform" / "mixed_voice_music.wav"
    if not path.exists():
        raise HTTPException(status_code=404, detail="믹싱 오디오가 없습니다.")
    return FileResponse(path, media_type="audio/wav")
