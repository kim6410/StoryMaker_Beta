from __future__ import annotations

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
LOCK = threading.Lock()
REQUIRED_WORKER_ID = "tampermonkey-beta-v2-2.1.1"

beta_gemini_worker_router = APIRouter(prefix="/beta-api/gemini-worker", tags=["beta-gemini-worker"])


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
    script = content["podcast_80"]
    (job_dir / "script.txt").write_text(script, encoding="utf-8")
    (job_dir / "podcast_script.txt").write_text(script, encoding="utf-8")
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
    state = read_state()
    data = {k: v for k, v in state.items() if k != "prompt"}
    data["required_worker_id"] = REQUIRED_WORKER_ID
    return {"ok": True, "data": data}


@beta_gemini_worker_router.get("/prompt/{job_id}")
def worker_prompt(job_id: str) -> dict[str, Any]:
    state = read_state()
    if state.get("job_id") != job_id:
        raise HTTPException(status_code=404, detail="대기 중인 작업이 아닙니다.")
    return {"ok": True, "job_id": job_id, "prompt": state.get("prompt", "")}


@beta_gemini_worker_router.post("/ack")
def worker_ack(payload: WorkerAck) -> dict[str, Any]:
    if payload.worker_id != REQUIRED_WORKER_ID:
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
