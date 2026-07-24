# StoryMaker Beta 통합 제작 화면 개발 인수인계

작성일: 2026-07-24

## 1. 현재 프로젝트

작업 대상은 StoryMaker Beta입니다.

작업 루트:

`F:\StoryMaker_beta`

현재 진행률:

약 60~65%

이번 작업의 중심은 이미 정상 동작하는 Beta 제작 엔진을 새로 만드는 것이 아니라, 현재 분리된 제작 단계를 하나의 사용자 흐름으로 통합하는 것입니다.

현재 기능 구현 범위만 보면 더 높은 진행률로 볼 수 있으나, 통합 버튼·재사용 정책·자동 저장·미리보기 이동·전체 브라우저 완주 검증이 남아 있으므로 이번 통합 화면 개발 기준 진행률은 60~65%로 관리합니다.


## 2. 절대 수정 금지

아래 대상은 절대 수정하지 않습니다.

- `F:\StoryMaker_V1`
- 기존 V1 제작 엔진
- 기존 V1 DB
- 기존 V1 Supertonic
- 기존 V1 Worker
- 기존 Docker
- 운영 V2
- 공용 Queue
- 공용 FFmpeg
- 공용 Podcast
- 공용 MP4 제작
- 공용 포트 7788
- V1 보호 번들

이번 작업은 아래 경로만 대상으로 합니다.

`F:\StoryMaker_beta`

V1은 필요한 경우 구조 확인을 위한 읽기 참고만 허용하며 파일 수정, 복사 적용, 컴포넌트 이식은 금지합니다.


## 3. 현재 실행 환경

Beta 웹 서버:

`http://127.0.0.1:8021`

제작 화면:

`http://127.0.0.1:8021/beta/production`

보관함:

`http://127.0.0.1:8021/beta/archive`

Beta Supertonic:

`http://127.0.0.1:7790`

Beta 전용 DB:

`F:\StoryMaker_beta\data\storymaker_beta.db`

Beta 작업 폴더:

`F:\StoryMaker_beta\data\jobs`

현재 확인 시점에 8021과 7790 포트는 정상 LISTEN 상태이며 `/beta-api/health`는 HTTP 200과 `ok: true`를 반환했습니다.


## 4. 현재 Git 기준점

작업 시작 전 반드시 아래를 확인합니다.

```bat
cd /d F:\StoryMaker_beta
git status
git rev-parse HEAD
git log -5 --oneline
```

현재 최신 기준 커밋:

`9ad3318 fix(beta): initialize archive images before thumbnail fallback`

최근 주요 커밋:

```text
9ad3318 fix(beta): initialize archive images before thumbnail fallback
9ef67dd feat(beta): stabilize Gemini priority and WebCodecs slideshow rendering
45fe24f feat: complete Beta AI podcast slideshow thumbnail archive flow
4224109 Beta Gemini 재전송 동작 연결
bf9d824 Beta Gemini 재전송 버튼 반영
```

현재 Git 작업 트리에는 기존 변경이 남아 있습니다.

수정 파일:

- `V1_BETA_BACKUP.ps1`
- `static/archive.html`

비추적 새 파일:

- `static/beta-archive-detail-fix-20260724.js`

이 변경은 이번 통합 제작 화면 작업 전에 보존해야 합니다.

임의로 복원, 삭제, 덮어쓰기, 스테이징 또는 커밋하지 않습니다.


## 5. 현재 정상 동작 확인 기능

아래 기능은 이미 구현되어 있고 기존 업무일지와 최근 작업 데이터에서 정상 흐름이 확인됐습니다.

- Gemini SNS 8채널 생성
- Beta Supertonic
- TTS 생성
- SRT 생성
- 브라우저 MP3 생성
- Mediabunny/WebCodecs 기반 MP4 생성
- 이미지 복수 선택
- 동영상 복수 선택
- 썸네일 생성 흐름
- Beta 보관함 저장
- Beta 보관함 상세보기
- 현재 작업 ID 기준 매니페스트 조회
- SRT 자막 Canvas 합성
- 업체명 워터마크 Canvas 합성
- 현재 원고와 음성 원고 해시 비교
- Gemini Worker claimed 작업 재처리
- PODCAST_50 기본 대본 사용

핵심 판단:

엔진은 이미 존재합니다.

새 TTS 엔진, 새 MP3 엔진, 새 MP4 엔진, 새 보관함 저장 엔진을 만들면 안 됩니다.

이번 작업은 기존 검증 엔진을 호출하는 사용자 경험 통합 작업입니다.


## 6. 현재 화면 구조

현재 제작 화면에는 아래 버튼이 각각 존재합니다.

```text
팟캐스트 생성
슬라이드쇼 생성
보관함 바로가기
```

실제 HTML 확인 위치:

`F:\StoryMaker_beta\static\production.html`

현재 버튼 영역에는 다음 ID가 사용됩니다.

```text
mp3
mp4
upload
```

현재 진행률도 두 구역으로 분리돼 있습니다.

- 팟캐스트 생성 진행률
- 슬라이드쇼 생성 진행률

이 구조를 사용자 관점에서 하나의 통합 제작 흐름으로 변경합니다.


## 7. 이번 작업 목표

현재 흐름:

```text
팟캐스트 생성
↓
슬라이드쇼 생성
↓
보관함 바로가기
```

목표 흐름:

```text
영상 만들기
```

사용자는 버튼 하나만 누릅니다.

버튼 내부에서 필요한 단계가 순서대로 실행되고, 최종 MP4 저장 후 미리보기 위치로 자동 이동합니다.


## 8. 최종 통합 제작 흐름

버튼명:

`영상 만들기`

내부 실행 순서:

1. 현재 작업 ID와 작업 데이터 확인
2. PODCAST_50 대본 확인
3. TTS 생성 또는 기존 결과 재사용
4. SRT 생성 또는 기존 결과 재사용
5. 음악 사용 여부와 파일 확인
6. MP3 생성 또는 기존 결과 재사용
7. 이미지·동영상 장면 준비
8. 워터마크 데이터 준비
9. Mediabunny/WebCodecs MP4 생성
10. 같은 job_id에 결과 저장
11. Beta 보관함 반영
12. MP4 미리보기 영역으로 자동 이동
13. 미리보기와 다운로드 버튼 활성화

사용자는 내부 단계별 버튼을 누르지 않습니다.


## 9. 반드시 재사용할 기존 함수

대상 파일:

`F:\StoryMaker_beta\static\beta-browser-render.js`

실제 확인된 함수:

```javascript
async function encodeMp3()
async function renderMp4()
```

확인된 위치:

- `encodeMp3()` 약 270행
- `renderMp4()` 약 355행

두 함수는 새로 복사하거나 이름을 바꿔 재작성하지 않습니다.

새로 추가할 통합 함수는 아래 하나만 허용합니다.

```javascript
async function createAllMedia()
```

기본 호출 원칙:

```javascript
await encodeMp3();
await renderMp4();
```

단, 실제 구현에서는 TTS·SRT 준비 API가 현재 어느 버튼 핸들러에서 호출되는지 먼저 확인하고, 기존 준비 로직도 복사하지 않고 기존 함수 또는 이벤트 흐름을 재사용해야 합니다.

기존 함수 내부의 업로드·저장 동작을 중복 호출하지 않도록 반환값과 상태 변화를 먼저 확인합니다.


## 10. 작업 시작 전 필독 자료

아래 자료를 모두 읽고 현재 코드와 기록이 일치하는지 확인한 뒤 수정합니다.

최상위 안전 규칙:

`F:\StoryMaker_V1\00_READ_FIRST.md`

현재 프로젝트:

`F:\StoryMaker_beta`

업무일지:

`F:\StoryMaker_beta\WORK_LOGS\`

백업 스크립트:

`F:\StoryMaker_beta\V1_BETA_BACKUP.ps1`

최근 실패 백업:

`F:\v1_backup\V1_BETA0724\`

제작 화면:

`F:\StoryMaker_beta\static\production.html`

제작 JavaScript:

`F:\StoryMaker_beta\static\beta-production.js`

`F:\StoryMaker_beta\static\beta-browser-render.js`

서버:

`F:\StoryMaker_beta\app\beta_browser.py`

`F:\StoryMaker_beta\app\beta_jobs.py`

작업 데이터:

`F:\StoryMaker_beta\data\jobs\`

최근 작업의 아래 파일을 우선 확인합니다.

- `result.json`
- manifest 관련 JSON 또는 `/beta-api/browser/jobs/<job_id>/manifest` 응답
- `state.json`이 존재하면 함께 확인
- 브라우저 저장 결과가 존재하면 해당 경로 확인


## 11. 실제 작업 데이터 구조 확인 결과

최근 확인 작업 ID:

`beta_20260724_161252_5af712`

실제 `result.json`의 주요 구조는 다음과 같습니다.

```text
beta_job_id
business.name
business.region
business.service
business.phone
content.channels
content.podcast_50
content.podcast_80
content.podcast_script
content.script
content.thumbnail_prompt
assets.images
assets.videos
assets.music
assets.audio
assets.mixed_audio
assets.subtitle
assets.thumbnail
assets.video
assets.voice_script_hash
gemini.source
duration_seconds
tts.engine
tts.voices
tts.segments
```

현재 실제 필드명은 아래와 같습니다.

업체명:

`business.name`

전화번호:

`business.phone`

지역:

`business.region`

업종 또는 서비스:

`business.service`

자막 파일:

`assets.subtitle`

음성 또는 MP3:

`assets.audio`

음악 믹싱 결과:

`assets.mixed_audio`

썸네일:

`assets.thumbnail`

서버 제작 영상:

`assets.video`

브라우저 제작 결과는 `beta_browser.py`에서 별도 저장 키를 사용합니다.

```text
browser_audio
browser_video
```

현재 `result.json`에는 `subtitle_segments`라는 최상위 필드가 확인되지 않았습니다.

따라서 `subtitle_segments`를 새로 가정해 연결하지 않습니다.

현재 자막의 단일 기준은 기존 TTS 흐름에서 생성된 `subtitle.srt`와 브라우저 매니페스트의 `subtitle` URL입니다.

향후 세그먼트 데이터가 필요하면 기존 `dialogue_segments.json`, SRT 생성 로직 또는 현재 API 반환값을 먼저 확인해야 합니다.


## 12. 현재 브라우저 매니페스트 구조

대상 파일:

`F:\StoryMaker_beta\app\beta_browser.py`

확인된 주요 항목:

```text
beta_job_id
watermark
thumbnail_prompt
voice_wav
subtitle
images
videos
script_hash
voice_script_hash
script_key
```

워터마크 기본값은 다음 순서입니다.

```text
business.name
없으면 StoryMaker Beta
```

브라우저 렌더러는 현재 매니페스트의 `subtitle` URL에서 SRT를 읽고 Canvas에 자막을 합성합니다.

현재 자막을 별도로 다시 계산하면 안 됩니다.


## 13. 백업 스크립트 수정 목표

대상:

`F:\StoryMaker_beta\V1_BETA_BACKUP.ps1`

현재 백업은 대부분 완료됐지만 SQLite 처리에서 실패하는 문제가 있습니다.

수정 목표:

### Git 경고 처리

Git의 아래 경고를 백업 실패로 처리하지 않습니다.

```text
LF will be replaced by CRLF
CRLF will be replaced by LF
```

경고와 실제 오류를 구분합니다.

Git 명령의 종료 코드와 실제 실패 메시지를 기준으로 판정합니다.

### SQLite 온라인 백업

대상 DB:

`F:\StoryMaker_beta\data\storymaker_beta.db`

실행 중인 DB를 단순 파일 복사로만 처리하지 않고 SQLite 온라인 백업 방식으로 안전하게 저장합니다.

백업 후 복사본에 다음 검사를 수행합니다.

```sql
PRAGMA integrity_check;
```

성공 조건:

```text
STATUS=PASS
ERRORS=0
sqlite integrity_check=ok
```

### SHA-256 비교 정책

SQLite 온라인 백업본은 논리적으로 동일하더라도 WAL 반영, 페이지 배치, 헤더 상태 차이로 원본 DB와 SHA-256이 다를 수 있습니다.

따라서 온라인 백업 DB는 원본 DB와 동일 SHA-256을 요구하는 비교 대상에서 제외합니다.

대신 다음으로 검증합니다.

- 백업 파일 존재
- 크기 0 초과
- SQLite 열기 성공
- `PRAGMA integrity_check` 결과 `ok`
- 주요 테이블 목록 확인
- 가능하면 핵심 테이블 레코드 수 비교

최근 실패 백업 위치:

`F:\v1_backup\V1_BETA0724\`

해당 폴더의 로그와 상태 파일을 먼저 확인한 뒤 실패 지점을 최소 수정합니다.

백업 스크립트 전체 덮어쓰기는 금지합니다.

SQLite 처리 블록과 Git 경고 판정 블록만 정확히 수정합니다.


## 14. UI 변경

기존 버튼:

```text
팟캐스트 생성
슬라이드쇼 생성
```

두 버튼은 사용자 화면에서 제거하고 아래 버튼 하나로 통합합니다.

```text
영상 만들기
```

보관함 이동 버튼은 제작 완료 후 보조 기능으로 유지할 수 있으나, 기본 제작 완료 시 자동 저장돼야 하므로 핵심 CTA가 되어서는 안 됩니다.

통합 화면은 크게 좌우 2열 구조로 구성합니다.

왼쪽 설정·상태 영역:

- 음성
- 배경음악
- 자막
- 워터마크
- 영상 제작 통합 진행률
- 단계별 상태

오른쪽 결과 영역:

- 9:16 세로형 영상 미리보기
- MP4 다운로드
- MP3 재생
- 썸네일 표시

모바일에서는 1열로 자연스럽게 내려가야 합니다.


## 15. 통합 진행률

현재 두 개의 진행률을 하나로 합칩니다.

기존:

```text
팟캐스트 생성 진행률
슬라이드쇼 생성 진행률
```

변경:

```text
영상 제작 68%
```

단계 표시 예시:

```text
원고        완료
TTS         완료
SRT         완료
MP3         진행
MP4         대기
보관함 저장 대기
```

진행률은 실제 단계 완료 시점에만 변경합니다.

시간 기반 가짜 진행률만 사용하지 않습니다.

각 단계 실패 시 전체를 막연한 실패로 표시하지 말고 실패 단계와 원인을 표시합니다.

재시도 시 이미 완료된 단계는 재사용 정책에 따라 건너뜁니다.


## 16. 음악 정책

UI에는 아래 두 상태만 노출합니다.

```text
자동
사용 안 함
```

기존 음악 볼륨 슬라이더는 제거합니다.

내부 기본 정책:

```text
음성 100%
음악 8~15%
자동 감쇠
```

정확한 기본 음악 볼륨은 기존 브라우저 믹싱 로직에서 실제 사용하는 값을 확인한 후 하나의 기준으로 확정합니다.

새 믹서 또는 새 오디오 엔진을 만들지 않습니다.

음악 파일이 없거나 `사용 안 함`이면 음성만 사용합니다.

음악 파일이 있고 `자동`이면 기존 믹싱 경로를 재사용합니다.


## 17. TTS 정책

기본값:

`1인 음성`

선택값:

`2인 음성`

현재 Beta Supertonic은 여성 F1과 남성 M1을 교대로 합성하는 2인 대화 흐름이 이미 존재합니다.

1인 음성은 기존 Beta Supertonic이 실제로 지원하는 단일 화자 호출 경로를 확인한 뒤 연결해야 합니다.

새 TTS 구현은 금지합니다.

1인 음성 선택 시 기존 대본의 화자 접두어 처리 방식과 사용할 기본 음성 F1 또는 M1을 확정해야 합니다.

2인 음성 선택 시 현재 PODCAST_50 줄별 여성·남성 교대 방식을 그대로 재사용합니다.


## 18. 자막 정책

자막은 동일 데이터 계보를 사용합니다.

```text
PODCAST_50 대본
↓
기존 TTS 세그먼트
↓
subtitle.srt
↓
브라우저 Canvas
↓
최종 MP4
```

별도 자막 시간 계산 로직을 추가하지 않습니다.

서버에서 생성한 SRT와 브라우저에서 표시하는 자막이 서로 달라지면 안 됩니다.

현재 브라우저 렌더러는 매니페스트의 `subtitle` URL을 읽어 `parseSrt()` 후 Canvas에 합성합니다.

이 흐름을 유지합니다.


## 19. 워터마크 정책

상단 워터마크:

- `StoryMaker Beta`
- 또는 업체명
- 또는 콘텐츠 제목

하단 정보:

- 업체명
- 전화번호
- 지역

자막과 하단 업체정보가 겹치지 않도록 안전영역을 확보합니다.

권장 안전영역:

- 상단 텍스트는 화면 상단 5~12% 영역
- 자막은 하단 18~32% 영역
- 업체정보는 최하단 5~12% 영역

현재 `drawSubtitleAndWatermark(time)` 함수가 존재하므로 새 Canvas 렌더 함수를 만들지 않고 해당 함수의 데이터 입력과 배치만 최소 수정합니다.


## 20. 완료 후 자동 이동

최종 MP4 생성과 보관함 저장이 완료되면 영상 미리보기 영역으로 자동 이동합니다.

사용 방식:

```javascript
previewElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
previewElement.focus({ preventScroll: true });
```

미리보기 컨테이너에는 `tabindex="-1"`을 부여합니다.

자동 이동 시 사용자가 입력하던 위치를 중간 단계에서 빼앗지 않습니다.

최종 완료 시 한 번만 실행합니다.


## 21. 저장 구조

모든 결과는 같은 `job_id`를 사용합니다.

논리 구조:

```text
job
├─ audio.mp3
├─ subtitle.srt
├─ thumbnail.jpg
├─ video.mp4
└─ result.json
```

현재 실제 파일명과 경로는 기존 엔진을 따릅니다.

예:

```text
output\voice.mp3
output\subtitle.srt
output\thumbnail.jpg
browser\audio.mp3 또는 현재 browser 저장 경로
browser\video.mp4 또는 현재 browser 저장 경로
result.json
```

새 파일명을 강제로 도입하지 않습니다.

`beta_browser.py`의 현재 저장 키와 실제 저장 경로를 확인한 뒤 보관함과 동일하게 연결합니다.


## 22. 재생성 정책

입력과 설정이 변경되지 않았다면 기존 결과를 재사용합니다.

예시:

### 워터마크만 변경

```text
기존 TTS 재사용
기존 SRT 재사용
기존 MP3 재사용
MP4만 재생성
```

### TTS 설정 변경 없음

```text
기존 MP3 재사용
MP4만 생성
```

### 대본 변경

```text
TTS 재생성
SRT 재생성
MP3 재생성
MP4 재생성
```

### 음악 설정만 변경

```text
TTS 재사용
SRT 재사용
오디오 믹싱 또는 MP3 재생성
MP4 재생성
```

재사용 판정은 화면 상태만 보고 하지 않습니다.

다음 해시 또는 실제 파일 기준을 사용합니다.

- 현재 대본 해시
- `voice_script_hash`
- 음성 파일 존재와 크기
- SRT 파일 존재와 크기
- 음악 파일 또는 음악 설정 해시
- 워터마크 설정 해시
- 이미지·동영상 목록과 수정 정보
- MP4 생성 설정 해시

현재 존재하는 원고 해시 검증 로직을 우선 재사용합니다.


## 23. 수정 대상 파일

우선 읽고 수정 범위를 확정할 파일:

- `F:\StoryMaker_beta\static\production.html`
- `F:\StoryMaker_beta\static\beta-production.js`
- `F:\StoryMaker_beta\static\beta-browser-render.js`
- `F:\StoryMaker_beta\app\beta_browser.py`
- `F:\StoryMaker_beta\app\beta_jobs.py`
- `F:\StoryMaker_beta\V1_BETA_BACKUP.ps1`

예상 최소 수정 파일:

- `static\production.html`
- `static\beta-browser-render.js`
- 필요 시 `static\beta-production.js`
- 필요 시 `app\beta_browser.py`
- `V1_BETA_BACKUP.ps1`

`app\beta_jobs.py`는 현재 데이터 구조와 기존 TTS 준비 API 확인을 위해 먼저 읽되, 기존 흐름으로 해결 가능하면 수정하지 않습니다.


## 24. 수정 원칙

- 기존 함수 복사 금지
- 기존 함수 전체 재작성 금지
- React 마운트 금지
- V1 컴포넌트 가져오기 금지
- 기존 V1 번들 복사 금지
- 새 MP3 엔진 작성 금지
- 새 MP4 엔진 작성 금지
- 새 TTS 엔진 작성 금지
- 새 SRT 계산 엔진 작성 금지
- 기존 파일 전체 덮어쓰기 금지
- `Set-Content` 사용 금지
- 와일드카드 기반 수정·삭제 금지
- 기존 Git 변경 임의 복원 금지

필요한 기존 렌더 함수와 API만 재사용합니다.

수정은 함수 또는 HTML 블록 단위의 안전한 부분 치환으로 진행합니다.


## 25. 작업 단계

### STEP 1. Windows MCP 확인

- MCP ping
- `F:\StoryMaker_beta` 존재 확인
- 파일 읽기·명령 실행 가능 여부 확인

### STEP 2. Git 상태 확인

```bat
cd /d F:\StoryMaker_beta
git status
git rev-parse HEAD
git log -5 --oneline
```

현재 기준 커밋 `9ad3318`과 비교합니다.

### STEP 3. 백업 스크립트 점검과 수정

- 최근 실패 로그 확인
- Git LF/CRLF 경고 판정 수정
- SQLite 온라인 백업 확인
- `PRAGMA integrity_check` 적용
- 온라인 백업 DB SHA-256 동일 비교 제외
- 수정 전 관련 파일 백업
- 부분 수정
- 백업 재실행

성공 조건:

```text
STATUS=PASS
ERRORS=0
sqlite integrity_check=ok
```

### STEP 4. 최신 작업 데이터 확인

- 최근 작업 ID 확인
- `result.json` 확인
- manifest API 확인
- 실제 필드명 확인
- 기존 생성 파일 경로 확인

### STEP 5. 기존 버튼 이벤트 흐름 확인

- 팟캐스트 버튼 클릭 핸들러
- 슬라이드쇼 버튼 클릭 핸들러
- 보관함 저장 또는 업로드 핸들러
- `encodeMp3()` 반환값과 상태
- `renderMp4()` 반환값과 상태
- TTS 준비 API 호출 위치
- 썸네일 큐 시작 위치

### STEP 6. 통합 함수 추가

`createAllMedia()`만 추가합니다.

기존 준비 흐름을 호출하고 아래 두 함수를 순서대로 재사용합니다.

```javascript
await encodeMp3();
await renderMp4();
```

중복 실행 방지 가드를 둡니다.

### STEP 7. UI 통합

- 팟캐스트 생성 버튼 제거
- 슬라이드쇼 생성 버튼 제거
- 영상 만들기 버튼 추가
- 통합 진행률 추가
- 단계별 상태 추가
- 설정과 미리보기 2열 배치
- 모바일 1열 적용
- 볼륨 슬라이더 제거

### STEP 8. 저장과 자동 이동

- 동일 job_id 확인
- MP3 저장 확인
- MP4 저장 확인
- 보관함 반영 확인
- 미리보기 URL 갱신
- 다운로드 활성화
- `scrollIntoView()` 실행
- `focus()` 실행

### STEP 9. 실제 브라우저 완주 검증

```text
콘텐츠 자동생성
↓
영상 만들기
↓
TTS
↓
SRT
↓
MP3
↓
MP4
↓
보관함 저장
↓
MP4 미리보기 자동 이동
↓
다운로드 확인
```

### STEP 10. Git 종료 절차

```bat
git status
git diff
```

문법·HTTP·브라우저 검증 후 사용자 승인에 따라 정확한 파일만 스테이징합니다.

```bat
git add -- "정확한 파일 경로"
git diff --cached
git commit -m "Beta 영상 만들기 통합 제작 흐름 및 백업 검증 안정화"
git push
```

사용자 승인 없이 커밋·Push하지 않습니다.


## 26. 완료 후 검증 항목

### 문법 검사

- Python `py_compile`
- JavaScript `node --check`

### HTTP 검사

- `/beta-api/health`
- `/beta/production`
- `/beta/archive`
- 현재 작업 manifest API

### 기능 검사

- Gemini SNS 8채널 완료
- PODCAST_50 정상 연결
- 1인 또는 2인 TTS 선택 반영
- SRT 생성
- 브라우저 MP3 생성
- 이미지 로딩
- 복수 동영상 로딩
- 음악 자동 믹싱 또는 미사용
- 워터마크 표시
- 자막 안전영역 표시
- Mediabunny/WebCodecs MP4 생성
- 같은 job_id 저장
- 보관함 표시
- 미리보기 자동 이동
- MP4 재생
- MP4 다운로드
- MP3 재생
- 새로고침 후 상태 유지

문법 검사만 통과한 상태를 완료로 기록하지 않습니다.

실제 브라우저에서 새 작업 하나를 처음부터 끝까지 완주해야 성공입니다.


## 27. 현재 확인된 주의사항

### 한글 출력 깨짐

PowerShell 기본 `Get-Content`를 통해 최근 `result.json`을 출력했을 때 한글이 깨져 보였습니다.

파일 자체 손상인지 콘솔 인코딩 문제인지 아직 확정하지 않습니다.

실제 브라우저 화면과 UTF-8 방식 파일 읽기로 확인해야 합니다.

수정 과정에서 인코딩을 임의 변환하지 않습니다.

### `subtitle_segments` 필드 없음

현재 최근 `result.json`에서 `subtitle_segments`는 확인되지 않았습니다.

없는 필드를 전제로 새 연결을 만들지 않습니다.

현재 SRT 파일과 매니페스트 URL을 단일 기준으로 사용합니다.

### 브라우저 저장 키와 서버 저장 키 구분

현재 `assets.audio`, `assets.video`와 브라우저 결과 키 `browser_audio`, `browser_video`가 별도로 존재할 수 있습니다.

보관함이 어느 키를 우선 표시하는지 확인한 뒤 통합 저장 흐름을 연결합니다.

### 백업 스크립트 기존 변경 보존

`V1_BETA_BACKUP.ps1`은 이미 수정 상태입니다.

기존 변경 내용을 먼저 Diff로 확인하고 필요한 부분만 이어서 수정합니다.


## 28. 추가 확인이 필요한 결정 사항

작업을 시작하기 전에 아래 정책을 확정하거나 현재 코드에서 답을 찾아야 합니다.

### 1인 음성 기본 화자

1인 음성 선택 시 기본 화자를 무엇으로 사용할지 결정이 필요합니다.

후보:

- 여성 F1
- 남성 M1
- 기존 사용자 설정값이 있으면 해당 값

현재 요청만으로는 기본 화자가 명시되지 않았습니다.

### 상단 워터마크 우선순위

상단 워터마크 후보가 다음 세 가지로 제시돼 있습니다.

- StoryMaker Beta
- 업체명
- 제목

실제 기본 우선순위를 하나로 확정해야 합니다.

현재 코드의 기본값은 업체명이 있으면 업체명, 없으면 `StoryMaker Beta`입니다.

### 음악 자동 볼륨 기준

음악 8~15% 범위 중 실제 기본값과 자동 감쇠 기준을 현재 믹싱 구현에서 확인해야 합니다.

기존 구현 값이 있으면 그대로 사용합니다.

### 보관함 버튼 처리

통합 제작 완료 후 자동 저장이 정상이라면 `보관함 바로가기`는 이동 링크로 유지할지, 제작 화면에서 제거할지 최종 UI 결정을 확인해야 합니다.


## 29. 원본 소스 기준

이번 작업의 원본 소스는 별도 외부 소스가 아니라 현재 `F:\StoryMaker_beta`의 최신 Git 기준 파일입니다.

기준 커밋:

`9ad3318`

단, 현재 작업 트리에 커밋되지 않은 아래 파일이 있으므로 이 변경도 원본 상태의 일부로 보존해야 합니다.

- `V1_BETA_BACKUP.ps1`
- `static/archive.html`
- `static/beta-archive-detail-fix-20260724.js`

V1 소스, 이전 백업본, 다른 프로젝트 파일을 원본처럼 가져와 덮어쓰지 않습니다.

기능 참고가 필요하면 현재 Beta 코드와 업무일지를 우선합니다.


## 30. 롤백 원칙

통합 제작 화면 수정 전 관련 파일을 `F:\v1_backup`에 고유 시각 이름으로 백업합니다.

권장 백업명:

`BETA_WORKING_20260724_HHMMSS_통합_영상만들기_수정전`

백업 대상:

- `static\production.html`
- `static\beta-production.js`
- `static\beta-browser-render.js`
- 수정하는 경우 `app\beta_browser.py`
- 수정하는 경우 `app\beta_jobs.py`
- `V1_BETA_BACKUP.ps1`
- 현재 Git Diff

문제가 발생하면 추가 패치를 누적하지 않고 수정 전 백업과 Git Diff를 비교해 기능 단위로 원복합니다.

DB와 생성 미디어는 임의로 삭제하거나 되돌리지 않습니다.


## 31. 최종 목표

기존에 이미 검증된 StoryMaker Beta 엔진을 그대로 재사용합니다.

재사용 대상:

- Gemini SNS 8채널
- Beta Supertonic TTS
- 기존 SRT 생성
- `encodeMp3()`
- `renderMp4()`
- Mediabunny/WebCodecs MP4
- 기존 썸네일 흐름
- 기존 보관함 저장

사용자 경험만 개선합니다.

최종 사용자는 `영상 만들기` 버튼을 한 번 누르면 됩니다.

같은 작업 ID 안에서 TTS, SRT, MP3, MP4, 썸네일, 보관함 저장이 하나의 흐름으로 완료되고, 마지막에는 MP4 미리보기로 자동 이동해야 합니다.

새 엔진을 만드는 것이 아니라 이미 정상인 엔진을 정확히 묶는 것이 이번 작업의 핵심입니다.


## 32. 다음 채팅 시작 문장

```text
F:\StoryMaker_beta\WORK_LOGS\2026-07-24_StoryMaker_Beta_통합_영상만들기_개발_인수인계.md를 먼저 읽어줘.
작업 대상은 F:\StoryMaker_beta만이며 F:\StoryMaker_V1과 운영 V2는 절대 수정하지 마.
먼저 Git 상태와 최근 작업 result.json·manifest를 확인하고, V1_BETA_BACKUP.ps1의 SQLite 온라인 백업과 LF/CRLF 경고 판정을 안전하게 수정해 STATUS=PASS, ERRORS=0, integrity_check=ok를 확인해.
그다음 기존 encodeMp3()와 renderMp4()를 복사하지 말고 createAllMedia()에서 재사용해 팟캐스트 생성과 슬라이드쇼 생성을 영상 만들기 버튼 하나로 통합해.
```
