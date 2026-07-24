# StoryMaker Beta 알려진 문제와 지뢰

마지막 갱신: 2026-07-24

상태값: `OPEN`, `VERIFY`, `IN_PROGRESS`, `RESOLVED`, `WONT_FIX`
위험도: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`

## ISSUE-BETA-001

- 상태: `VERIFY`
- 위험도: `HIGH`
- 파일: `app/beta_gemini_worker.py`
- 문제: 썸네일 ACK·결과 API에서 `validate_worker(payload.worker_id)`를 호출하지만 현재 검색에서는 함수 정의가 확인되지 않았습니다.
- 예상 증상: 썸네일 단계에서 `NameError`와 HTTP 500.
- 검증: Python import, 함수 정의 검색, 썸네일 ACK·result API 직접 호출.
- 개선: 원고 Worker와 동일한 허용 Worker ID 검증 함수를 모듈 상단에 단일 정의하고 테스트 추가.

## ISSUE-BETA-002

- 상태: `OPEN`
- 위험도: `HIGH`
- 파일: `data/beta_gemini_worker_state.json`, `data/beta_thumbnail_worker_state.json`
- 문제: 프로젝트 전체가 단일 상태 파일을 사용합니다.
- 예상 증상: 두 작업이 동시에 Queue되면 이전 작업이 덮어써지거나 잘못된 작업에 결과가 연결될 수 있습니다.
- 개선: `job_id`별 상태 파일 또는 SQLite 기반 Queue·Claim 구조로 변경하고 lease/timeout/retry를 작업별 관리.

## ISSUE-BETA-003

- 상태: `OPEN`
- 위험도: `HIGH`
- 파일: `app/beta_jobs.py`, `app/beta_browser.py`, `app/beta_gemini_worker.py`
- 문제: 여러 모듈이 `result.json` 전체를 읽고 수정한 뒤 전체 저장합니다.
- 예상 증상: 동시 저장 시 마지막 저장이 다른 모듈의 필드를 잃게 하는 lost update.
- 개선: 중앙 `update_result(job_id, patch)` 함수, 파일 잠금, revision 번호, 원자적 저장, 충돌 검사.

## ISSUE-BETA-004

- 상태: `OPEN`
- 위험도: `MEDIUM`
- 문제: 서버 FFmpeg 렌더와 브라우저 렌더 자산이 서로 다른 키에 저장되고 완료 상태 정의가 통일되지 않았습니다.
- 예상 증상: 화면은 완료지만 보관함 MP4가 없거나, 이전 자산을 표시할 가능성.
- 개선: 렌더 방식별 상태와 최종 선택 자산을 명시하는 `render.mode`, `render.status`, `assets.final_video` 도입.

## ISSUE-BETA-005

- 상태: `VERIFY`
- 위험도: `MEDIUM`
- 파일: `app/beta_jobs.py`
- 문제: `beta_v1_profile`이 V1 HTTP API를 읽기 전용으로 호출합니다. 프로젝트 분리 원칙상 허용 범위와 장애 처리 정책이 문서화되어야 합니다.
- 예상 증상: V1 8011 중단 시 업체정보 자동 불러오기 실패.
- 개선: 선택적 읽기 전용 어댑터로 명시하고 타임아웃·폴백·사용자 안내 강화. V1 파일·DB 직접 접근은 계속 금지.

## ISSUE-BETA-006

- 상태: `OPEN`
- 위험도: `MEDIUM`
- 문제: 업로드 파일은 확장자 중심 검증이며 최대 크기·개수·실제 MIME·이미지 디코딩 검증이 충분하지 않습니다.
- 예상 증상: 대용량 업로드, 손상 파일, 저장공간 고갈, 렌더 실패.
- 개선: 파일별·작업별 제한, MIME·매직바이트 확인, 디코딩 검사, 안전한 실패 정리.

## ISSUE-BETA-007

- 상태: `OPEN`
- 위험도: `MEDIUM`
- 문제: 작업 DB 레코드와 작업 폴더·`result.json` 사이의 정합성 복구 도구가 없습니다.
- 예상 증상: DB에는 있으나 폴더가 없거나, 폴더는 있으나 DB에 표시되지 않는 고아 작업.
- 개선: 읽기 전용 감사 도구와 승인 기반 repair/reindex 도구 분리.

## ISSUE-BETA-008

- 상태: `OPEN`
- 위험도: `MEDIUM`
- 문제: 업무 상태가 `state.json`, `result.json`, SQLite, Worker 상태 파일에 분산됩니다.
- 예상 증상: 화면마다 서로 다른 진행률·상태 표시.
- 개선: 상태 머신과 단일 권위 저장소를 정의하고 파생 상태만 다른 저장소에 반영.

## ISSUE-BETA-009

- 상태: `OPEN`
- 위험도: `LOW`
- 문제: 절대 경로 `F:\StoryMaker_beta`가 여러 Python 모듈에 반복됩니다.
- 개선: 환경변수 또는 중앙 설정 모듈로 통합하되 실행환경 변경은 전체 백업 후 진행.

## ISSUE-BETA-010

- 상태: `VERIFY`
- 위험도: `HIGH`
- 대상: 현재 미커밋 `shortform-lab` 이식 작업
- 문제: V1 번들 또는 과거 빌드 자산이 대량 복사됐을 가능성이 있어 실제 사용 파일·중복 번들·라이선스·자동 마운트 충돌을 확인해야 합니다.
- 개선: 실제 `index.html` 참조 파일만 식별하고, 사용되지 않는 자산은 승인 전 삭제하지 않으며 별도 정리 계획 작성.

## 이 문서 갱신 규칙

- 새 문제 발견 즉시 고유 번호를 부여합니다.
- 추측은 `VERIFY`로 표시합니다.
- 수정 완료만으로 `RESOLVED` 처리하지 않고 실제 브라우저·API 회귀 검사 결과와 완료 커밋을 기록합니다.
- 업무일지에서는 문제 번호를 참조합니다.
