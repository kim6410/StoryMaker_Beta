# StoryMaker Beta 런타임 백업·복구 기준

작성일: 2026-07-24

## GitHub에 저장하는 항목

- `app/` Python 소스
- `static/` HTML·JavaScript·CSS
- 서버 시작·재시작·Health 감시 스크립트
- `requirements.txt`
- 복구 문서와 `WORK_LOGS` 업무일지

## GitHub에 저장하지 않는 항목

- `.env`와 인증정보
- `.venv`
- `data/storymaker_beta.db`
- `data/jobs`
- 생성 이미지·WAV·MP3·SRT·MP4·WebM
- `Supertonic3`
- `tools/ffmpeg.exe`
- `logs`
- 로컬 `backups`

위 항목은 `.gitignore`로 제외하고 `F:\v1_backup`의 날짜별 공식 백업으로 보호합니다.

## 2026-07-24 공식 런타임 백업

백업 위치:

`F:\v1_backup\BETA_RUNTIME_20260724_153500_full`

포함 기준:

- `storymaker_beta.db`
- `.venv`
- `data/jobs`
- `Supertonic3`
- `logs`
- `backups`
- `tools/ffmpeg.exe`

`.env`는 현재 Beta 루트에 존재하지 않아 백업 대상이 없었습니다.

## Python 환경 복구

```bat
cd /d F:\StoryMaker_beta
py -3.12 -m venv .venv
F:\StoryMaker_beta\.venv\Scripts\python.exe -m pip install --upgrade pip
F:\StoryMaker_beta\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Beta 서버 복구

정상 실행환경 사전 검사:

```bat
F:\StoryMaker_beta\.venv\Scripts\python.exe -c "import uvicorn; import app.main; print('IMPORT_OK')"
```

안전 재시작:

```bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -File F:\StoryMaker_beta\restart_beta_safe.ps1
```

Health 확인:

```text
http://127.0.0.1:8021/beta-api/health
```

## 자동 감시

Windows 예약 작업:

`StoryMaker Beta Health Watch`

실행 주기:

1분

실행 파일:

`F:\StoryMaker_beta\check_beta_health.ps1`

Health가 실패하면 `restart_beta_safe.ps1`을 호출하며, 안전 재시작 스크립트는 8022 임시 검증 서버가 정상인 경우에만 기존 8021 서버를 교체합니다.

## Gemini Worker

현재 필수 버전:

`2.1.3`

`claimed` 상태에서 브라우저 또는 Worker가 다시 로드된 경우 동일 작업을 다시 이어받도록 보강했습니다.

기본 음성·영상 대본은 `PODCAST_50`입니다.
