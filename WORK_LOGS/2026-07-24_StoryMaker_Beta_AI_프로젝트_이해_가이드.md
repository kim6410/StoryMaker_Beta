# StoryMaker Beta AI 프로젝트 이해 가이드

작성일: 2026-07-24

이 문서는 `F:\StoryMaker_beta`를 처음 맡는 AI와 작업자가 현재 Beta의 목적, 구조, 이미 확인된 버그, 잠재적 지뢰, 기술 부채, 고도화 방향을 빠르게 이해하도록 만든 소스 기반 안내서입니다.

가장 먼저 반드시 읽을 문서:

`F:\StoryMaker_beta\00_READ_FIRST.md`

이 문서보다 `00_READ_FIRST.md`의 안전 규칙이 우선합니다.

---

## 1. 프로젝트의 목적

StoryMaker Beta의 핵심 목적은 기존 운영판 V1을 건드리지 않고, 새로운 자동 콘텐츠 제작 흐름을 독립적으로 개발하는 것입니다.

사용자가 업체 정보, 주제, 이미지와 동영상을 입력하면 다음 결과를 하나의 작업 ID 안에서 생성·보관하는 구조를 목표로 합니다.

- SNS 8채널 원고
- 팟캐스트 50초·80초 대본
- 음성 WAV·MP3
- SRT 자막
- 썸네일
- 브라우저 MP3·MP4
- 서버 렌더 MP4
- 보관함 상세보기

Beta는 단순한 V1 복사본이 아닙니다.

Beta는 새 UI, 새 API, 새 DB, 새 작업 폴더, 새 Gemini 연결, 새 브라우저 렌더러를 시험하고 완성하기 위한 별도 제작 시스템입니다.

절대 분리 원칙:

```text
F:\StoryMaker_V1
= 운영·안정판
= Beta 작업 중 수정 금지

F:\StoryMaker_beta
= 신규 독립 개발판
= 현재 작업 대상
```

---

## 2. 현재 실행 구조

Beta 루트:

`F:\StoryMaker_beta`

Beta 접속 주소:

`http://127.0.0.1:8021/beta`

Beta 브라우저 렌더 페이지:

`http://127.0.0.1:8021/beta/browser-render`

Beta Supertonic 포트:

`7790`

Beta 전용 DB:

`F:\StoryMaker_beta\data\storymaker_beta.db`

Beta 작업 저장 경로:

`F:\StoryMaker_beta\data\jobs\beta_*`

현재 핵심 디렉터리:

```text
F:\StoryMaker_beta
├─ app                 FastAPI 백엔드
├─ static              제작·보관함·브라우저 렌더 UI
├─ data                DB, 작업, Worker 상태
├─ tools               Beta 전용 FFmpeg
├─ Supertonic3         Beta 전용 음성 환경
├─ tests               브라우저 렌더 테스트
├─ WORK_LOGS           업무일지
├─ .venv               Beta Python 환경
└─ 00_READ_FIRST.md    최상위 안전 규칙
```

---

## 3. 핵심 소스와 역할

### `app/main.py`

FastAPI 앱의 진입점입니다.

주요 역할:

- `/beta`
- `/beta/production`
- `/beta/archive`
- `/beta/browser-render`
- `/beta-api/health`
- 정적 파일 `/beta-static`
- 각 Router 등록

현재 작업 트리에는 아래 신규 라우트가 아직 미커밋 상태로 추가돼 있습니다.

```text
/beta/shortform-lab
```

이는 `static\shortform-lab\index.html`을 여는 작업으로 보이며 현재 진행 중인 별도 실험입니다.

### `app/beta_jobs.py`

작업 생성, DB 기록, 서버 렌더, 자산 조회, 삭제를 담당합니다.

주요 흐름:

```text
POST /beta-api/jobs
  → beta_job_id 생성
  → input/output 폴더 생성
  → 이미지·동영상 저장
  → state.json 생성
  → result.json 생성
  → SQLite beta_jobs 등록
```

서버 렌더 경로:

```text
POST /beta-api/jobs/{job_id}/render
```

현재 서버 렌더는 Windows System.Speech와 FFmpeg를 사용합니다.

### `app/beta_gemini.py`

Gemini에 보낼 프롬프트 작성과 결과 JSON 해석을 담당합니다.

AI가 글쓰기만 담당하고, 작업 저장과 미디어 생성은 로컬 코드가 담당하는 구조입니다.

### `app/beta_gemini_worker.py`

Tampermonkey 기반 Gemini 웹 Worker와 Beta 서버 사이의 큐·ACK·결과 저장을 담당합니다.

현재 구조는 일반적인 다중 작업 Queue가 아니라 파일 하나에 현재 작업 하나를 저장하는 단일 슬롯 방식입니다.

상태 파일:

```text
F:\StoryMaker_beta\data\beta_gemini_worker_state.json
F:\StoryMaker_beta\data\beta_thumbnail_worker_state.json
```

### `app/beta_browser.py`

브라우저 렌더러가 사용할 Manifest와 원본 이미지·동영상·음성·자막을 제공합니다.

브라우저에서 생성한 MP3·MP4를 서버 작업 폴더에 다시 저장하는 Upload API도 포함합니다.

주요 API:

```text
GET  /beta-api/browser/capabilities
GET  /beta-api/browser/jobs/{job_id}/manifest
GET  /beta-api/browser/jobs/{job_id}/image/{index}
GET  /beta-api/browser/jobs/{job_id}/video/{index}
GET  /beta-api/browser/jobs/{job_id}/voice-wav
GET  /beta-api/browser/jobs/{job_id}/subtitle
POST /beta-api/browser/jobs/{job_id}/upload
```

### `static/production.html`

Beta 제작 화면의 HTML 뼈대입니다.

### `static/beta-production.js`

작업 생성, Gemini 대기, 결과 슬롯 반영, 음성·미디어 제작 흐름을 제어하는 프런트 컨트롤러입니다.

### `static/beta-browser-render.js`

브라우저 WebCodecs 기반 MP3·MP4 생성 흐름을 담당합니다.

### `static/assets/beta-mediabunny-webcodecs-renderer-20260724.js`

Mediabunny/WebCodecs 렌더러 번들입니다.

용량이 크고 핵심 렌더 엔진이므로 직접 수정 전에 반드시 전체 백업과 실제 브라우저 완주 검증이 필요합니다.

### `static/archive.html`, `static/beta-archive.js`

Beta 작업 목록과 상세 미디어 표시를 담당합니다.

### `static/storymaker-beta-gemini-worker.user.js`

Gemini 브라우저 탭에서 동작하는 Tampermonkey Worker입니다.

서버 Worker ID와 사용자 스크립트 버전이 일치해야 합니다.

---

## 4. 작업 데이터의 기준점

각 작업의 실제 기준 파일은 다음입니다.

```text
F:\StoryMaker_beta\data\jobs\{beta_job_id}\result.json
```

보조 상태 파일:

```text
state.json
```

DB는 목록과 상태 조회용 인덱스 역할을 하고, 실제 상세 콘텐츠와 자산 경로는 `result.json`이 중심입니다.

현재 `result.json`의 주요 구조:

```json
{
  "schema_version": "beta-2.0",
  "beta_job_id": "beta_...",
  "status": "created",
  "progress": 0,
  "business": {},
  "topic": "",
  "content": {},
  "assets": {
    "images": [],
    "videos": [],
    "music": null,
    "audio": null,
    "mixed_audio": null,
    "subtitle": null,
    "thumbnail": null,
    "video": null,
    "browser_audio": null,
    "browser_video": null
  }
}
```

AI는 새 기능을 추가할 때 임의의 최상위 필드를 늘리기보다, 기존 `content`, `assets`, `browser_render`, `gemini` 구조를 우선 사용해야 합니다.

---

## 5. 현재 확인된 실제 버그

### 5-1. `validate_worker` 함수 누락

`app/beta_gemini_worker.py`에는 다음 호출이 있습니다.

```python
validate_worker(payload.worker_id)
```

호출 위치:

- 썸네일 ACK
- 썸네일 결과 저장

그러나 현재 소스에서 `def validate_worker` 정의를 찾을 수 없습니다.

영향:

- 썸네일 Worker가 ACK를 보내는 순간 `NameError` 가능
- 썸네일 결과 업로드가 500 오류로 실패할 수 있음
- 일반 Gemini 원고 생성은 정상이어도 썸네일 단계만 실패할 수 있음

우선순위:

`P0 즉시 수정 대상`

### 5-2. Gemini Worker Queue가 단일 슬롯

`beta_gemini_worker_state.json` 하나만 사용합니다.

새 작업이 Queue되면 기존 대기 작업 상태를 덮어쓸 수 있습니다.

영향:

- 여러 사용자가 동시에 제작하면 이전 작업 유실 가능
- 오래된 pending과 신규 작업 사이 우선순위 충돌
- 재시도할 때 현재 job_id 불일치 409 발생 가능

현재는 한 PC·한 사용자 개발 환경에서는 동작할 수 있지만 서비스 확장에는 부적합합니다.

### 5-3. 상태 파일 Lock이 프로세스 내부 Lock뿐임

`threading.Lock()`은 같은 Python 프로세스 안에서만 보호합니다.

Uvicorn Worker가 여러 개이거나 재시작·별도 프로세스가 접근하면 파일 상태 경쟁을 막지 못합니다.

필요 개선:

- SQLite Queue 테이블
- 파일 Lock
- 작업별 상태 파일

중 하나로 교체해야 합니다.

### 5-4. V1 프로필 API 직접 의존

`beta_jobs.py`의 `/beta-api/v1-profile`은 다음 주소를 직접 호출합니다.

```text
http://127.0.0.1:8011/v1-api/auth/personas
```

문제점:

- Beta가 완전 독립이라고 보기 어려운 유일한 런타임 의존성
- V1 서버가 꺼지면 자동 업체정보 불러오기 실패
- 쿠키·Authorization 전달 방식이 환경에 따라 실패할 수 있음
- 주소가 코드에 하드코딩됨

이 기능은 편의를 위한 선택적 Bridge로 명시해야 하며, Beta 핵심 제작은 V1 없이도 동작해야 합니다.

### 5-5. 절대경로 하드코딩

다수 Python 파일에 다음 경로가 직접 들어 있습니다.

```python
Path(r"F:\StoryMaker_beta")
```

문제점:

- 다른 드라이브나 PC로 이동하기 어려움
- 테스트 환경 분리 어려움
- 복원 경로가 달라지면 즉시 실패

개선 방향:

```python
ROOT = Path(__file__).resolve().parents[1]
```

또는 환경변수 `STORYMAKER_BETA_ROOT` 사용이 안전합니다.

### 5-6. 서버 TTS가 Beta Supertonic이 아닌 System.Speech 경로를 포함

`beta_make_tts()`는 PowerShell `System.Speech.Synthesis.SpeechSynthesizer`를 사용합니다.

그러나 프로젝트에는 Beta 전용 Supertonic3와 포트 7790이 존재합니다.

즉 현재 음성 생성 경로가 둘로 나뉠 가능성이 있습니다.

- System.Speech 서버 렌더
- Supertonic 또는 브라우저 기반 제작

이 상태는 음색·속도·길이·자막 싱크 차이를 만들 수 있습니다.

장기적으로 음성 생성의 단일 기준 엔진을 정해야 합니다.

### 5-7. SRT가 실제 음성 타임스탬프가 아닌 글자 수 비례

`beta_write_srt()`는 문장 글자 수 비율로 전체 음성 시간을 나눕니다.

문제점:

- 문장별 실제 발화 속도 반영 안 됨
- 숫자·영문·긴 단어가 많은 문장에서 싱크 오차
- 자막이 음성보다 빨리 또는 늦게 끝날 수 있음

현재는 임시 자막 생성기로는 유효하지만 정밀 자막 엔진으로 보면 안 됩니다.

### 5-8. 업로드 파일 검증이 확장자 중심

이미지와 동영상 업로드는 파일 확장자만 검사합니다.

문제점:

- 실제 MIME과 내용이 다른 파일 저장 가능
- 매우 큰 해상도·손상 파일·비정상 파일로 렌더 실패 가능
- 이미지 장수와 총 용량 제한이 백엔드에서 강제되지 않을 수 있음

프런트 제한만 믿지 말고 서버에서 다음을 검사해야 합니다.

- 파일 수
- 개별 크기
- 전체 크기
- MIME
- 실제 디코딩 가능 여부
- 이미지 최대 해상도

### 5-9. 작업 삭제가 실제 영구 삭제

`DELETE /beta-api/jobs/{job_id}`는 격리 이름으로 잠시 변경한 뒤 `shutil.rmtree()`로 실제 삭제합니다.

경로 검증은 들어 있지만 복구 휴지통은 없습니다.

개선 방향:

- `data/trash`로 이동
- 일정 기간 후 정리
- 관리자 최종 삭제

### 5-10. 브라우저 렌더 결과의 완성 상태 동기화 부족

`beta_browser_upload()`는 `assets.browser_audio`, `assets.browser_video`를 저장하지만 작업의 `status`, `progress`, `completed_at`을 반드시 완료 상태로 갱신하지 않습니다.

영향:

- MP4 파일은 존재하지만 목록에는 미완료로 보일 수 있음
- 보관함과 제작 화면의 완료 판정이 달라질 수 있음

브라우저 업로드 성공 시 어떤 자산 조합을 완료로 인정할지 명확한 상태 머신이 필요합니다.

---

## 6. 잠재적 지뢰

### 6-1. V1 코드·번들 복사 실험

현재 작업 트리에는 다음 미커밋 항목이 있습니다.

```text
M app/main.py
?? data/experience_route_excerpt.txt
?? data/shortform_component_excerpt.txt
?? static/shortform-lab/...
```

이는 V1 체험 연구실 또는 BrowserMp4TestPage 관련 코드를 Beta 안으로 독립 복사하는 진행 중 작업으로 보입니다.

주의:

- 파일이 많다고 모두 실제 필요 파일은 아님
- 해시가 다른 BrowserMp4TestPage 번들이 다수 포함됨
- 어떤 번들이 활성본인지 확인하지 않고 전체를 배포하면 용량·충돌·잘못된 import 문제가 생김
- V1 절대 URL과 V1 API 참조가 번들 안에 남아 있을 수 있음
- React 자동 마운트가 Beta DOM과 충돌할 수 있음

현재 이 작업은 완료된 기능으로 간주하면 안 됩니다.

### 6-2. `result.json` 동시 갱신

Gemini Worker, 썸네일 Worker, 브라우저 Upload, 서버 렌더가 모두 `result.json`을 읽고 다시 전체 저장합니다.

서로 거의 동시에 실행되면 먼저 저장된 필드가 나중 저장에서 사라지는 Lost Update 가능성이 있습니다.

개선:

- 작업별 Lock
- DB Transaction
- JSON Patch
- 자산별 별도 상태 파일

### 6-3. DB와 `result.json` 불일치

DB에는 상태와 목록 정보가 있고 실제 자산은 `result.json`에 있습니다.

한쪽만 성공하면 다음 문제가 생깁니다.

- DB 목록에는 있으나 폴더 없음
- 폴더는 있으나 DB 레코드 없음
- `completed`이나 실제 MP4 없음
- 자산은 있으나 보관함 버튼 없음

주기적인 Reconcile 도구가 필요합니다.

### 6-4. Worker 버전 문자열 수동 관리

서버의 허용 Worker ID와 Tampermonkey 스크립트의 실제 ID가 수동으로 맞아야 합니다.

한쪽만 업데이트하면 426 또는 무응답이 발생합니다.

버전 정보는 공통 설정 파일이나 Worker `/version` 응답으로 통합해야 합니다.

### 6-5. 브라우저 기능 감지와 실제 코덱 지원 차이

`VideoEncoder`가 존재한다고 H.264/AAC/MP4 조합이 항상 가능한 것은 아닙니다.

필요한 검사는 단순 객체 존재 여부가 아니라 다음이어야 합니다.

- `VideoEncoder.isConfigSupported()`
- `AudioEncoder.isConfigSupported()`
- 실제 1초 샘플 인코딩
- MP4 Mux 결과 재생 확인

### 6-6. 대형 번들 직접 수정 위험

`beta-mediabunny-webcodecs-renderer-20260724.js`는 1MB 이상 번들입니다.

직접 문자열 치환은 다음 위험이 있습니다.

- minified 코드 손상
- import 경로 손상
- source map 없음
- 작은 문법 오류가 전체 렌더러 중단

가능하면 원본 소스 프로젝트에서 수정 후 재빌드해야 합니다.

---

## 7. 현재 완료된 강점

현재 구조의 좋은 점도 명확합니다.

- V1과 DB·작업 폴더·Python 환경·Supertonic을 분리함
- 작업 ID별 폴더 구조가 명확함
- JSON 저장 시 임시 파일 후 replace 방식 사용
- 작업 ID 경로 검증이 존재함
- 브라우저 렌더와 서버 렌더를 분리함
- 브라우저 생성 파일을 서버 보관함에 저장 가능
- Gemini 원문과 채널별 텍스트를 별도 보존함
- 썸네일 프롬프트와 생성 결과를 작업에 귀속함
- 백업 스크립트와 SHA-256 검증 체계가 있음
- Git 원격 저장소와 안전 문서가 있음

이 구조는 프로토타입 단계를 넘어 독립 제작 시스템의 기반은 이미 갖춘 상태입니다.

---

## 8. 권장 고도화 순서

### 1단계: 즉시 버그 제거

1. `validate_worker()` 정의 추가 및 테스트
2. 썸네일 ACK·결과 API 실제 호출 검증
3. 브라우저 MP4 업로드 후 완료 상태 통일
4. `result.json` 동시 저장 Lock 추가
5. Worker ID 불일치 검사 자동화

### 2단계: 상태 머신 통합

작업 상태를 임의 문자열로 흩어놓지 말고 다음처럼 정의합니다.

```text
created
content_queued
content_claimed
content_completed
voice_creating
subtitle_creating
media_rendering
uploading
completed
failed
cancelled
```

각 상태 전환 조건과 필수 자산을 코드로 고정해야 합니다.

### 3단계: Queue를 SQLite로 이전

현재 단일 JSON Worker 상태를 다음 테이블로 바꾸는 것이 좋습니다.

```text
beta_worker_jobs
- id
- beta_job_id
- job_type
- status
- priority
- worker_id
- attempt
- queued_at
- claimed_at
- completed_at
- error
```

이렇게 하면 여러 작업, 재시도, 우선순위, 장애 복구가 쉬워집니다.

### 4단계: 자산 스키마 고정

`result.json` schema version에 맞는 Pydantic 모델을 만듭니다.

장점:

- 필드 오타 방지
- 누락 자산 탐지
- V1 스타일 데이터 혼입 방지
- 마이그레이션 가능

### 5단계: 렌더 파이프라인 단일화

서버 렌더와 브라우저 렌더 중 무엇을 기본으로 할지 결정해야 합니다.

권장:

```text
기본: 브라우저 WebCodecs
Fallback: 서버 FFmpeg
```

두 결과 모두 동일한 파일명·자산 키·완료 상태를 사용해야 합니다.

### 6단계: 정밀 음성·자막

- Beta Supertonic 7790을 공식 음성 엔진으로 통일
- 음성 생성 시 단어 또는 문장 타임스탬프 확보
- 타임스탬프 기반 SRT 생성
- 음성 해시와 대본 해시가 다르면 자동 재생성

### 7단계: 파일 보안과 안정성

- 업로드 MIME 검사
- Pillow/FFprobe 실제 디코딩 검사
- 최대 장수와 용량 서버 강제
- 파일 이름과 경로를 DB 상대경로로 저장
- 사용자별 작업 소유권 검사
- 삭제 휴지통 도입

### 8단계: 관측성과 진단

작업별 `events.jsonl` 또는 DB Event 테이블을 둡니다.

예:

```text
18:10:01 job_created
18:10:03 gemini_queued
18:10:08 gemini_claimed
18:10:32 gemini_completed
18:10:35 voice_started
18:11:02 browser_mp4_uploaded
18:11:03 job_completed
```

현재 상태만 저장하면 실패 원인 추적이 어렵지만 Event Log가 있으면 정확한 중단 지점을 알 수 있습니다.

---

## 9. 테스트 고도화 방향

현재 tests에는 브라우저 CDP 테스트가 있지만 전체 API 단위 테스트와 상태 전환 테스트가 부족합니다.

필수 테스트:

- 작업 생성
- 잘못된 파일 확장자
- 빈 이미지
- Gemini Queue·ACK·Result
- 구형 Worker 차단
- 썸네일 Queue·ACK·Result
- `validate_worker` 테스트
- 동시에 두 작업 Queue
- result.json 동시 갱신
- 브라우저 MP3만 업로드
- 브라우저 MP4만 업로드
- MP3·MP4 모두 업로드
- DB와 작업 폴더 Reconcile
- 작업 삭제와 복구
- V1 서버가 꺼진 상태의 Beta 제작

완주 테스트 기준:

```text
작업 생성
→ Gemini 8채널
→ 팟캐스트 대본
→ 음성
→ SRT
→ 썸네일
→ MP3
→ MP4
→ 서버 저장
→ 보관함 표시
→ 새로고침 후 유지
```

---

## 10. AI가 작업할 때의 판단 기준

AI는 먼저 다음 질문에 답해야 합니다.

1. 이 변경은 Beta 내부만 수정하는가?
2. V1 API·DB·번들에 새 의존성을 만드는가?
3. `result.json`, DB, 보관함 상태가 함께 갱신되는가?
4. 서버 렌더와 브라우저 렌더 중 어느 경로에 영향을 주는가?
5. 작업 하나만 시험한 결과를 전체 성공으로 오해하고 있지 않은가?
6. Gemini Worker가 단일 슬롯이라는 점을 고려했는가?
7. 새 필드가 기존 schema와 호환되는가?
8. 실제 브라우저에서 완주했는가?
9. 재시작 후에도 상태가 유지되는가?
10. 수정 전 백업과 Git 기준점이 있는가?

---

## 11. 지금 가장 먼저 해야 할 작업

현재 소스만 기준으로 우선순위를 정하면 다음입니다.

```text
P0
- beta_gemini_worker.py의 validate_worker 누락 해결
- 썸네일 Worker 실제 E2E 검증

P1
- 브라우저 업로드 후 completed 상태 통일
- result.json 동시 쓰기 보호
- Gemini 단일 슬롯 Queue 개선

P2
- 절대경로 제거
- V1 프로필 Bridge 선택 기능화
- Supertonic 음성 경로 통일
- 실제 발화 기반 SRT

P3
- 사용자별 권한
- 휴지통 삭제
- Queue Dashboard
- 이벤트 로그
- 자동 복구와 재시도 정책
```

---

## 12. 현재 진행 중 변경에 대한 주의

이 문서 작성 시점의 Git 작업 트리는 깨끗하지 않습니다.

현재 확인된 별도 변경:

```text
M app/main.py
?? data/experience_route_excerpt.txt
?? data/shortform_component_excerpt.txt
?? static/shortform-lab/...
```

이 변경은 이번 분석 문서 작성 작업에서 생성한 것이 아닙니다.

다음 AI는 이 파일들을 임의로 삭제, 복원, 스테이징, 커밋하면 안 됩니다.

먼저 이 변경의 작업 목적과 실제 사용 파일을 확인한 뒤 별도 기능 단위로 검증해야 합니다.

---

## 13. 최종 요약

StoryMaker Beta는 현재 약식 프로토타입이 아니라 독립 제작 시스템의 핵심 골격을 이미 갖춘 상태입니다.

다만 다음 네 가지가 서비스 안정성을 막는 핵심 기술 부채입니다.

```text
1. 단일 슬롯 Gemini Queue
2. result.json 동시 저장 경쟁
3. 음성·렌더 경로의 이중화
4. 상태와 실제 자산의 완료 판정 불일치
```

그리고 즉시 확인해야 할 실제 코드 버그는 다음입니다.

```text
beta_gemini_worker.py의 validate_worker 정의 누락
```

앞으로의 고도화는 UI를 더 화려하게 만드는 것보다 먼저 Queue, 상태 머신, 자산 스키마, 동시성, 실패 복구를 안정화하는 방향으로 진행해야 합니다.

이 기반이 안정되면 Beta는 V1을 건드리지 않고도 독립적으로 콘텐츠 생성부터 MP4와 보관함까지 완주하는 차세대 제작 시스템이 될 수 있습니다.
