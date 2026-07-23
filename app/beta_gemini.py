from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

beta_gemini_router = APIRouter(prefix="/beta-api/gemini", tags=["beta-gemini"])

CHANNEL_ORDER = [
    ("BLOG", "블로그"),
    ("NAVER_PLACE", "플레이스"),
    ("GOOGLE_BUSINESS", "구글"),
    ("INSTAGRAM", "인스타"),
    ("CARROT", "당근"),
    ("CAROUSEL_7", "카드뉴스"),
    ("PODCAST_50", "팟캐스트50s"),
    ("PODCAST_80", "팟캐스트80s"),
]
CHANNEL_KEYS = [key for key, _ in CHANNEL_ORDER]
CHANNEL_LABELS = dict(CHANNEL_ORDER)


class BetaGeminiRequest(BaseModel):
    business: dict[str, str] = Field(default_factory=dict)
    topic: str
    image_count: int = 8


def beta_gemini_model() -> str:
    return os.getenv("BETA_GEMINI_MODEL", "gemini-3.5-flash").strip() or "gemini-3.5-flash"


def beta_gemini_key() -> str:
    return (os.getenv("BETA_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY") or "").strip()


def beta_build_prompt(payload: BetaGeminiRequest) -> str:
    business = payload.business or {}
    company = str(business.get("name", "")).strip() or "업체명 미등록"
    region = str(business.get("region", "")).strip() or "지역 미등록"
    service = str(business.get("service", "")).strip() or "서비스 미등록"
    phone = str(business.get("phone", "")).strip() or "미등록"
    source_text = str(payload.topic or "").strip()

    return f"""# StoryMaker Beta SNS 8채널 콘텐츠 생성 프롬프트 v2.0

## 역할
당신은 한국 소상공인의 실제 현장 자료를 채널별 게시물로 재구성하는 StoryMaker 전문 작가입니다.
하나의 이야기를 8개 장면으로 나누지 말고, 동일한 원문을 각 SNS 채널 특성에 맞게 각각 완성하세요.

## 업체 정보
- 업체명: {company}
- 대표 지역: {region}
- 주요 서비스: {service}
- 전화번호: {phone}

## 원문 자료
현장 사실과 작업 과정은 아래 원문을 기준으로 합니다.
업체명, 대표 지역, 주요 서비스, 전화번호는 위 업체 정보를 최종 기준으로 사용합니다.
원문에 없는 수치, 후기, 자격, 작업 결과, 고객 반응, 원인, 시공법은 만들지 마세요.
블로그 UI 문구, 프로필, URL 복사, 통계, 접기/펴기 같은 불필요한 문구는 제거하세요.

--- 원문 시작 ---
{source_text}
--- 원문 끝 ---

## 생성할 8개 채널
1. BLOG: 네이버 블로그용. 추천 제목 5개와 읽기 좋은 본문, 상담 안내를 포함합니다.
2. NAVER_PLACE: 네이버 스마트플레이스 새소식용. 핵심 현장 내용과 문의 행동을 짧고 명확하게 작성합니다.
3. GOOGLE_BUSINESS: 구글 비즈니스 프로필 게시물용. 지역·서비스·현장 핵심을 자연스럽게 정리합니다.
4. INSTAGRAM: 인스타그램 피드용. 모바일 가독성이 좋은 짧은 문단과 해시태그를 포함합니다.
5. CARROT: 당근 비즈프로필용. 이웃에게 말하듯 생활 불편과 해결 내용을 친근하게 작성합니다.
6. CAROUSEL_7: 카드뉴스 7장용. 각 장을 1장부터 7장까지 제목과 짧은 설명으로 구성합니다.
7. PODCAST_50: 약 50초 분량의 여자·남자 대화형 한국어 음성 대본입니다. 첫 줄은 반드시 "여자:", 둘째 줄은 반드시 "남자:"로 시작하고 이후에도 한 줄씩 번갈아 대화합니다. Beta TTS·WASM MP3·WebGPU MP4의 기본 대본으로 사용됩니다.
8. PODCAST_80: 약 80초 분량의 여자·남자 대화형 한국어 음성 대본입니다. 첫 줄은 여자, 둘째 줄은 남자로 시작해 한 줄씩 번갈아 대화합니다. 긴 버전 선택지로 보관합니다.
9. THUMBNAIL_PROMPT: 제공된 업체정보·인스타 문안·현장 내용을 바탕으로 9:16 세로형 썸네일을 만들 수 있는 상세 이미지 생성 프롬프트입니다. 사진에 없는 사실은 만들지 말고 업체명, 핵심 짧은 문구, 전화번호의 배치와 디자인 방향을 명확히 작성합니다.

## 공통 작성 원칙
- 각 채널은 복사본이 아니라 플랫폼 용도에 맞게 다시 작성합니다.
- 과장, 허위 후기, 최저가, 최고, 완벽, 100퍼센트 해결 같은 검증 불가능한 표현을 금지합니다.
- 전화번호는 필요한 채널의 마지막 상담 문구에만 자연스럽게 넣습니다.
- 팟캐스트 대본은 기호와 마크다운을 줄이고 TTS가 자연스럽게 읽도록 작성합니다.
- PODCAST_50과 PODCAST_80은 각 줄을 반드시 "여자:" 또는 "남자:"로 시작하고, 여자와 남자가 한 줄씩 번갈아 말합니다.
- 첫 번째 줄은 여자, 두 번째 줄은 남자입니다. 같은 화자가 두 줄 연속 말하지 않습니다.
- PODCAST_50과 PODCAST_80은 분량과 내용 밀도가 분명히 달라야 합니다.

## 출력 형식
긴 본문을 JSON 문자열에 넣지 마세요. 아래 BLOCK 형식으로만 반환하세요.
코드펜스, 설명, 머리말, 꼬리말을 추가하지 마세요.

[BLOCK:TITLE]
전체 프로젝트 제목

[BLOCK:DESCRIPTION]
전체 콘텐츠 설명

[BLOCK:BLOG]
추천 제목 5개와 블로그 본문 전체

[BLOCK:NAVER_PLACE]
네이버 플레이스 새소식 전체

[BLOCK:GOOGLE_BUSINESS]
구글 비즈니스 게시물 전체

[BLOCK:INSTAGRAM]
인스타그램 게시물 전체

[BLOCK:CARROT]
당근 비즈프로필 게시물 전체

[BLOCK:CAROUSEL_7]
1장부터 7장까지 카드뉴스 문안 전체

[BLOCK:PODCAST_50]
약 50초 팟캐스트 대본

[BLOCK:PODCAST_80]
약 80초 여자·남자 대화형 팟캐스트 대본

[BLOCK:THUMBNAIL_PROMPT]
9:16 세로형 썸네일 이미지 생성용 상세 프롬프트

출력 전에 8개 콘텐츠 BLOCK과 THUMBNAIL_PROMPT 누락 여부를 내부적으로 확인하세요.
"""


def beta_extract_text(response: dict[str, Any]) -> str:
    try:
        parts = response["candidates"][0]["content"]["parts"]
        return "".join(str(part.get("text", "")) for part in parts).strip()
    except (KeyError, IndexError, TypeError):
        raise ValueError("Gemini 응답에서 텍스트를 찾지 못했습니다.")


def beta_extract_json_object(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"```(?:json)?", "", str(text or ""), flags=re.I).replace("```", "").strip()
    decoder = json.JSONDecoder()
    candidates: list[dict[str, Any]] = []
    for match in re.finditer(r"\{", cleaned):
        try:
            value, _ = decoder.raw_decode(cleaned[match.start():])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            candidates.append(value)
    for candidate in reversed(candidates):
        channels = candidate.get("channels")
        if isinstance(channels, dict) and all(key in channels for key in CHANNEL_KEYS):
            return candidate
    raise ValueError("Gemini 응답에서 유효한 SNS 8채널 JSON을 찾지 못했습니다.")




def beta_extract_blocks(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"```(?:text|markdown|json)?", "", str(text or ""), flags=re.I).replace("```", "").strip()
    names = ["TITLE", "DESCRIPTION", *CHANNEL_KEYS, "THUMBNAIL_PROMPT"]
    found: dict[str, str] = {}
    for index, name in enumerate(names):
        start_tag = f"[BLOCK:{name}]"
        start = cleaned.find(start_tag)
        if start < 0:
            continue
        body_start = start + len(start_tag)
        next_positions = [cleaned.find(f"[BLOCK:{other}]", body_start) for other in names[index + 1:]]
        next_positions = [pos for pos in next_positions if pos >= 0]
        end = min(next_positions) if next_positions else len(cleaned)
        found[name] = cleaned[body_start:end].strip()
    if all(found.get(key) for key in CHANNEL_KEYS):
        return {
            "title": found.get("TITLE", "").strip(),
            "description": found.get("DESCRIPTION", "").strip(),
            "channels": {key: found[key] for key in CHANNEL_KEYS},
            "thumbnail_prompt": found.get("THUMBNAIL_PROMPT", "").strip(),
        }
    raise ValueError("Gemini 응답에서 SNS 8채널 BLOCK을 찾지 못했습니다.")

def beta_parse_content(text: str, image_count: int) -> dict[str, Any]:
    try:
        data = beta_extract_json_object(text)
    except ValueError:
        data = beta_extract_blocks(text)
    raw_channels = data.get("channels")
    if not isinstance(raw_channels, dict):
        raise ValueError("Gemini 결과에 channels 객체가 필요합니다.")
    channels: dict[str, dict[str, str]] = {}
    for key, label in CHANNEL_ORDER:
        value = raw_channels.get(key)
        if isinstance(value, dict):
            value = value.get("content") or value.get("text") or value.get("script") or ""
        content = str(value or "").strip()
        if not content:
            raise ValueError(f"{key} 채널 내용이 비어 있습니다.")
        channels[key] = {"key": key, "label": label, "content": content}
    podcast_50 = channels["PODCAST_50"]["content"]
    podcast_80 = channels["PODCAST_80"]["content"]
    return {
        "title": str(data.get("title", "")).strip(),
        "description": str(data.get("description", "")).strip(),
        "channels": channels,
        "channel_order": CHANNEL_KEYS,
        "podcast_50": podcast_50,
        "podcast_80": podcast_80,
        "podcast_script": podcast_50,
        "script": podcast_50,
        "thumbnail_prompt": str(data.get("thumbnail_prompt", "")).strip(),
        "provider": "gemini",
        "model": beta_gemini_model(),
    }


def beta_call_gemini(payload: BetaGeminiRequest) -> dict[str, Any]:
    key = beta_gemini_key()
    if not key:
        raise HTTPException(status_code=503, detail="Beta 전용 Gemini API 키가 설정되지 않았습니다.")
    model = beta_gemini_model()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = {
        "contents": [{"role": "user", "parts": [{"text": beta_build_prompt(payload)}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.5},
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1200]
        raise HTTPException(status_code=502, detail=f"Gemini API 오류 {exc.code}: {detail}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini 연결 실패: {exc}")
    return beta_parse_content(beta_extract_text(raw), payload.image_count)


@beta_gemini_router.get("/status")
def beta_gemini_status() -> dict[str, Any]:
    return {"ok": True, "configured": bool(beta_gemini_key()), "model": beta_gemini_model(), "key_exposed": False}


@beta_gemini_router.post("/generate")
def beta_gemini_generate(payload: BetaGeminiRequest) -> dict[str, Any]:
    return {"ok": True, "content": beta_call_gemini(payload)}


@beta_gemini_router.post("/jobs/{beta_job_id}/generate")
def beta_gemini_generate_for_job(beta_job_id: str) -> dict[str, Any]:
    if not beta_job_id.startswith("beta_") or any(ch not in "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-" for ch in beta_job_id):
        raise HTTPException(status_code=400, detail="잘못된 Beta 작업 ID입니다.")
    job_dir = Path(r"F:\StoryMaker_beta") / "data" / "jobs" / beta_job_id
    result_path = job_dir / "result.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Beta 작업을 찾을 수 없습니다.")
    result = json.loads(result_path.read_text(encoding="utf-8"))
    payload = BetaGeminiRequest(
        business=result.get("business", {}),
        topic=result.get("topic", ""),
        image_count=max(1, len(result.get("assets", {}).get("images", []))),
    )
    content = beta_call_gemini(payload)
    result["content"] = content
    result["title"] = content.get("title") or result.get("title")
    result["gemini"] = {"provider": "gemini", "model": beta_gemini_model(), "applied": True}
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
    tmp = result_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(result_path)
    return {"ok": True, "job": result}
