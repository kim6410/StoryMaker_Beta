# StoryMaker Beta 작업 시작 전 필독

이 문서는 `F:\StoryMaker_beta`에서 작업하는 사람과 AI가 가장 먼저 읽어야 하는 최상위 작업 규칙입니다.

이 문서의 규칙은 임시 메모, 채팅 내용, 실험 스크립트보다 우선합니다.


## 1. 작업 대상

작업 루트:

`F:\StoryMaker_beta`

Beta 접속 주소:

`http://127.0.0.1:8021/beta`

Beta 브라우저 렌더 전용 주소:

`http://127.0.0.1:8021/beta/browser-render`

Beta 전용 Supertonic 포트:

`7790`

Beta는 새로운 제작 흐름을 개발하고 검증하기 위한 독립 프로젝트입니다.


## 2. V1과 Beta는 완전히 분리된 프로젝트

StoryMaker는 현재 다음 두 프로젝트로 분리되어 있습니다.

### 운영·안정판 프로젝트

`F:\StoryMaker_V1`

- 기존 운영 기능
- 기존 대시보드와 회원 기능
- 기존 제작 엔진
- 기존 보관함
- 기존 DB
- 기존 Worker
- 기존 Supertonic
- 기존 브라우저 MP4 엔진

### 신규 개발 프로젝트

`F:\StoryMaker_beta`

- Beta 전용 제작 UI
- Beta 전용 API
- Beta 전용 DB
- Beta 전용 작업 폴더
- Beta 전용 Gemini 흐름
- Beta 전용 브라우저 렌더러
- Beta 전용 Supertonic
- Beta 전용 로그와 보관함

두 프로젝트는 같은 PC에 존재하지만 서로 다른 프로젝트입니다.

경로, 포트, DB, 작업 폴더, 실행 환경, 렌더링 흐름을 섞지 않습니다.

Beta는 V1의 기능과 구조를 참고할 수 있지만 V1 파일을 직접 수정하거나 공유해서 사용하지 않습니다.


## 3. AI 최우선 분리 규칙

AI는 V1의 파일을 발견하더라도 수정 대상으로 간주하지 않습니다.

사용자가 현재 대화에서 명시적으로 V1 작업을 지시하지 않는 한 모든 수정은 `F:\StoryMaker_beta` 내부에서만 수행합니다.

Beta 작업 중 다음 경로는 읽기 참고만 가능하며 수정하지 않습니다.

`F:\StoryMaker_V1`

V1의 코드를 참고해서 Beta 기능을 만들 때도 필요한 코드는 Beta 내부에 독립적으로 구현합니다.

V1 파일을 Beta에 연결하기 위한 직접 참조, 심볼릭 링크, 공용 경로 사용, 하드코딩된 V1 절대 경로 추가를 금지합니다.


## 4. 절대 수정 금지 범위

사용자의 별도 명시가 없으면 다음 대상을 수정하지 않습니다.

- `F:\StoryMaker_V1`
- Dell 운영 V2
- 공용 StoryMaker
- `F:\Supertonic3`
- 공용 포트 7788
- 기존 V1 DB
- 기존 V1 Worker
- 기존 V1 Queue
- 기존 Gemini Worker
- 기존 브라우저 MP4 보호 번들
- 기존 Podcast 엔진
- 기존 Docker 운영 환경
- 공용 인증·세션·회원 데이터

Beta 수정 때문에 V1의 코드, 설정, 데이터, 실행 파일, 서비스, 포트를 변경하지 않습니다.


## 5. Beta 독립 자원

현재 Beta의 주요 독립 자원은 다음과 같습니다.

작업 루트:

`F:\StoryMaker_beta`

Beta DB:

`F:\StoryMaker_beta\data\storymaker_beta.db`

Beta 작업 폴더:

`F:\StoryMaker_beta\data\jobs`

Beta 정적 화면:

`F:\StoryMaker_beta\static`

Beta 백엔드:

`F:\StoryMaker_beta\app`

Beta Python 가상환경:

`F:\StoryMaker_beta\.venv`

Beta Supertonic:

`F:\StoryMaker_beta\Supertonic3`

Beta 업무일지:

`F:\StoryMaker_beta\WORK_LOGS`

Beta 전체 백업 스크립트:

`F:\StoryMaker_beta\V1_BETA_BACKUP.bat`

`F:\StoryMaker_beta\V1_BETA_BACKUP.ps1`

공식 백업 저장 위치:

`F:\v1_backup\V1_BETA0724`


## 6. 루트 폴더 사용 원칙

`F:\StoryMaker_beta` 루트에는 승인되지 않은 임시 파일, 진단 결과, 패치 파일, 테스트 출력물을 쌓아두지 않습니다.

루트에 새로 둘 수 있는 파일은 사용자가 승인한 최상위 관리 문서, 공식 실행 파일, 공식 설정 파일뿐입니다.

임시 패치와 진단 도구는 프로젝트 외부 임시 작업 공간이나 목적별 하위 폴더를 사용합니다.

기존 실행 파일과 환경 파일은 임의로 이동하거나 이름을 바꾸지 않습니다.


## 7. WORK_LOGS 사용 원칙

업무일지 폴더:

`F:\StoryMaker_beta\WORK_LOGS`

중요 기능 수정이 끝나면 업무일지를 작성합니다.

업무일지에는 최소한 다음 내용을 포함합니다.

- 작업 일시
- 작업 목적
- 수정한 파일
- 생성한 파일
- 수정 전 백업 위치
- 변경 내용
- 검사 결과
- 실제 동작 확인 결과
- 미확인 항목
- 남은 문제
- 다음 작업 순서
- V1 절대 수정 금지 확인
- 롤백 방법

업무일지에는 성공한 작업과 미완료 작업을 명확히 구분합니다.

실제 브라우저에서 검증하지 않은 기능은 `미확인` 또는 `실사용 검증 필요`로 기록합니다.


## 8. 작업 시작 전 필수 순서

Beta 작업을 시작할 때는 다음 순서를 지킵니다.

1. `F:\StoryMaker_beta\00_READ_FIRST.md`를 처음부터 끝까지 읽습니다.
2. `git status`를 확인합니다.
3. 현재 브랜치와 최근 커밋을 확인합니다.
4. `WORK_LOGS`의 최신 업무일지를 읽습니다.
5. 현재 실행 중인 Beta 포트 8021과 Supertonic 포트 7790을 확인합니다.
6. 현재 정상 화면과 API 상태를 먼저 확인합니다.
7. 수정 대상 파일과 영향 범위를 구분합니다.
8. V1 파일이 수정 범위에 포함되지 않았는지 확인합니다.
9. 위험도에 맞는 백업을 수행합니다.
10. 변경 범위를 최소화한 뒤 수정합니다.

기존 Git 변경 사항이 있으면 임의로 덮어쓰거나 복원하지 않습니다.

현재 작업과 기존 변경 사항의 관계를 먼저 확인합니다.


## 9. AI 작업 전 안전 점검 선언

AI가 파일 수정, 생성, 이동, 이름 변경, 비활성화, 삭제, 롤백을 시작하기 전에는 아래 형식으로 안전 점검을 먼저 보고합니다.

```text
[AI 작업 전 안전 점검]
1. 백업 확인: 수정 전 백업 여부와 경로
2. 절대 수정 금지 대상 포함 여부
3. 수정 방식: 부분 수정 또는 신규 파일 생성
4. 파괴적 명령어 사용 여부
5. 검증 계획: 문법, HTTP, 브라우저, API, 회귀 검증
```

이 선언은 실제 작업 상태와 일치해야 합니다.

백업이 필요한 작업인데 백업이 완료되지 않았다면 먼저 백업을 완료한 뒤 수정합니다.


## 10. 위험도별 백업 기준

Git 커밋은 공식 백업을 대신하지 않습니다.

### 낮은 위험 작업

- 파일 읽기
- 검색
- Git 상태 확인
- 로그 확인
- 해시 확인
- HTTP 상태 확인
- 포트 확인

낮은 위험 작업은 별도 백업 없이 진행할 수 있습니다.

### 중간 위험 작업

- 단일 Python 함수 수정
- HTML·CSS·JavaScript 블록 수정
- 작은 API 수정
- Beta 전용 파일 신규 생성
- 관련 파일 2~5개 이내의 기능 수정

수정 대상 파일을 `F:\v1_backup`에 날짜와 시간별로 백업합니다.

### 높은 위험 작업

- DB 변경
- `.env` 변경
- 가상환경 변경
- Supertonic 변경
- 여러 핵심 파일 동시 수정
- 대규모 문자열 치환
- 폴더 이동이나 이름 변경
- 전체 롤백
- 실행 환경이나 자동 실행 설정 변경

높은 위험 작업은 `V1_BETA_BACKUP.bat` 또는 `V1_BETA_BACKUP.ps1`로 전체 백업을 먼저 수행합니다.

백업 성공 기준:

- `STATUS=PASS`
- `ERRORS=0`
- SQLite 원본 검사 `ok`
- SQLite 백업 검사 `ok`
- SHA-256 manifest 생성


## 11. 수정 원칙

한 번에 하나의 문제 또는 하나의 기능만 수정합니다.

수정은 가능한 한 부분 치환, 함수 단위 교체, 독립 파일 추가 방식으로 진행합니다.

기존 코드 파일 전체를 통째로 다시 작성하는 방식은 피합니다.

다음 표현이 포함된 축약 코드로 기존 파일을 덮어쓰지 않습니다.

- 기존 코드 동일
- 나머지 생략
- 중략
- TODO
- 임시 빈 함수

기존 파일 전체 저장이 불가피하면 수정 전후 라인 수, 바이트 크기, 주요 함수, 라우트, 식별자 누락 여부와 Diff를 확인합니다.

HTML, JavaScript, Python, Markdown 파일은 UTF-8 인코딩을 유지합니다.


## 12. 삭제·이동·이름 변경 원칙

파일이나 폴더를 바로 삭제하지 않습니다.

삭제, 이동, 이름 변경이 필요하면 다음을 먼저 수행합니다.

1. 실제 사용 여부 확인
2. 참조 위치 검색
3. 백업 생성
4. 백업 파일 존재와 크기 확인
5. 영향 범위 보고
6. 사용자 승인
7. 단일 절대 경로 기준으로 처리
8. 기능 검증
9. 업무일지 기록

다음과 같은 파괴적 명령은 사용하지 않습니다.

- `Remove-Item -Recurse -Force`
- `del /s /q`
- `rm -rf`
- `git clean`
- 와일드카드 일괄 삭제
- 기존 파일 대상 무검증 전체 덮어쓰기


## 13. Git 작업 원칙

작업 시작 시 다음을 확인합니다.

```bat
cd /d F:\StoryMaker_beta
git status
git branch --show-current
git log --oneline --decorate -5
```

기존 변경 사항이 있으면 현재 작업과 관련 있는지 먼저 구분합니다.

수정 후에는 다음을 확인합니다.

- `git diff`
- `git diff --check`
- 문법 검사
- 실제 기능 검사
- `git status`

커밋할 때는 실제 수정 파일 경로만 명시해 스테이징합니다.

가능하면 `git add .`를 사용하지 않습니다.

커밋 전 `git diff --cached`로 예상하지 않은 파일과 비밀정보 포함 여부를 확인합니다.

사용자의 명시적 승인 없이 다음 작업을 하지 않습니다.

- `git commit`
- `git push`
- `git restore`
- `git reset`
- `git clean`
- 브랜치 전환
- 이력 재작성

Beta 공식 원격 저장소:

`https://github.com/kim6410/StoryMaker_Beta.git`

원격 이름:

`origin`

기본 브랜치:

`main`


## 14. 환경 및 비밀정보 보호

다음 파일과 폴더는 사용자의 승인 없이 삭제하거나 공개하지 않습니다.

- `.env` 및 환경 설정
- 인증 토큰과 API 키
- 쿠키와 세션 정보
- DB 파일
- Python 가상환경
- Node 모듈과 잠금 파일
- Supertonic 모델과 캐시
- 생성 미디어
- 사용자 업로드 파일
- 백업 파일

Git 커밋 전 비밀정보가 포함되지 않았는지 확인합니다.

환경값 목록을 기록할 때 비밀번호, 토큰, 키, 쿠키는 마스킹합니다.


## 15. 검증 원칙

수정 후 가능한 범위에서 다음을 검증합니다.

- PowerShell 구문 검사
- Python 문법 및 import 검사
- JavaScript `node --check`
- HTML 로딩 확인
- Beta API HTTP 200 확인
- `/beta-api/health` 확인
- 포트 8021 확인
- 포트 7790 확인
- 브라우저 새 세션 테스트
- 개발자도구 오류 확인
- DB 반영 확인
- `result.json` 확인
- MP3·SRT·MP4·이미지 파일 확인
- 보관함 상세 확인
- 새로고침 후 상태 유지 확인
- 기존 Beta 기능 회귀 확인
- V1 무변경 확인

문법 검사만 통과한 상태를 실제 기능 성공으로 기록하지 않습니다.


## 16. 성공 판정 원칙

다음 항목이 모두 확인되기 전에는 최종 성공으로 단정하지 않습니다.

- 사용자가 실제 화면에서 기능을 실행함
- 브라우저 오류가 없음
- 관련 API가 정상 응답함
- 결과 파일이 실제 생성됨
- 현재 Beta 작업 ID에 결과가 연결됨
- 보관함에서 열람 또는 재생 가능함
- 새로고침 후 상태가 유지됨
- 기존 Beta 기능이 깨지지 않음
- V1 파일과 서비스가 변경되지 않음


## 17. 롤백 원칙

문제가 발생하면 임시 패치를 계속 덧붙이기보다 마지막 정상 Git 커밋과 공식 백업을 기준으로 원인을 확인합니다.

롤백 전에도 현재 문제 상태를 별도로 보존합니다.

사용자 승인 없이 `git reset`, `git restore`, 백업 덮어쓰기를 실행하지 않습니다.

복원 후에는 파일 해시, 파일 크기, API 경로, 포트, 브라우저 캐시, DB 무결성을 다시 확인합니다.


## 18. 작업 종료 필수 절차

1. 수정 파일 목록 정리
2. 백업 위치 기록
3. Diff 확인
4. 문법 검사
5. API와 HTTP 확인
6. 실제 브라우저 테스트
7. 기존 Beta 기능 회귀 확인
8. V1 무변경 확인
9. 업무일지 작성
10. Git 상태 확인
11. 사용자에게 커밋 대상과 메시지 보고
12. 사용자 승인 후 커밋과 Push
13. 로컬 HEAD와 `origin/main` 일치 확인


## 19. 금지 사항

- Beta 작업 중 V1을 수정하지 않습니다.
- V1 파일을 Beta 런타임에 직접 참조하지 않습니다.
- V1 DB와 Beta DB를 혼용하지 않습니다.
- V1 포트와 Beta 포트를 혼동하지 않습니다.
- 공용 Supertonic 7788을 Beta에 연결하지 않습니다.
- 백업 없이 위험 작업을 진행하지 않습니다.
- 임시 진단 코드를 운영 상태로 남기지 않습니다.
- 확인하지 않은 성공을 보고하지 않습니다.
- 서로 다른 시점의 백업 파일을 임의로 섞지 않습니다.
- 사용자의 승인 없이 대규모 구조 변경을 하지 않습니다.


## 20. 불확실할 때의 원칙

어떤 파일이 실제 사용본인지 확실하지 않으면 추측해서 수정하지 않습니다.

먼저 다음을 확인합니다.

- 파일 참조 위치
- 실행 프로세스 CommandLine
- 포트 상태
- HTTP 제공 경로
- Git 이력
- 최신 업무일지
- DB와 작업 폴더 경로

V1 파일과 Beta 파일 중 어느 것을 수정해야 하는지 불명확하면 수정하지 않고 사용자에게 먼저 확인합니다.


## 21. 핵심 선언

`F:\StoryMaker_V1`은 운영·안정판 프로젝트입니다.

`F:\StoryMaker_beta`는 신규 독립 개발 프로젝트입니다.

두 프로젝트는 목적과 실행 환경이 다르며 절대 혼합하지 않습니다.

Beta의 개발 자유는 V1의 안정성을 해치지 않는 범위에서만 허용됩니다.


마지막 갱신일:

2026-07-24


## 22. 현재 상태 확인 순서

안전 규칙을 읽은 뒤 반드시 다음 문서를 확인합니다.

1. `F:\StoryMaker_beta\ACTIVE_WORK.md`
2. `F:\StoryMaker_beta\CURRENT_STATE.md`
3. `F:\StoryMaker_beta\KNOWN_ISSUES.md`
4. `F:\StoryMaker_beta\ARCHITECTURE.md`
5. `F:\StoryMaker_beta\WORK_LOGS\00_INDEX.md`
6. `F:\StoryMaker_beta\WORK_LOGS`의 최신 업무일지

`CURRENT_STATE.md`와 실제 Git 상태가 다르면 Git과 실제 파일을 우선 확인하고, 차이를 사용자에게 보고한 뒤 작업합니다.

문서 우선순위는 다음과 같습니다.

1. `00_READ_FIRST.md`: 절대 안전 규칙
2. `ACTIVE_WORK.md`: 진행 중 작업과 잠금 대상
3. `CURRENT_STATE.md`: 현재 상태와 다음 작업
4. `KNOWN_ISSUES.md`: 알려진 버그와 지뢰
5. `ARCHITECTURE.md`: 시스템 구조와 파일 책임
6. `DECISIONS.md`: 장기 구조 결정과 이유
7. `WORK_LOGS\00_INDEX.md`: 업무일지 탐색 기준
8. 최신 업무일지
9. 이전 업무일지

문서와 실제 상태가 충돌하면 다음 순서로 검증합니다.

`Git 상태 → 실행 프로세스 → 실제 소스 → HTTP 응답 → DB·작업 파일 → 문서`

기존 미커밋 파일은 다른 작업자의 진행 중 작업일 수 있습니다. 현재 작업과 무관한 파일은 수정, 스테이징, 복원, 삭제 또는 커밋하지 않습니다.

작업 시작 전 다음 읽기 전용 검사 스크립트를 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File F:\StoryMaker_beta\check_before_work.ps1
```

작업 종료 후 다음 검사 스크립트를 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File F:\StoryMaker_beta\check_after_work.ps1
```

구조 변경 시 `ARCHITECTURE.md`, 새 문제 발견 시 `KNOWN_ISSUES.md`, 현재 상태 변경 시 `CURRENT_STATE.md`, 진행 작업 변경 시 `ACTIVE_WORK.md`, 작업 종료 시 표준 업무일지를 갱신합니다.

표준 업무일지 템플릿:

`F:\StoryMaker_beta\WORK_LOGS\00_WORK_LOG_TEMPLATE.md`

AI 인수인계 체크리스트:

`F:\StoryMaker_beta\AI_HANDOFF_CHECKLIST.md`
