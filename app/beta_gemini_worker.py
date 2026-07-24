from __future__ import annotations

import base64
import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.beta_gemini import BetaGeminiRequest, beta_build_prompt, beta_parse_content

ROOT = Path(r"F:\StoryMaker_beta")
JOBS_DIR = ROOT / "data" / "jobs"
STATE_PATH = ROOT / "data" / "beta_gemini_worker_state.json"
THUMB_STATE_PATH = ROOT / "data" / "beta_thumbnail_worker_state.json"
LOCK = threading.Lock()
REQUIRED_WORKER_ID = "tampermonkey-beta-v2-2.1.6"
ALLOWED_WORKER_IDS = {
    "tampermonkey-beta-v2-2.1.2",
    "tampermonkey-beta-v2-2.1.3",
    "tampermonkey-beta-v2-2.1.4",
    "tampermonkey-beta-v2-2.1.5",
    "tampermonkey-beta-v2-2.1.6",
}

beta_gemini_worker_router = APIRouter(prefix="/beta-api/gemini-worker", tags=["beta-gemini-worker"])




class ThumbnailResult(BaseModel):
    job_id: str
    worker_id: str = ""
    data_url: str

class WorkerAck(BaseModel):
    job_id: str
    status: str = "claimed"
    worker_id: str = ""
    error: str | None = None


class WorkerResult(BaseModel):
    job_id: str
    result_text: str
    result_raw: str | None = None
    source: str = "beta-gemini-web-worker"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def seconds_since(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return max(0.0, (datetime.now(timezone.utc) - parsed).total_seconds())
    except Exception:
        return 0.0


def read_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {"status": "idle", "updated_at": now_iso()}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"status": "idle", "updated_at": now_iso()}


def write_state(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = now_iso()
    tmp = STATE_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(STATE_PATH)


def valid_job_id(job_id: str) -> bool:
    return bool(job_id.startswith("beta_") and re.fullmatch(r"[A-Za-z0-9_-]+", job_id))


def load_job(job_id: str) -> tuple[Path, Path, dict[str, Any]]:
    if not valid_job_id(job_id):
        raise HTTPException(status_code=400, detail="잘못된 Beta 작업 ID입니다.")
    job_dir = JOBS_DIR / job_id
    result_path = job_dir / "result.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Beta 작업을 찾을 수 없습니다.")
    return job_dir, result_path, json.loads(result_path.read_text(encoding="utf-8"))


def save_content(job_id: str, raw_text: str, source: str) -> dict[str, Any]:
    job_dir, result_path, result = load_job(job_id)
    image_count = max(1, len(result.get("assets", {}).get("images", [])))
    try:
        content = beta_parse_content(raw_text, image_count)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Gemini JSON 해석 실패: {exc}")

    content["provider"] = "gemini-web-worker"
    content["model"] = "gemini-web"
    content["podcast_script"] = content.get("script", "")
    result["content"] = content
    result["title"] = content.get("title") or result.get("title")
    result["gemini"] = {
        "provider": "gemini-web-worker",
        "model": "gemini-web",
        "applied": True,
        "source": source,
        "completed_at": now_iso(),
    }

    channels_dir = job_dir / "channels"
    channels_dir.mkdir(parents=True, exist_ok=True)
    for key in content["channel_order"]:
        (channels_dir / f"{key}.txt").write_text(content["channels"][key]["content"] + "\n", encoding="utf-8")

    (job_dir / "podcast_50.txt").write_text(content["podcast_50"], encoding="utf-8")
    (job_dir / "podcast_80.txt").write_text(content["podcast_80"], encoding="utf-8")
    script = content["podcast_50"]
    (job_dir / "script.txt").write_text(script, encoding="utf-8")
    (job_dir / "podcast_script.txt").write_text(script, encoding="utf-8")
    thumbnail_prompt = str(content.get("thumbnail_prompt") or "").strip()
    if thumbnail_prompt:
        (job_dir / "thumbnail_prompt.md").write_text(thumbnail_prompt + "\n", encoding="utf-8")
        result.setdefault("assets", {})["thumbnail_prompt"] = str(job_dir / "thumbnail_prompt.md")
    (job_dir / "gemini_raw.txt").write_text(raw_text, encoding="utf-8")

    tmp = result_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(result_path)
    return result


@beta_gemini_worker_router.post("/jobs/{job_id}/queue")
def queue_job(job_id: str) -> dict[str, Any]:
    _, _, result = load_job(job_id)
    payload = BetaGeminiRequest(
        business=result.get("business", {}),
        topic=result.get("topic", ""),
        image_count=max(1, len(result.get("assets", {}).get("images", []))),
    )
    with LOCK:
        state = {
            "job_id": job_id,
            "project_title": result.get("title") or result.get("topic") or "Beta 프로젝트",
            "status": "pending",
            "action": "GENERATE_BETA_GEMINI",
            "prompt": beta_build_prompt(payload),
            "error": None,
            "worker_id": None,
            "queued_at": now_iso(),
        }
        write_state(state)
    return {"ok": True, "state": {k: v for k, v in state.items() if k != "prompt"}}


@beta_gemini_worker_router.get("/status")
def worker_status() -> dict[str, Any]:
    with LOCK:
        state = read_state()
        if state.get("status") == "claimed" and seconds_since(state.get("updated_at")) >= 40:
            retry_count = int(state.get("auto_retry_count", 0) or 0)
            if retry_count < 1:
                state["status"] = "pending"
                state["worker_id"] = None
                state["error"] = None
                state["auto_retry_count"] = retry_count + 1
                state["retry_reason"] = "claimed_timeout"
                write_state(state)
            else:
                state["status"] = "error"
                state["error"] = "Gemini가 작업을 가져갔지만 40초 안에 전송하지 못했습니다. Gemini 탭을 확인한 뒤 재전송하세요."
                state["retry_available"] = True
                write_state(state)
        data = {k: v for k, v in state.items() if k != "prompt"}
    data["required_worker_id"] = REQUIRED_WORKER_ID
    return {"ok": True, "data": data}


@beta_gemini_worker_router.post("/jobs/{job_id}/retry")
def retry_job(job_id: str) -> dict[str, Any]:
    load_job(job_id)
    with LOCK:
        state = read_state()
        if state.get("job_id") != job_id:
            raise HTTPException(status_code=409, detail="현재 Gemini 작업 ID와 일치하지 않습니다.")
        if not state.get("prompt"):
            _, _, result = load_job(job_id)
            payload = BetaGeminiRequest(
                business=result.get("business", {}),
                topic=result.get("topic", ""),
                image_count=max(1, len(result.get("assets", {}).get("images", []))),
            )
            state["prompt"] = beta_build_prompt(payload)
        state["status"] = "pending"
        state["worker_id"] = None
        state["error"] = None
        state["retry_available"] = False
        state["manual_retry_count"] = int(state.get("manual_retry_count", 0) or 0) + 1
        state["retried_at"] = now_iso()
        write_state(state)
    return {"ok": True, "state": {k: v for k, v in state.items() if k != "prompt"}}


@beta_gemini_worker_router.get("/prompt/{job_id}")
def worker_prompt(job_id: str) -> dict[str, Any]:
    state = read_state()
    if state.get("job_id") != job_id:
        raise HTTPException(status_code=404, detail="대기 중인 작업이 아닙니다.")
    return {"ok": True, "job_id": job_id, "prompt": state.get("prompt", "")}


@beta_gemini_worker_router.post("/ack")
def worker_ack(payload: WorkerAck) -> dict[str, Any]:
    if payload.worker_id not in ALLOWED_WORKER_IDS:
        raise HTTPException(
            status_code=426,
            detail=f"구형 Beta Worker는 차단되었습니다. {REQUIRED_WORKER_ID}를 설치하세요.",
        )
    with LOCK:
        state = read_state()
        if state.get("job_id") != payload.job_id:
            raise HTTPException(status_code=409, detail="현재 작업 ID와 일치하지 않습니다.")
        state["status"] = payload.status
        state["worker_id"] = payload.worker_id
        state["error"] = payload.error
        write_state(state)
    return {"ok": True, "status": payload.status, "worker_id": payload.worker_id}


@beta_gemini_worker_router.post("/result")
def worker_result(payload: WorkerResult) -> dict[str, Any]:
    result = save_content(payload.job_id, payload.result_text, payload.source)
    with LOCK:
        state = read_state()
        if state.get("job_id") == payload.job_id:
            state["status"] = "completed"
            state["completed_at"] = now_iso()
            state["error"] = None
            state.pop("prompt", None)
            write_state(state)
    return {"ok": True, "job": result}



def read_thumb_state() -> dict[str, Any]:
    if not THUMB_STATE_PATH.exists():
        return {"status": "idle", "action": None, "updated_at": now_iso()}
    try:
        return json.loads(THUMB_STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"status": "idle", "action": None, "updated_at": now_iso()}


def write_thumb_state(state: dict[str, Any]) -> None:
    THUMB_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = now_iso()
    tmp = THUMB_STATE_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(THUMB_STATE_PATH)


@beta_gemini_worker_router.post("/jobs/{job_id}/thumbnail/queue")
def queue_thumbnail(job_id: str) -> dict[str, Any]:
    job_dir, _, result = load_job(job_id)
    prompt = str(result.get("content", {}).get("thumbnail_prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="AI 썸네일 프롬프트가 없습니다.")
    full_prompt = (
        prompt
        + "\n\n위 지시대로 실제 9:16 세로형 썸네일 이미지를 생성하세요. "
          "설명문이나 코드 없이 이미지 결과만 생성하세요."
    )
    with LOCK:
        current = read_thumb_state()
        if current.get("job_id") == job_id and current.get("status") in {"pending", "claimed", "sent", "completed"}:
            return {"ok": True, "state": {k: v for k, v in current.items() if k != "prompt"}}
        state = {
            "action": "GENERATE_BETA_THUMBNAIL",
            "job_id": job_id,
            "status": "pending",
            "prompt": full_prompt,
            "worker_id": None,
            "error": None,
            "queued_at": now_iso(),
        }
        write_thumb_state(state)
    return {"ok": True, "state": {k: v for k, v in state.items() if k != "prompt"}}


@beta_gemini_worker_router.get("/thumbnail/status")
def thumbnail_status() -> dict[str, Any]:
    with LOCK:
        gemini_state = read_state()
        if gemini_state.get("action") == "GENERATE_BETA_GEMINI" and gemini_state.get("status") in {"pending", "claimed", "sent"}:
            return {
                "ok": True,
                "data": {
                    "status": "idle",
                    "action": None,
                    "deferred_for_gemini_job_id": gemini_state.get("job_id"),
                    "updated_at": now_iso(),
                },
            }
        state = read_thumb_state()
        return {"ok": True, "data": state}


@beta_gemini_worker_router.post("/thumbnail/ack")
def thumbnail_ack(payload: WorkerAck) -> dict[str, Any]:
    validate_worker(payload.worker_id)
    with LOCK:
        state = read_thumb_state()
        if state.get("job_id") != payload.job_id:
            raise HTTPException(status_code=409, detail="다른 썸네일 작업입니다.")
        state["status"] = payload.status
        state["worker_id"] = payload.worker_id
        state["error"] = payload.error
        write_thumb_state(state)
    return {"ok": True}


@beta_gemini_worker_router.post("/thumbnail/result")
def thumbnail_result(payload: ThumbnailResult) -> dict[str, Any]:
    validate_worker(payload.worker_id)
    job_dir, result_path, result = load_job(payload.job_id)
    match = re.match(r"^data:image/(png|jpeg|jpg|webp);base64,(.+)$", payload.data_url, flags=re.I | re.S)
    if not match:
        raise HTTPException(status_code=400, detail="올바른 이미지 데이터가 아닙니다.")
    ext = "jpg" if match.group(1).lower() in {"jpeg", "jpg"} else match.group(1).lower()
    try:
        raw = base64.b64decode(match.group(2), validate=False)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"썸네일 디코딩 실패: {exc}")
    if len(raw) < 10_000:
        raise HTTPException(status_code=400, detail="썸네일 이미지가 너무 작습니다.")
    out = job_dir / "output"
    out.mkdir(exist_ok=True)
    target = out / f"thumbnail.{ext}"
    target.write_bytes(raw)
    # archive API expects thumbnail.jpg; normalize through ffmpeg only when needed
    final = out / "thumbnail.jpg"
    if target != final:
        import subprocess
        ffmpeg = ROOT / "tools" / "ffmpeg.exe"
        subprocess.run([str(ffmpeg), "-hide_banner", "-loglevel", "error", "-y", "-i", str(target), str(final)], check=True)
    else:
        final = target
    result.setdefault("assets", {})["thumbnail"] = str(final)
    result.setdefault("thumbnail", {})["source"] = "gemini-web-worker"
    tmp = result_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(result_path)
    with LOCK:
        state = read_thumb_state()
        state.update({"status": "completed", "worker_id": payload.worker_id, "thumbnail": str(final), "error": None})
        write_thumb_state(state)
    return {"ok": True, "thumbnail": str(final)}
