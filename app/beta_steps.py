from __future__ import annotations

import json
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

ROOT = Path(r"F:\StoryMaker_beta")
JOBS = ROOT / "data" / "jobs"
FFMPEG = ROOT / "tools" / "ffmpeg.exe"
SUPERTONIC = "http://127.0.0.1:7790"

beta_steps_router = APIRouter(prefix="/beta-api/steps", tags=["beta-steps"])


def job_dir(job_id: str) -> Path:
    if not job_id.startswith("beta_"):
        raise HTTPException(status_code=400, detail="잘못된 작업 ID")
    p = JOBS / job_id
    if not p.exists():
        raise HTTPException(status_code=404, detail="작업 없음")
    return p


def read_result(p: Path) -> dict[str, Any]:
    return json.loads((p / "result.json").read_text(encoding="utf-8"))


@beta_steps_router.get("/jobs/{job_id}/inspect")
def inspect_job(job_id: str) -> JSONResponse:
    p = job_dir(job_id)
    result = read_result(p)
    slots = list((p / "slots").glob("slot_*.txt")) if (p / "slots").exists() else []
    output = p / "output"
    return JSONResponse({"ok": True, "checks": {
        "result_json": (p / "result.json").exists(),
        "slot_count": len(slots),
        "podcast_script": (p / "podcast_script.txt").exists(),
        "voice_wav": (output / "voice.wav").exists(),
        "voice_mp3": (output / "voice.mp3").exists(),
        "subtitle_srt": (output / "subtitle.srt").exists(),
        "backend_mp4": (output / "final.mp4").exists(),
        "browser_mp3": (output / "browser" / "browser_podcast.mp3").exists(),
        "browser_mp4": (output / "browser" / "browser_final.mp4").exists(),
        "gemini_applied": bool(result.get("gemini", {}).get("applied")),
    }})


@beta_steps_router.get("/supertonic/status")
def supertonic_status() -> JSONResponse:
    try:
        with urllib.request.urlopen(SUPERTONIC + "/v1/health", timeout=5) as r:
            data = json.loads(r.read().decode("utf-8"))
        return JSONResponse({"ok": True, "port": 7790, "root": str(ROOT / "Supertonic3"), "upstream": data})
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Beta Supertonic 연결 실패: {exc}")


@beta_steps_router.post("/jobs/{job_id}/supertonic")
def create_supertonic_voice(job_id: str) -> JSONResponse:
    p = job_dir(job_id)
    result = read_result(p)
    script = result.get("content", {}).get("podcast_script") or result.get("content", {}).get("script") or ""
    if not script:
        raise HTTPException(status_code=400, detail="대본 없음")
    payload = json.dumps({"model":"supertonic-3","input":script,"voice":"F1","response_format":"wav","speed":1.05}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(SUPERTONIC + "/v1/audio/speech", data=payload, headers={"Content-Type":"application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            audio = r.read()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Supertonic 생성 실패: {exc}")
    if len(audio) < 44 or not audio.startswith(b"RIFF"):
        raise HTTPException(status_code=502, detail="유효한 WAV가 아님")
    out = p / "output"; out.mkdir(exist_ok=True)
    wav = out / "voice.wav"; wav.write_bytes(audio)
    import subprocess
    subprocess.run([str(FFMPEG),"-hide_banner","-loglevel","error","-y","-i",str(wav),"-c:a","libmp3lame","-q:a","3",str(out/"voice.mp3")], check=True)
    result.setdefault("assets", {})["audio"] = str(out / "voice.mp3")
    result["tts"] = {"engine":"beta-supertonic","port":7790,"voice":"F1"}
    (p / "result.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    return JSONResponse({"ok":True,"wav_bytes":len(audio),"mp3":str(out/"voice.mp3")})
