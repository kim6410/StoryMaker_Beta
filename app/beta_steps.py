from __future__ import annotations

import json
import hashlib
import re
import random
import subprocess
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

ROOT = Path(r"F:\StoryMaker_beta")
JOBS = ROOT / "data" / "jobs"
FFMPEG = ROOT / "tools" / "ffmpeg.exe"
SUPERTONIC = "http://127.0.0.1:7790"

beta_steps_router = APIRouter(prefix="/beta-api/steps", tags=["beta-steps"])


def job_dir(job_id: str) -> Path:
    if not job_id.startswith("beta_"):
        raise HTTPException(status_code=400, detail="잘못된 작업 ID")
    path = JOBS / job_id
    if not path.exists():
        raise HTTPException(status_code=404, detail="작업 없음")
    return path


def read_result(path: Path) -> dict[str, Any]:
    return json.loads((path / "result.json").read_text(encoding="utf-8"))


def write_result(path: Path, result: dict[str, Any]) -> None:
    target = path / "result.json"
    temp = target.with_suffix(".json.tmp")
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(target)


def srt_time(seconds: float) -> str:
    milliseconds = int(round(max(0.0, seconds) * 1000))
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    secs, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"


def probe_duration(path: Path) -> float:
    completed = subprocess.run(
        [str(FFMPEG), "-hide_banner", "-i", str(path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", completed.stderr)
    if not match:
        raise RuntimeError("음성 길이를 확인하지 못했습니다.")
    return int(match.group(1)) * 3600 + int(match.group(2)) * 60 + float(match.group(3))


def clean_dialogue_text(value: str) -> str:
    text = re.sub(r"^\s*(?:여자|여성|female|F1)\s*[:：]\s*", "", value, flags=re.I)
    text = re.sub(r"^\s*(?:남자|남성|male|M1)\s*[:：]\s*", "", text, flags=re.I)
    return text.strip()


def split_dialogue(script: str) -> list[dict[str, str]]:
    raw_lines = [line.strip() for line in str(script or "").splitlines() if line.strip()]
    segments: list[dict[str, str]] = []
    expected = "F1"
    for raw in raw_lines:
        match = re.match(r"^\s*(여자|여성|female|F1|남자|남성|male|M1)\s*[:：]\s*(.+)$", raw, flags=re.I)
        if match:
            label = match.group(1).lower()
            voice = "F1" if label in {"여자", "여성", "female", "f1"} else "M1"
            text = match.group(2).strip()
        else:
            voice = expected
            text = clean_dialogue_text(raw)
        if text:
            segments.append({"voice": voice, "speaker": "여자" if voice == "F1" else "남자", "text": text})
            expected = "M1" if voice == "F1" else "F1"
    if segments:
        return segments
    sentences = [item.strip() for item in re.split(r"(?<=[.!?。])\s+|\n+", script) if item.strip()]
    for index, text in enumerate(sentences):
        voice = "F1" if index % 2 == 0 else "M1"
        segments.append({"voice": voice, "speaker": "여자" if voice == "F1" else "남자", "text": text})
    return segments


def request_supertonic(text: str, voice: str, speed: float = 1.05) -> bytes:
    payload = json.dumps(
        {
            "model": "supertonic-3",
            "input": text,
            "voice": voice,
            "response_format": "wav",
            "speed": speed,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        SUPERTONIC + "/v1/audio/speech",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=240) as response:
        audio = response.read()
    if len(audio) < 44 or not audio.startswith(b"RIFF"):
        raise RuntimeError(f"{voice} 음성이 유효한 WAV가 아닙니다.")
    return audio


def concatenate_wavs(parts: list[Path], target: Path) -> None:
    if not parts:
        raise RuntimeError("결합할 음성 조각이 없습니다.")
    command = [str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y"]
    for part in parts:
        command.extend(["-i", str(part)])
    filter_complex = "".join(f"[{index}:a]" for index in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[outa]"
    command.extend(["-filter_complex", filter_complex, "-map", "[outa]", "-ar", "44100", "-ac", "1", str(target)])
    subprocess.run(command, check=True)


def write_dialogue_srt(segments: list[dict[str, Any]], target: Path) -> None:
    cursor = 0.0
    blocks: list[str] = []
    for index, segment in enumerate(segments, start=1):
        duration = float(segment.get("duration") or 0.0)
        end = cursor + max(duration, 0.25)
        text = str(segment.get("text") or "").strip()
        blocks.append(f"{index}\n{srt_time(cursor)} --> {srt_time(end)}\n{text}\n")
        cursor = end
    target.write_text("\n".join(blocks), encoding="utf-8")


@beta_steps_router.get("/jobs/{job_id}/inspect")
def inspect_job(job_id: str) -> JSONResponse:
    path = job_dir(job_id)
    result = read_result(path)
    output = path / "output"
    return JSONResponse(
        {
            "ok": True,
            "checks": {
                "result_json": (path / "result.json").exists(),
                "podcast_script": (path / "podcast_script.txt").exists(),
                "voice_wav": (output / "voice.wav").exists(),
                "voice_mp3": (output / "voice.mp3").exists(),
                "subtitle_srt": (output / "subtitle.srt").exists(),
                "dialogue_manifest": (output / "dialogue_segments.json").exists(),
                "browser_mp3": (output / "browser" / "browser_podcast.mp3").exists(),
                "browser_mp4": (output / "browser" / "browser_final.mp4").exists(),
                "thumbnail_prompt": (path / "thumbnail_prompt.md").exists(),
                "gemini_applied": bool(result.get("gemini", {}).get("applied")),
            },
        }
    )


@beta_steps_router.get("/supertonic/status")
def supertonic_status() -> JSONResponse:
    try:
        with urllib.request.urlopen(SUPERTONIC + "/v1/health", timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
        return JSONResponse({"ok": True, "port": 7790, "root": str(ROOT / "Supertonic3"), "upstream": data})
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Beta Supertonic 연결 실패: {exc}")


@beta_steps_router.post("/jobs/{job_id}/supertonic")
async def create_supertonic_voice(job_id: str, request: Request) -> JSONResponse:
    try:
        settings = await request.json()
    except Exception:
        settings = {}
    female_voice = str(settings.get("female_voice") or "F1")
    male_voice = str(settings.get("male_voice") or "M1")
    if female_voice == "random":
        female_voice = random.choice(["F1", "F2", "F3", "F4", "F5"])
    if male_voice == "random":
        male_voice = random.choice(["M1", "M2", "M3", "M4", "M5"])
    speed = max(0.7, min(float(settings.get("voice_speed", 1.05) or 1.05), 1.8))
    voice_volume = max(0.0, min(float(settings.get("voice_volume", 0.8) or 0.8), 1.5))
    path = job_dir(job_id)
    result = read_result(path)
    content = result.get("content", {})
    script = content.get("podcast_50") or content.get("podcast_script") or content.get("script") or ""
    if not str(script).strip():
        raise HTTPException(status_code=400, detail="PODCAST_50 대본이 없습니다.")

    segments = split_dialogue(str(script))
    if not segments:
        raise HTTPException(status_code=400, detail="여자·남자 대화 문장을 분리하지 못했습니다.")

    output = path / "output"
    parts_dir = output / "dialogue_parts"
    output.mkdir(exist_ok=True)
    parts_dir.mkdir(exist_ok=True)
    part_paths: list[Path] = []

    try:
        for index, segment in enumerate(segments, start=1):
            segment["voice"] = female_voice if str(segment.get("voice", "")).upper().startswith("F") else male_voice
            audio = request_supertonic(segment["text"], segment["voice"], speed)
            part_path = parts_dir / f"{index:03d}_{segment['voice']}.wav"
            part_path.write_bytes(audio)
            segment["duration"] = round(probe_duration(part_path), 3)
            segment["file"] = str(part_path)
            part_paths.append(part_path)
        wav_path = output / "voice.wav"
        concatenate_wavs(part_paths, wav_path)
        if abs(voice_volume - 1.0) > 0.001:
            adjusted = output / "voice_adjusted.wav"
            subprocess.run([str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path), "-filter:a", f"volume={voice_volume}", str(adjusted)], check=True)
            adjusted.replace(wav_path)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"여자·남자 Supertonic 대화 음성 생성 실패: {exc}")

    mp3_path = output / "voice.mp3"
    subprocess.run(
        [str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path), "-c:a", "libmp3lame", "-q:a", "3", str(mp3_path)],
        check=True,
    )
    subtitle_path = output / "subtitle.srt"
    write_dialogue_srt(segments, subtitle_path)
    duration = probe_duration(wav_path)
    (output / "dialogue_segments.json").write_text(json.dumps(segments, ensure_ascii=False, indent=2), encoding="utf-8")

    script_hash = hashlib.sha256(script.encode("utf-8")).hexdigest()
    result.setdefault("assets", {})["audio"] = str(mp3_path)
    result["assets"]["subtitle"] = str(subtitle_path)
    result["assets"]["voice_script_hash"] = script_hash
    result["duration_seconds"] = round(duration, 3)
    result["tts"] = {
        "engine": "beta-supertonic-dialogue",
        "port": 7790,
        "voices": {"female": female_voice, "male": male_voice},
        "speed": speed,
        "volume": voice_volume,
        "segments": len(segments),
    }
    write_result(path, result)
    return JSONResponse(
        {
            "ok": True,
            "dialogue": True,
            "segments": len(segments),
            "voices": {"female": female_voice, "male": male_voice},
        "speed": speed,
        "volume": voice_volume,
            "mp3": str(mp3_path),
            "subtitle": str(subtitle_path),
            "duration_seconds": round(duration, 3),
        }
    )
