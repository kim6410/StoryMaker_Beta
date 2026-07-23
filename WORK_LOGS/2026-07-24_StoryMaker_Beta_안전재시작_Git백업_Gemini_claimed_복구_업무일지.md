# StoryMaker Beta 안전 재시작·Git 백업·Gemini claimed 복구 업무일지

작성일: 2026-07-24

## 작업 범위

작업 루트는 `F:\StoryMaker_beta`입니다.

`F:\StoryMaker_V1`은 수정하지 않았습니다.

## 발생 문제

- 8021 서버 재기동 시 시스템 Python 3.12에 `uvicorn`이 없어 Beta iframe이 먹통이 됐습니다.
- Gemini Worker가 작업을 `claimed`로 가져간 뒤 브라우저 또는 Worker 실행이 끊기면 다시 이어받지 못했습니다.
- Gemini 결과 저장 후 `script.txt`와 `podcast_script.txt`가 `PODCAST_80`을 사용하고 있었습니다.
- `.venv` 복구용 `requirements.txt`가 없었습니다.

## 수정 파일

- `app/beta_browser.py`
- `app/beta_jobs.py`
- `app/beta_gemini_worker.py`
- `static/production.html`
- `static/beta-production.js`
- `static/beta-browser-render.js`
- `static/storymaker-beta-gemini-worker.user.js`
- `restart_beta_safe.ps1`
- `check_beta_health.ps1`
- `requirements.txt`
- `RUNTIME_BACKUP_AND_RESTORE.md`

## 적용 내용

### 안전 재시작

`restart_beta_safe.ps1`을 추가했습니다.

- Beta 전용 `.venv\Scripts\python.exe`만 사용
- `uvicorn`과 `app.main` import 사전 검사
- 8022 임시 검증 서버 Health 200 확인
- 검증 성공 시에만 기존 8021 종료
- 새 8021 Health 200 확인
- 로그는 `logs\beta-restart.log` 등에 기록

### 1분 Health 감시

`check_beta_health.ps1`을 추가했습니다.

Windows 예약 작업:

`StoryMaker Beta Health Watch`

주기:

1분

Health 실패 시 안전 재시작 스크립트를 호출합니다.

### Gemini Worker

Worker 버전을 `2.1.3`으로 올렸습니다.

- `pending`뿐 아니라 `claimed` 작업도 다시 이어받음
- 브라우저 또는 Worker 재로드 후 `claimed` 정체 복구
- 서버의 필수 Worker ID도 `tampermonkey-beta-v2-2.1.3`으로 변경
- 기본 저장 대본을 `PODCAST_50`으로 수정

### Python 환경

현재 `.venv`의 `pip freeze` 결과를 `requirements.txt`로 생성했습니다.

### 런타임 백업

공식 백업 위치:

`F:\v1_backup\BETA_RUNTIME_20260724_153500_full`

DB는 별도 복사했고, `.venv`, `data\jobs`, `Supertonic3`, `logs`, `backups`, `tools\ffmpeg.exe`는 `runtime_large.tar`에 보존하도록 실행했습니다.

`.env`는 현재 Beta 루트에 존재하지 않았습니다.

## Git 저장 대상

사용자 승인에 따라 아래 파일만 명시적으로 스테이징합니다.

- `app/beta_browser.py`
- `app/beta_jobs.py`
- `app/beta_gemini_worker.py`
- `static/production.html`
- `static/beta-production.js`
- `static/beta-browser-render.js`
- `static/storymaker-beta-gemini-worker.user.js`
- `restart_beta_safe.ps1`
- `check_beta_health.ps1`
- `requirements.txt`
- `RUNTIME_BACKUP_AND_RESTORE.md`
- 이 업무일지

`.env`, DB, 작업 결과, 모델, 미디어, `.venv`, FFmpeg 실행 파일은 Git에 넣지 않습니다.

## 검증 항목

- Beta 전용 Python에서 `uvicorn`, `app.main` import
- `restart_beta_safe.ps1` 실행 성공
- 8021 `/beta-api/health` HTTP 200
- Windows 예약 작업 생성 성공
- Python·JavaScript 문법 검사
- Git Diff와 스테이징 파일 확인
- 원격 `main` Push 후 로컬·원격 커밋 일치 확인

## 다음 확인

- Tampermonkey에서 Worker 2.1.3 업데이트
- 기존 `claimed` 작업이 Gemini 입력·전송으로 이어지는지 화면 확인
- Gemini 완료 후 SNS 8채널 슬롯 이동 확인
- PODCAST_50 기준 Supertonic·WASM MP3·WebGPU MP4 완주 확인
