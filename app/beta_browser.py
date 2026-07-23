from __future__ import annotations

from pathlib import Path
from typing import Any
import json
import shutil

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse

BETA_ROOT = Path(r"F:\StoryMaker_beta")
BETA_JOBS = BETA_ROOT / "data" / "jobs"

beta_browser_router = APIRouter(prefix="/beta-api/browser", tags=["beta-browser"])


def beta_browser_job_dir(beta_job_id: str) -> Path:
    if not beta_job_id.startswith("beta_") or any(ch not in "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-" for ch in beta_job_id):
        raise HTTPException(status_code=400, detail="잘못된 Beta 작업 ID입니다.")
    path = BETA_JOBS / beta_job_id
    if not path.exists():
        raise HTTPException(status_code=404, detail="Beta 작업을 찾을 수 없습니다.")
    return path


def beta_browser_result(job_dir: Path) -> dict[str, Any]:
    result_path = job_dir / "result.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="result.json이 없습니다.")
    return json.loads(result_path.read_text(encoding="utf-8"))


def beta_browser_write_result(job_dir: Path, result: dict[str, Any]) -> None:
    path = job_dir / "result.json"
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


@beta_browser_router.get("/capabilities")
def beta_browser_capabilities() -> JSONResponse:
    return JSONResponse({
        "ok": True,
        "required": {
            "webgpu": True,
            "wasm": True,
            "video_encoder_or_media_recorder_mp4": True,
            "audio_encoder_mp3": True,
        },
        "execution": "browser-only",
        "v1_runtime_reference": False,
        "beta_api_prefix": "/beta-api/browser",
    })


@beta_browser_router.get("/jobs/{beta_job_id}/manifest")
def beta_browser_manifest(beta_job_id: str) -> JSONResponse:
    job_dir = beta_browser_job_dir(beta_job_id)
    result = beta_browser_result(job_dir)
    images = result.get("assets", {}).get("images", [])
    output = job_dir / "output"
    manifest = {
        "beta_job_id": beta_job_id,
        "title": result.get("title", "Beta 제작"),
        "duration_seconds": result.get("duration_seconds"),
        "slots": result.get("content", {}).get("slots", []),
        "script": result.get("content", {}).get("podcast_script") or result.get("content", {}).get("script", ""),
        "images": [f"/beta-api/browser/jobs/{beta_job_id}/image/{index}" for index in range(1, len(images) + 1)],
        "voice_wav": f"/beta-api/browser/jobs/{beta_job_id}/voice-wav" if (output / "voice.wav").exists() else None,
        "music": f"/beta-api/browser/jobs/{beta_job_id}/music" if result.get("assets", {}).get("music") else None,
    }
    return JSONResponse({"ok": True, "manifest": manifest})


@beta_browser_router.get("/jobs/{beta_job_id}/image/{image_index}")
def beta_browser_image(beta_job_id: str, image_index: int) -> FileResponse:
    job_dir = beta_browser_job_dir(beta_job_id)
    result = beta_browser_result(job_dir)
    images = result.get("assets", {}).get("images", [])
    if image_index < 1 or image_index > len(images):
        raise HTTPException(status_code=404, detail="이미지가 없습니다.")
    path = Path(images[image_index - 1])
    if not path.exists():
        raise HTTPException(status_code=404, detail="이미지 파일이 없습니다.")
    return FileResponse(path)


@beta_browser_router.get("/jobs/{beta_job_id}/voice-wav")
def beta_browser_voice_wav(beta_job_id: str) -> FileResponse:
    path = beta_browser_job_dir(beta_job_id) / "output" / "voice.wav"
    if not path.exists():
        raise HTTPException(status_code=404, detail="브라우저 인코딩용 WAV가 없습니다. 먼저 대본 음성을 준비하세요.")
    return FileResponse(path, media_type="audio/wav")


@beta_browser_router.get("/jobs/{beta_job_id}/music")
def beta_browser_music(beta_job_id: str) -> FileResponse:
    job_dir = beta_browser_job_dir(beta_job_id)
    result = beta_browser_result(job_dir)
    value = result.get("assets", {}).get("music")
    path = Path(value) if value else None
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="배경음악이 없습니다.")
    return FileResponse(path)


@beta_browser_router.post("/jobs/{beta_job_id}/upload")
async def beta_browser_upload(
    beta_job_id: str,
    browser_mp3: UploadFile | None = File(None),
    browser_mp4: UploadFile | None = File(None),
    diagnostics: str = Form("{}"),
) -> JSONResponse:
    job_dir = beta_browser_job_dir(beta_job_id)
    output_dir = job_dir / "output" / "browser"
    output_dir.mkdir(parents=True, exist_ok=True)
    saved: dict[str, str] = {}
    if browser_mp3 and browser_mp3.filename:
        target = output_dir / "browser_podcast.mp3"
        with target.open("wb") as stream:
            shutil.copyfileobj(browser_mp3.file, stream)
        if target.stat().st_size < 128:
            raise HTTPException(status_code=400, detail="브라우저 MP3가 비어 있습니다.")
        saved["browser_audio"] = str(target)
    if browser_mp4 and browser_mp4.filename:
        target = output_dir / "browser_final.mp4"
        with target.open("wb") as stream:
            shutil.copyfileobj(browser_mp4.file, stream)
        if target.stat().st_size < 1024:
            raise HTTPException(status_code=400, detail="브라우저 MP4가 비어 있습니다.")
        saved["browser_video"] = str(target)
    try:
        diagnostic_data = json.loads(diagnostics or "{}")
    except json.JSONDecodeError:
        diagnostic_data = {"raw": diagnostics[:2000]}
    result = beta_browser_result(job_dir)
    result.setdefault("assets", {}).update(saved)
    result["browser_render"] = {"saved": bool(saved), "diagnostics": diagnostic_data}
    beta_browser_write_result(job_dir, result)
    (output_dir / "diagnostics.json").write_text(json.dumps(diagnostic_data, ensure_ascii=False, indent=2), encoding="utf-8")
    return JSONResponse({"ok": True, "saved": saved})


@beta_browser_router.get("/jobs/{beta_job_id}/file/{asset_name}")
def beta_browser_file(beta_job_id: str, asset_name: str) -> FileResponse:
    result = beta_browser_result(beta_browser_job_dir(beta_job_id))
    key = {"mp3": "browser_audio", "mp4": "browser_video"}.get(asset_name)
    if not key:
        raise HTTPException(status_code=404, detail="지원하지 않는 브라우저 파일입니다.")
    value = result.get("assets", {}).get(key)
    path = Path(value) if value else None
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="브라우저 생성 파일이 없습니다.")
    return FileResponse(path)
