# StoryMaker Beta 최종 인수인계

작성일: 2026-07-24

## 작업 대상

- Beta 전용 루트: `F:\StoryMaker_beta`
- Beta 서버: `http://127.0.0.1:8021`
- Beta Supertonic: `http://127.0.0.1:7790`
- GitHub: `https://github.com/kim6410/StoryMaker_Beta.git`
- 브랜치: `main`

## 절대 원칙

- `F:\StoryMaker_V1`은 참고용 읽기만 하고 수정하지 않는다.
- V1 DB, Queue, Worker, Supertonic, FFmpeg 제작 흐름을 사용하지 않는다.
- `.env`, `.venv`, DB, `data\jobs`, 생성 이미지·WAV·MP3·SRT·MP4·WebM, 모델은 GitHub에 올리지 않는다.
- 런타임 자료는 `F:\v1_backup` 날짜별 백업으로 보호한다.

## 현재 완료된 핵심 기능

### 1. Beta 서버 안전 운영

- 8021 서버 안전 재시작 스크립트 적용.
- `.venv` Python만 사용하도록 고정.
- Health Watch는 `wscript.exe` 숨김 실행으로 변경하여 CMD 창 깜빡임 제거.
- `/beta-api/health` HTTP 200 확인.

### 2. 제작 화면 UI

- `주요 서비스`를 `업종`으로 변경.
- 이미지 복수 선택과 동영상 복수 선택 지원.
- 상단 버튼은 `프롬프트 생성`으로 변경.
- 실패 후 수동 버튼은 `AI원고 생성`으로 변경.
- 화면에 노출되는 Gemini 문구는 AI로 변경.
- AI 전송 대기 중 실제 프롬프트를 약 30초 동안 한 줄씩 상태창에 애니메이션 표시.
- AI 입력창 전송 전 실패 기준은 40초.
- AI 입력창에 전송된 뒤에는 답변이 완성될 때까지 시간 제한 없이 대기.

### 3. AI 원고 생성

- SNS 8채널 생성:
  - BLOG
  - NAVER_PLACE
  - GOOGLE_BUSINESS
  - INSTAGRAM
  - CARROT
  - CAROUSEL_7
  - PODCAST_50
  - PODCAST_80
- 결과 영역 제목은 `SNS 채널별 콘텐츠`.
- 채널 내용창 높이는 약 10줄로 고정하고 긴 내용은 내부 스크롤.
- PODCAST_50이 기본 제작 대본.
- PODCAST_50은 첫 줄 여자, 둘째 줄 남자로 교대 작성.
- THUMBNAIL_PROMPT 블록을 함께 생성하고 작업 폴더에 저장.

### 4. 팟캐스트

- 여자 F1, 남자 M1을 줄별로 각각 Supertonic 합성.
- 합성 WAV 조각을 하나의 `voice.wav`로 결합.
- `voice.mp3`, `subtitle.srt`, `dialogue_segments.json` 생성.
- SRT에는 `여자:`와 `남자:` 화자명 없이 대사만 표시.
- 팟캐스트 생성 버튼 클릭 시 이전 manifest, Blob, 미리보기를 초기화.
- 현재 작업의 PODCAST_50으로 음성을 매번 새로 생성.
- 현재 원고 해시와 음성 생성 원고 해시가 일치할 때만 브라우저 MP3 생성 허용.
- 이전 작업 또는 이전 원고 음성 재사용 버그 차단.
- 생성 버튼 클릭 즉시 진행률 애니메이션 시작.
- 완료 즉시 MP3 미리듣기 표시.

최근 서버 검증:

- 작업 ID: `beta_20260724_081135_f26a7d`
- PODCAST_50 음성 재생성 성공.
- 원고 해시와 음성 원고 해시 일치.
- 음성 길이 약 38.66초.

### 5. 슬라이드쇼

- 별도 창과 iframe 없이 딸깍 Beta 하단에 직접 통합.
- 버튼명: `슬라이드쇼 생성`.
- 준비 단계부터 진행률이 움직이도록 개선.
- 자료 준비, 이미지·동영상 로딩, WebGPU 준비, 음성 연결, 실제 프레임 렌더, MP4 마무리 단계로 표시.
- 실제 렌더 중 진행률과 예상 남은 시간 표시.
- 미리보기 크기 270x480에서 351x624로 약 30% 확대.
- SRT 자막과 업체명 워터마크를 Canvas 렌더에 합성.
- 생성된 MP4는 브라우저 미리보기 제공.

주의:

- 현재 브라우저 MediaRecorder 방식은 음성 길이만큼 실시간 렌더가 필요하다. 예를 들어 38초 음성은 실제 렌더도 최소 약 38초 걸린다.
- V1의 완성형 쇼폼 제작 화면을 참고해 진행 상태와 현재 작업 소유권을 보강했지만, V1의 Mediabunny 기반 엔진 자체를 복사한 것은 아니다.

### 6. AI 썸네일

- 팟캐스트 생성 버튼 클릭과 동시에 별도 썸네일 큐 시작.
- 원고 생성 큐와 썸네일 큐를 분리.
- AI가 생성한 실제 이미지를 Worker가 감지하여 `output\thumbnail.jpg`로 저장하는 흐름 추가.
- `result.json`의 `assets.thumbnail`에 연결.
- 제작 화면에서 슬라이드쇼 미리보기 우측에 썸네일 상태와 결과 표시.
- 보관함에서도 실제 썸네일을 우선 표시하고, 없으면 첫 번째 업로드 이미지를 임시 대표 이미지로 사용.

Tampermonkey Worker:

- 최신 버전: `2.1.6`
- 설치/업데이트 주소:
  `http://192.168.0.62:8021/beta-static/storymaker-beta-gemini-worker.user.js`
- AI 원고와 AI 썸네일 모두 응답 또는 이미지가 실제 생성될 때까지 대기하도록 변경.
- Worker 업데이트 후 AI 탭 새로고침 필요.

### 7. 보관함 Beta

- 대형 `제작 데이터 전체 열기/닫기` 영역 제거.
- 상세창에서 자료를 바로 표시.
- 업로드 이미지 표시.
- MP3는 보관함 안에서 바로 미리듣기와 다운로드 지원.
- MP4는 보관함 안에서 바로 미리보기, 전체화면, 크게 보기 지원.
- 썸네일 표시.
- SNS 8채널 탭을 전체 폭으로 배치하고 채널별 컬러 인덱스 스타일 적용.
- PC 8개 한 줄, 중간 화면 4개, 모바일 2개 자동 배치.

## 주요 수정 파일

- `app\beta_browser.py`
- `app\beta_gemini.py`
- `app\beta_gemini_worker.py`
- `app\beta_steps.py`
- `static\production.html`
- `static\beta-production.js`
- `static\beta-browser-render.js`
- `static\storymaker-beta-gemini-worker.user.js`
- `static\archive.html`
- `static\beta-archive.js`
- `RUNTIME_BACKUP_AND_RESTORE.md`
- `V1_BETA_BACKUP.bat`
- `V1_BETA_BACKUP.ps1`
- `run_beta_health_hidden.vbs`

## Git 제외 런타임 자료

- `.env`
- `.venv`
- `data\storymaker_beta.db`
- `data\jobs`
- `Supertonic3`
- `tools\ffmpeg.exe`
- `logs`
- `backups`
- 생성 이미지
- WAV
- MP3
- SRT
- MP4
- WebM

## 백업 위치

주요 시점 백업:

- `F:\v1_backup\BETA_WORKING_20260724_170500_ui_autocontent_video_before`
- `F:\v1_backup\BETA_WORKING_20260724_183000_dialog_srt_watermark_thumbnail_before`
- `F:\v1_backup\BETA_WORKING_20260724_190000_progress_preview_slideshow_fix_before`
- `F:\v1_backup\BETA_WORKING_20260724_193000_archive_media_tabs_before`
- `F:\v1_backup\BETA_WORKING_20260724_201500_ai_prompt_status_before`
- `F:\v1_backup\BETA_WORKING_20260724_203500_thumbnail_worker_preview_before`
- `F:\v1_backup\BETA_WORKING_20260724_211500_ai_wait_current_media_before`

## 다음 채팅에서 첫 검증 순서

1. Tampermonkey Worker가 2.1.6인지 확인하고 AI 탭 새로고침.
2. Beta 화면 강력 새로고침.
3. 새 작업으로 `프롬프트 생성` 실행.
4. AI 입력창 전송 전 40초 제한과 전송 후 무기한 대기 확인.
5. SNS 8채널과 PODCAST_50 여자·남자 교대 확인.
6. `팟캐스트 생성` 실행.
7. 현재 작업 PODCAST_50으로 새 음성이 생성되는지 미리듣기 확인.
8. SRT 화자명 제거 확인.
9. 백그라운드 AI 썸네일 생성과 프런트 미리보기 확인.
10. `슬라이드쇼 생성` 실행 후 진행률·남은 시간·자막·워터마크 확인.
11. `보관함 바로가기`를 눌러 MP3·썸네일·MP4 저장과 미리보기 확인.

## 아직 남은 실제 브라우저 완주 검증

- Worker 2.1.6에서 AI 썸네일 이미지 생성부터 `thumbnail.jpg` 저장까지 실제 완주.
- 새 작업 기준 팟캐스트 → SRT → 슬라이드쇼 MP4 → 보관함 저장 전체 완주.
- MP4 렌더 속도가 사용성 기준에 부족하면 V1의 Mediabunny/WebCodecs 엔진을 Beta 전용으로 별도 이식할지 검토.

## 다음 채팅 시작 문장

`F:\StoryMaker_beta\WORK_LOGS\2026-07-24_StoryMaker_Beta_AI원고_팟캐스트50_슬라이드쇼_썸네일_보관함_최종_인수인계.md 문서를 먼저 확인하고, Tampermonkey Worker 2.1.6 상태에서 새 작업 전체 완주 테스트를 진행해줘. F:\StoryMaker_V1은 절대 수정하지 마.`
