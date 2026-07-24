# StoryMaker Beta 아키텍처

마지막 갱신: 2026-07-24

## 목적

StoryMaker Beta는 V1 운영 기능을 보호하면서 새로운 딸깍 제작 흐름을 독립 개발·검증하는 프로젝트입니다. V1 소스·DB·Worker·Supertonic·브라우저 엔진을 직접 수정하거나 런타임 공유하지 않습니다.

## 실행 구조

```text
Browser
  └─ FastAPI 127.0.0.1:8021
      ├─ /beta
      ├─ /beta/production
      ├─ /beta/archive
      ├─ /beta/browser-render
      └─ /beta-api/*
           ├─ jobs
           ├─ gemini-worker
           ├─ browser
           └─ health

Gemini Web/Tampermonkey Worker
  ↔ /beta-api/gemini-worker/*

Beta Supertonic
  ↔ 127.0.0.1:7790

SQLite
  └─ data/storymaker_beta.db

작업 저장소
  └─ data/jobs/<beta_job_id>/
```

## 핵심 파일 책임

- `app/main.py`: FastAPI 앱 구성, Router 등록, 정적 페이지 제공, health.
- `app/beta_jobs.py`: 작업 생성·목록·상세·삭제·기본 미디어 생성·파일 제공.
- `app/beta_gemini.py`: Gemini 프롬프트 생성과 결과 JSON 파싱.
- `app/beta_gemini_worker.py`: 브라우저 Gemini Worker Queue·Claim·Result, AI 썸네일 흐름.
- `app/beta_browser.py`: 브라우저 렌더 Manifest, 입력 자산 제공, MP3·MP4 결과 업로드.
- `app/beta_shortform.py`: shortform-lab 독립 이식용 API. 현재 진행 중이므로 실제 Git 상태 확인.
- `static/production.html`, `static/beta-production.js`: 제작 UI와 전체 흐름 제어.
- `static/browser-render.html`, `static/beta-browser-render.js`: 브라우저 MP3·MP4 렌더.
- `static/archive.html`, `static/beta-archive.js`: 보관함.

## 작업 폴더 계약

```text
data/jobs/<beta_job_id>/
├─ state.json
├─ result.json
├─ content.txt
├─ script.txt
├─ podcast_script.txt
├─ podcast_50.txt
├─ podcast_80.txt
├─ channels/
├─ input/
└─ output/
   └─ browser/
```

`result.json`은 작업 결과와 자산 경로의 핵심 계약입니다. 여러 모듈이 이를 갱신하므로 중앙 갱신 함수·잠금·revision 도입이 권장됩니다.

## 권장 상태 머신

```text
created
→ gemini_queued
→ gemini_claimed
→ content_ready
→ voice_ready
→ subtitle_ready
→ render_ready
→ rendering
→ completed

어느 단계에서든 → failed
```

실제 구현 상태명은 이 모델과 다를 수 있으므로 변경 전 호환성을 확인합니다.

## 자산 원칙

- 입력 이미지·동영상은 작업별 `input`에 저장합니다.
- 출력 음성·자막·썸네일·MP4는 작업별 `output`에 저장합니다.
- 브라우저 결과는 `output/browser`에 저장합니다.
- 서버 렌더와 브라우저 렌더를 구분하고 최종 선택 자산을 명확히 해야 합니다.
- 절대 경로를 외부 응답에 그대로 노출하는 구조는 장기적으로 URL·상대경로 계약으로 개선합니다.

## V1과의 경계

허용:
- 구조를 읽고 Beta에 독립 재구현
- 명시적으로 승인된 V1 HTTP API의 읽기 전용 호출

금지:
- V1 파일 수정
- V1 DB 직접 연결
- V1 Worker·Queue 공유
- 공용 Supertonic 7788 사용
- V1 정적 번들의 무분별한 런타임 직접 참조

## 고도화 우선순위

1. 중앙 상태·결과 저장 계층
2. job_id별 Queue와 동시성 제어
3. 자산 스키마·완료 판정 통일
4. 업로드 제한과 미디어 검증
5. E2E 자동 테스트
6. 진단·감사·정합성 복구 도구
7. 중앙 설정과 상대경로화
