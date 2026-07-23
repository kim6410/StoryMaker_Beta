from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import json
import re
import secrets
import shutil
import sqlite3
import subprocess
import urllib.request
import urllib.error

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Request
from fastapi.responses import FileResponse, JSONResponse

BETA_ROOT = Path(r"F:\StoryMaker_beta")
BETA_DATA = BETA_ROOT / "data"
BETA_JOBS = BETA_DATA / "jobs"
BETA_DB = BETA_DATA / "storymaker_beta.db"
BETA_FFMPEG = BETA_ROOT / "tools" / "ffmpeg.exe"

BETA_INDUSTRY_LABELS = {
    "general": "일반 서비스", "home_repair": "집수리", "boiler_facility": "보일러·설비",
    "appliance_clean": "가전 청소", "general_cleaning": "청소업", "window_screen": "방충망",
    "key_doorlock": "열쇠·도어락", "lighting_electric": "조명·전기", "drain_unclog": "하수구·배관",
    "restaurant": "음식점", "meat_korean": "고기·한식", "bakery_dessert": "베이커리·디저트",
    "pub_bar": "주점", "mealkit_sidedish": "밀키트·반찬", "cafe": "카페",
    "workshop_class": "공방·클래스", "partyroom_studio": "파티룸·스튜디오",
    "beauty_wellness": "뷰티·웰니스", "hair_salon": "미용실", "nail_art": "네일아트",
    "skin_care": "피부관리", "fitness_pt": "피트니스·PT", "body_massage": "마사지",
    "car_repair": "자동차 정비", "car_detailing": "자동차 디테일링", "car_rental": "렌터카",
    "pet_beauty_hotel": "반려동물 미용·호텔", "veterinary_clinic": "동물병원", "flower_shop": "꽃집",
    "kids_cafe": "키즈카페", "real_estate": "부동산", "education_academy": "교육·학원",
    "study_cafe": "스터디카페", "professional_service": "전문 서비스", "moving_service": "이사 서비스",
    "camping": "캠핑", "logistics": "물류·3PL",
}

beta_jobs_router = APIRouter(prefix="/beta-api", tags=["beta-jobs"])


def beta_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def beta_safe(value: str, fallback: str = "item") -> str:
    cleaned = re.sub(r"[^0-9A-Za-z가-힣._-]+", "_", (value or "").strip()).strip("._")
    return cleaned[:100] or fallback


def beta_write_json(path: Path, payload: dict[str, Any]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def beta_read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def beta_connect() -> sqlite3.Connection:
    connection = sqlite3.connect(BETA_DB)
    connection.row_factory = sqlite3.Row
    return connection


def beta_init() -> None:
    BETA_JOBS.mkdir(parents=True, exist_ok=True)
    with beta_connect() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS beta_jobs (
                beta_job_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                status TEXT NOT NULL,
                progress INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                completed_at TEXT,
                result_json TEXT NOT NULL
            )
        """)


def beta_job_dir(beta_job_id: str) -> Path:
    if beta_safe(beta_job_id) != beta_job_id or not beta_job_id.startswith("beta_"):
        raise HTTPException(status_code=400, detail="잘못된 Beta 작업 ID입니다.")
    path = BETA_JOBS / beta_job_id
    if not path.exists():
        raise HTTPException(status_code=404, detail="Beta 작업을 찾을 수 없습니다.")
    return path


def beta_update_job(beta_job_id: str, **changes: Any) -> dict[str, Any]:
    path = beta_job_dir(beta_job_id)
    state = beta_read_json(path / "state.json")
    state.update(changes)
    beta_write_json(path / "state.json", state)
    result = beta_read_json(path / "result.json")
    result.update({k: v for k, v in changes.items() if k in {"status", "progress", "completed_at", "error"}})
    beta_write_json(path / "result.json", result)
    with beta_connect() as connection:
        connection.execute(
            "UPDATE beta_jobs SET status=?, progress=?, completed_at=? WHERE beta_job_id=?",
            (state.get("status", "created"), int(state.get("progress", 0)), state.get("completed_at"), beta_job_id),
        )
    return state


def beta_run(command: list[str], cwd: Path) -> None:
    completed = subprocess.run(command, cwd=str(cwd), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip() or "명령 실행 실패")


def beta_run_ffmpeg(arguments: list[str], cwd: Path) -> None:
    if not BETA_FFMPEG.exists():
        raise RuntimeError("Beta 전용 FFmpeg가 없습니다.")
    beta_run([str(BETA_FFMPEG), "-hide_banner", "-loglevel", "error", "-y", *arguments], cwd)


def beta_has_final_consonant(value: str) -> bool:
    last = (value or "").strip()[-1:]
    return bool(last and "가" <= last <= "힣" and (ord(last) - 0xAC00) % 28)


def beta_particle(value: str, with_final: str, without_final: str) -> str:
    return with_final if beta_has_final_consonant(value) else without_final


def beta_make_content(business: dict[str, str], topic: str, image_count: int) -> dict[str, Any]:
    name = business.get("name") or "우리 업체"
    region = business.get("region") or "지역"
    service = business.get("service") or "전문 서비스"
    subject = topic.strip() or service
    title = f"{region} {subject}"
    waiting = "Gemini 결과를 받으면 이 채널의 완성 콘텐츠가 표시됩니다."
    labels = {
        "BLOG": "블로그", "NAVER_PLACE": "플레이스", "GOOGLE_BUSINESS": "구글",
        "INSTAGRAM": "인스타", "CARROT": "당근", "CAROUSEL_7": "카드뉴스",
        "PODCAST_50": "팟캐스트50s", "PODCAST_80": "팟캐스트80s",
    }
    channels = {key: {"key": key, "label": label, "content": waiting} for key, label in labels.items()}
    return {
        "title": title,
        "description": f"{name}의 {service} 원문을 SNS 8개 채널로 분리하기 위한 Beta 작업입니다.",
        "channels": channels,
        "channel_order": list(labels.keys()),
        "podcast_50": waiting,
        "podcast_80": waiting,
        "podcast_script": waiting,
        "script": waiting,
    }

def beta_srt_time(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    hours, ms = divmod(ms, 3_600_000)
    minutes, ms = divmod(ms, 60_000)
    secs, ms = divmod(ms, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def beta_write_srt(script: str, duration: float, target: Path) -> None:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?。])\s+|(?<=요\.)\s+", script) if s.strip()]
    if not sentences:
        sentences = [script.strip() or "Beta 제작"]
    weights = [max(len(s), 8) for s in sentences]
    total_weight = sum(weights)
    cursor = 0.0
    blocks: list[str] = []
    for index, (sentence, weight) in enumerate(zip(sentences, weights), start=1):
        segment = duration * weight / total_weight
        end = duration if index == len(sentences) else min(duration, cursor + segment)
        blocks.append(f"{index}\n{beta_srt_time(cursor)} --> {beta_srt_time(end)}\n{sentence}\n")
        cursor = end
    target.write_text("\n".join(blocks), encoding="utf-8")


def beta_make_tts(script: str, wav_path: Path, job_dir: Path) -> None:
    script_path = job_dir / "script.txt"
    script_path.write_text(script, encoding="utf-8")
    ps1 = job_dir / "make_tts.ps1"
    ps1.write_text(
        "param([string]$TextPath,[string]$OutputPath)\n"
        "Add-Type -AssemblyName System.Speech\n"
        "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer\n"
        "$voice=$s.GetInstalledVoices() | Where-Object {$_.VoiceInfo.Culture.Name -eq 'ko-KR'} | Select-Object -First 1\n"
        "if($voice){$s.SelectVoice($voice.VoiceInfo.Name)}\n"
        "$s.Rate=1\n"
        "$s.Volume=100\n"
        "$s.SetOutputToWaveFile($OutputPath)\n"
        "$s.Speak([IO.File]::ReadAllText($TextPath,[Text.Encoding]::UTF8))\n"
        "$s.Dispose()\n",
        encoding="utf-8-sig",
    )
    beta_run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps1), "-TextPath", str(script_path), "-OutputPath", str(wav_path)], job_dir)
    if not wav_path.exists() or wav_path.stat().st_size == 0:
        raise RuntimeError("Beta 음성이 생성되지 않았습니다.")


def beta_probe_duration(media_path: Path, job_dir: Path) -> float:
    completed = subprocess.run(
        [str(BETA_FFMPEG), "-hide_banner", "-i", str(media_path)], cwd=str(job_dir), capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", completed.stderr)
    if not match:
        raise RuntimeError("음성 길이를 확인하지 못했습니다.")
    return int(match.group(1)) * 3600 + int(match.group(2)) * 60 + float(match.group(3))


def beta_make_video(images: list[Path], duration: float, output_dir: Path, job_dir: Path) -> Path:
    clip_duration = max(1.5, duration / len(images))
    clips: list[Path] = []
    for index, image in enumerate(images, start=1):
        clip = output_dir / f"clip_{index:03d}.mp4"
        fade_out = max(0.2, clip_duration - 0.45)
        beta_run_ffmpeg([
            "-loop", "1", "-i", str(image), "-t", f"{clip_duration:.3f}",
            "-vf", f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0008,1.08)':d=1:s=1080x1920:fps=30,fade=t=in:st=0:d=0.35,fade=t=out:st={fade_out:.3f}:d=0.45,format=yuv420p",
            "-r", "30", "-an", "-c:v", "libx264", "-preset", "veryfast", str(clip)
        ], job_dir)
        clips.append(clip)
    concat = job_dir / "video_clips.txt"
    concat.write_text("\n".join(f"file '{clip.as_posix()}'" for clip in clips), encoding="utf-8")
    silent_video = output_dir / "silent_video.mp4"
    beta_run_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(silent_video)], job_dir)
    return silent_video


beta_init()


@beta_jobs_router.post("/jobs")
async def beta_create_job(
    business_name: str = Form(""), business_region: str = Form(""), business_service: str = Form(""),
    business_phone: str = Form(""), topic: str = Form(""), images: list[UploadFile] = File(...),
    videos: list[UploadFile] | None = File(None),
) -> JSONResponse:
    if not images:
        raise HTTPException(status_code=400, detail="이미지를 한 장 이상 선택하세요.")
    beta_job_id = f"beta_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(3)}"
    job_dir = BETA_JOBS / beta_job_id
    input_dir, output_dir = job_dir / "input", job_dir / "output"
    input_dir.mkdir(parents=True)
    output_dir.mkdir(parents=True)
    saved_images: list[str] = []
    for index, upload in enumerate(images, start=1):
        suffix = Path(upload.filename or "").suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            raise HTTPException(status_code=400, detail=f"지원하지 않는 이미지 형식: {suffix}")
        target = input_dir / f"image_{index:03d}{suffix}"
        with target.open("wb") as stream:
            shutil.copyfileobj(upload.file, stream)
        saved_images.append(str(target))
    saved_videos: list[str] = []
    for index, upload in enumerate(videos or [], start=1):
        if not upload.filename:
            continue
        suffix = Path(upload.filename).suffix.lower()
        if suffix not in {".mp4", ".webm", ".mov"}:
            raise HTTPException(status_code=400, detail=f"지원하지 않는 동영상 형식: {suffix}")
        target = input_dir / f"video_{index:03d}{suffix}"
        with target.open("wb") as stream:
            shutil.copyfileobj(upload.file, stream)
        saved_videos.append(str(target))
    business = {"name": business_name.strip(), "region": business_region.strip(), "service": business_service.strip(), "phone": business_phone.strip()}
    content = beta_make_content(business, topic, len(saved_images))
    created_at = beta_now()
    state = {"beta_job_id": beta_job_id, "title": content["title"], "status": "created", "progress": 0, "created_at": created_at}
    result = {**state, "schema_version": "beta-2.0", "business": business, "topic": topic.strip(), "content": content,
              "assets": {"images": saved_images, "videos": saved_videos, "music": None, "script": str(job_dir / "script.txt"), "podcast_script": str(job_dir / "podcast_script.txt"), "channels_dir": str(job_dir / "channels"), "podcast_50": str(job_dir / "podcast_50.txt"), "podcast_80": str(job_dir / "podcast_80.txt"), "audio": None, "mixed_audio": None, "subtitle": None, "thumbnail": None, "video": None}}
    beta_write_json(job_dir / "state.json", state)
    beta_write_json(job_dir / "result.json", result)
    channels_dir = job_dir / "channels"
    channels_dir.mkdir(parents=True, exist_ok=True)
    for key in content["channel_order"]:
        channel_text = content["channels"][key]["content"]
        (channels_dir / f"{key}.txt").write_text(channel_text + "\n", encoding="utf-8")
    content_lines = [f"제목\n{content['title']}", f"설명\n{content['description']}", "SNS 8채널"]
    for key in content["channel_order"]:
        item = content["channels"][key]
        content_lines.append(f"[{key}] {item['label']}\n{item['content']}")
    (job_dir / "content.txt").write_text("\n\n".join(content_lines), encoding="utf-8")
    (job_dir / "podcast_50.txt").write_text(content["podcast_50"], encoding="utf-8")
    (job_dir / "podcast_80.txt").write_text(content["podcast_80"], encoding="utf-8")
    (job_dir / "script.txt").write_text(content["podcast_50"], encoding="utf-8")
    (job_dir / "podcast_script.txt").write_text(content["podcast_50"], encoding="utf-8")
    with beta_connect() as connection:
        connection.execute("INSERT INTO beta_jobs(beta_job_id,title,status,progress,created_at,result_json) VALUES(?,?,?,?,?,?)",
                           (beta_job_id, content["title"], "created", 0, created_at, str(job_dir / "result.json")))
    return JSONResponse({"ok": True, "job": result})


@beta_jobs_router.post("/jobs/{beta_job_id}/render")
def beta_render_job(beta_job_id: str, music_volume: float = Form(0.16)) -> JSONResponse:
    job_dir = beta_job_dir(beta_job_id)
    output_dir = job_dir / "output"
    result = beta_read_json(job_dir / "result.json")
    images = [Path(p) for p in result.get("assets", {}).get("images", []) if Path(p).exists()]
    if not images:
        raise HTTPException(status_code=400, detail="렌더링할 이미지가 없습니다.")
    music_volume = max(0.0, min(float(music_volume), 0.5))
    try:
        beta_update_job(beta_job_id, status="creating_voice", progress=20)
        script = result.get("content", {}).get("podcast_80") or result.get("content", {}).get("podcast_script") or result.get("content", {}).get("script", "")
        voice_wav = output_dir / "voice.wav"
        beta_make_tts(script, voice_wav, job_dir)
        duration = beta_probe_duration(voice_wav, job_dir)
        voice_mp3 = output_dir / "voice.mp3"
        beta_run_ffmpeg(["-i", str(voice_wav), "-c:a", "libmp3lame", "-q:a", "3", str(voice_mp3)], job_dir)

        beta_update_job(beta_job_id, status="creating_subtitles", progress=40)
        subtitle = output_dir / "subtitle.srt"
        beta_write_srt(script, duration, subtitle)
        thumbnail = output_dir / "thumbnail.jpg"
        beta_run_ffmpeg(["-i", str(images[0]), "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", "-frames:v", "1", str(thumbnail)], job_dir)

        beta_update_job(beta_job_id, status="creating_video", progress=60)
        silent_video = beta_make_video(images, duration, output_dir, job_dir)
        music_value = result.get("assets", {}).get("music")
        mixed_audio = output_dir / "mixed_audio.m4a"
        if music_value and Path(music_value).exists() and music_volume > 0:
            beta_run_ffmpeg([
                "-i", str(voice_wav), "-stream_loop", "-1", "-i", str(music_value),
                "-filter_complex", f"[1:a]volume={music_volume}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]",
                "-map", "[a]", "-t", f"{duration:.3f}", "-c:a", "aac", "-b:a", "192k", str(mixed_audio)
            ], job_dir)
        else:
            beta_run_ffmpeg(["-i", str(voice_wav), "-c:a", "aac", "-b:a", "192k", str(mixed_audio)], job_dir)

        beta_update_job(beta_job_id, status="muxing_final", progress=85)
        video = output_dir / "final.mp4"
        beta_run_ffmpeg([
            "-i", str(silent_video), "-i", str(mixed_audio), "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", str(video)
        ], job_dir)
        if not video.exists() or video.stat().st_size == 0:
            raise RuntimeError("최종 MP4가 생성되지 않았습니다.")
        completed_at = beta_now()
        result["assets"].update({"audio": str(voice_mp3), "mixed_audio": str(mixed_audio), "subtitle": str(subtitle), "thumbnail": str(thumbnail), "video": str(video)})
        result.update({"status": "completed", "progress": 100, "completed_at": completed_at, "duration_seconds": round(duration, 3)})
        beta_write_json(job_dir / "result.json", result)
        beta_update_job(beta_job_id, status="completed", progress=100, completed_at=completed_at)
        return JSONResponse({"ok": True, "job": result, "video_url": f"/beta-api/jobs/{beta_job_id}/file/video"})
    except Exception as exc:
        beta_update_job(beta_job_id, status="failed", progress=0, error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@beta_jobs_router.get("/v1-profile")
def beta_v1_profile(request: Request) -> JSONResponse:
    url = "http://127.0.0.1:8011/v1-api/auth/personas"
    headers = {"Accept": "application/json"}
    cookie = request.headers.get("cookie", "").strip()
    authorization = request.headers.get("authorization", "").strip()
    if cookie:
        headers["Cookie"] = cookie
    if authorization:
        headers["Authorization"] = authorization
    try:
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code in {401, 403}:
            return JSONResponse({"ok": True, "authenticated": False, "profile": None})
        return JSONResponse({"ok": False, "authenticated": False, "profile": None, "detail": f"V1 profile HTTP {exc.code}"})
    except Exception as exc:
        return JSONResponse({"ok": False, "authenticated": False, "profile": None, "detail": str(exc)[:300]})

    data = payload.get("data", payload) if isinstance(payload, dict) else payload
    if isinstance(data, dict):
        candidates = data.get("items") or data.get("personas") or data.get("results") or data.get("data") or []
    else:
        candidates = data
    if isinstance(candidates, dict):
        candidates = [candidates]
    if not isinstance(candidates, list):
        candidates = []
    persona = next((item for item in candidates if isinstance(item, dict) and item.get("is_default")), None)
    if persona is None:
        persona = next((item for item in candidates if isinstance(item, dict)), None)
    if not persona:
        return JSONResponse({"ok": True, "authenticated": True, "profile": None})
    profile = {
        "name": persona.get("company_name") or persona.get("business_name") or persona.get("name") or "",
        "region": persona.get("region") or persona.get("business_region") or persona.get("address") or "",
        "service": BETA_INDUSTRY_LABELS.get(str(persona.get("industry_key") or "").strip(), "") or persona.get("industry_name") or persona.get("business_type") or persona.get("industry") or "",
        "phone": persona.get("phone") or persona.get("phone_number") or persona.get("tel") or "",
    }
    return JSONResponse({"ok": True, "authenticated": True, "profile": profile})


@beta_jobs_router.get("/jobs")
def beta_list_jobs() -> JSONResponse:
    with beta_connect() as connection:
        rows = connection.execute("SELECT beta_job_id,title,status,progress,created_at,completed_at FROM beta_jobs ORDER BY created_at DESC").fetchall()
    return JSONResponse({"ok": True, "items": [dict(row) for row in rows]})


@beta_jobs_router.get("/jobs/{beta_job_id}")
def beta_get_job(beta_job_id: str) -> JSONResponse:
    return JSONResponse({"ok": True, "job": beta_read_json(beta_job_dir(beta_job_id) / "result.json")})


@beta_jobs_router.delete("/jobs/{beta_job_id}")
def beta_delete_job(beta_job_id: str) -> JSONResponse:
    job_dir = beta_job_dir(beta_job_id).resolve()
    jobs_root = BETA_JOBS.resolve()
    if job_dir.parent != jobs_root or not job_dir.name.startswith("beta_"):
        raise HTTPException(status_code=400, detail="삭제할 수 없는 작업 경로입니다.")

    with beta_connect() as connection:
        row = connection.execute(
            "SELECT beta_job_id FROM beta_jobs WHERE beta_job_id=?",
            (beta_job_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Beta 작업 DB 레코드를 찾을 수 없습니다.")

    quarantine = jobs_root / f".__deleting__{beta_job_id}"
    if quarantine.exists():
        shutil.rmtree(quarantine)
    job_dir.replace(quarantine)

    try:
        with beta_connect() as connection:
            connection.execute("DELETE FROM beta_jobs WHERE beta_job_id=?", (beta_job_id,))
            connection.commit()
        shutil.rmtree(quarantine)
    except Exception as exc:
        if quarantine.exists() and not job_dir.exists():
            quarantine.replace(job_dir)
        raise HTTPException(status_code=500, detail=f"Beta 작업 완전 삭제 실패: {exc}")

    leftovers = [
        str(path) for path in jobs_root.iterdir()
        if beta_job_id in path.name
    ]
    if leftovers:
        raise HTTPException(status_code=500, detail="삭제 후 잔여 파일이 발견되었습니다.")
    return JSONResponse({"ok": True, "deleted": beta_job_id, "db_deleted": True, "files_deleted": True})


@beta_jobs_router.get("/jobs/{beta_job_id}/file/{asset_name}")
def beta_get_asset(beta_job_id: str, asset_name: str) -> FileResponse:
    result = beta_read_json(beta_job_dir(beta_job_id) / "result.json")
    key_map = {"audio": "audio", "mixed_audio": "mixed_audio", "subtitle": "subtitle", "thumbnail": "thumbnail", "video": "video", "script": "script", "podcast_script": "podcast_script"}
    key = key_map.get(asset_name)
    if not key:
        raise HTTPException(status_code=404, detail="지원하지 않는 파일입니다.")
    path_value = result.get("assets", {}).get(key)
    path = Path(path_value) if path_value else None
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="파일이 없습니다.")
    return FileResponse(path)
