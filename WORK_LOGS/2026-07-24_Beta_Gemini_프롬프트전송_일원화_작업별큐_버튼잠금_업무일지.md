# StoryMaker Beta Gemini 프롬프트 전송 일원화 및 작업별 큐 안정화 업무일지

작성일: 2026-07-24

## 작업 대상

- F:\StoryMaker_beta
- V1 및 V2 수정 없음
- 공용 Gemini 환경 수정 없음

## 수정 전 백업

F:\v1_backup\BETA_WORKING_20260724_231500_Gemini통신_일원화_수정전

백업 포함:

- static\production.html
- static\beta-production.js
- static\beta-browser-render.js
- static\beta-shortform-inline.js
- static\storymaker-beta-gemini-worker.user.js
- app\beta_gemini_worker.py
- data\storymaker_beta.db
- 수정 전 Git diff

## 확인된 근본 원인

1. Gemini Worker 상태가 단일 전역 JSON 한 개여서 새로운 작업이 이전 작업을 덮어쓸 수 있었음.
2. 프롬프트 생성과 AI 원고 생성 흐름이 분리되지 않고 프롬프트 생성 직후 자동 큐 등록이 수행됐음.
3. result.json, 작업 state.json, Worker 상태가 서로 독립적으로 움직여 성공 후에도 created / 0 상태가 남았음.
4. 사용자 중복 클릭을 차단하는 작업별 잠금과 멱등 큐 등록이 없었음.
5. Gemini 입력창 준비 지연을 30초 만에 실패 처리했음.

## 적용 내용

### UI

- 프롬프트 생성 버튼 우측에 AI원고 생성 버튼 배치.
- 최초 AI원고 생성 버튼 비활성화.
- 프롬프트 생성 버튼은 작업 및 프롬프트 준비만 수행.
- 프롬프트 준비 후 왼쪽 버튼 잠금, 오른쪽 AI원고 생성 버튼 1회 활성화.
- AI 전송 시작 시 두 버튼 잠금.
- 60초 동안 완료되지 않으면 AI원고 생성 버튼만 재활성화.
- 지연 중에도 백그라운드에서 3초 간격으로 완료 상태 확인.
- 늦게 성공해도 자동으로 8채널 결과와 100% 완료 화면 반영.

### Backend

- data\gemini_queue 아래 작업별 상태 파일 구조 도입.
- 작업별 상태 API 지원: /beta-api/gemini-worker/status?job_id=...
- /prepare 엔드포인트 추가. 프롬프트 생성만 하고 전송 큐에는 등록하지 않음.
- /queue는 AI원고 생성 버튼의 유일한 전송 창구.
- 동일 작업이 pending, claimed, sent, completed이면 중복 등록하지 않고 기존 상태 반환.
- Worker는 queued_at 기준 가장 오래된 활성 작업 하나를 처리.
- 서로 다른 작업이 서로 덮어쓰지 않음.
- claimed 지연 시 최대 2회 자동 pending 복구.
- 완료 시 Worker 상태, result.json, 작업 state.json을 함께 갱신.

### 완료 상태

- state.json: status=gemini_completed, progress=100, last_error=null
- result.json: status=gemini_completed, progress=100, gemini.applied=true
- 8개 채널 저장 확인

### Tampermonkey Worker

- Gemini 입력창 탐색 대기 시간을 30초에서 55초로 확대.
- 작업별 큐 API는 기존 Worker polling 형식과 호환되도록 유지.

## 실제 검증

- Beta 안전 재시작 성공.
- /beta-api/health HTTP 200.
- production.html 새 버튼 레이아웃 및 새 JS 캐시 버전 로드 확인.
- 프롬프트 준비 테스트: prompt_ready, 큐 전송 없음 확인.
- 완료 작업 중복 queue 호출 2회: 모두 completed / duplicate=true 확인.
- 테스트 중 실제 신규 작업이 별도 작업별 큐로 처리되어 다른 작업을 덮어쓰지 않고 완료됨.
- 실제 작업 beta_20260724_232246_3e4a95 검증:
  - Worker completed
  - state.json gemini_completed / 100
  - result.json gemini_completed / 100
  - gemini.applied true
  - 채널 8개
- Python py_compile 통과.
- beta-production.js node --check 통과.
- storymaker-beta-gemini-worker.user.js node --check 통과.
- git diff --check 통과.

## 참고

beta-8021.stderr.log의 WinError 10054는 HTTP 클라이언트 연결 종료 시 Windows asyncio가 기록한 연결 재설정 로그이며, 서버는 계속 정상 실행되고 health 200 및 후속 작업 완료를 확인함.

## 수정 파일

- app\beta_gemini_worker.py
- static\beta-production.js
- static\production.html
- static\storymaker-beta-gemini-worker.user.js

기존 미커밋 파일인 static\beta-browser-render.js, static\beta-shortform-inline.js의 사용자 작업 내용은 수정하지 않고 보존함.
