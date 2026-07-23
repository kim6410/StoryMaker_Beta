# StoryMaker Beta 브라우저 제작·보관함·Gemini 안정화 인수인계 업무일지

작성일: 2026-07-24

## 1. 작업 범위와 보호 원칙

이번 작업 대상은 `F:\StoryMaker_beta` 전용입니다.

절대 수정 금지 대상:

- `F:\StoryMaker_V1`
- V1 기존 대시보드·회원·업체정보·요금제·사용현황·기존 보관함
- V1 기존 딸깍 제작 및 브라우저 MP4 엔진
- V1 DB·Queue·Worker·공용 TTS·공용 포트

Beta는 V1과 분리된 독립 작업 폴더, DB, API, Supertonic 7790, 브라우저 WASM/WebGPU 렌더러를 사용합니다.

## 2. 현재 실행 환경

- Beta 루트: `F:\StoryMaker_beta`
- 접속 주소: `http://127.0.0.1:8021/beta/production`
- 네트워크 주소: `http://192.168.0.62:8021/beta/production`
- Beta 서버 포트: `8021`
- Beta Supertonic 포트: `7790`
- Beta 전용 DB: `F:\StoryMaker_beta\data\storymaker_beta.db`
- Beta 작업 폴더: `F:\StoryMaker_beta\data\jobs`
- GitHub: `https://github.com/kim6410/StoryMaker_Beta.git`
- 브랜치: `main`

업무일지 작성 시점에 8021 서버는 정상 LISTEN 상태입니다.

## 3. 확정된 제작 흐름

```text
V1 로그인 정보의 기본 업체정보 자동 채움
→ 기초 콘텐츠 입력
→ 이미지·배경음악 업로드
→ Gemini Web Worker SNS 8채널 생성
→ PODCAST_50 기본 대본
→ Beta Supertonic voice.wav 생성
→ subtitle.srt 생성
→ 브라우저 WASM MP3
→ WebGPU 우선 MP4
→ Beta 보관함 저장
```

SNS 8채널:

1. BLOG
2. NAVER_PLACE
3. GOOGLE_BUSINESS
4. INSTAGRAM
5. CARROT
6. CAROUSEL_7
7. PODCAST_50
8. PODCAST_80

기본 음성·영상 대본은 `PODCAST_50`으로 확정했습니다.

## 4. Gemini Web Worker 안정화

Tampermonkey Worker 최신 버전:

```text
StoryMaker Beta - Gemini Web Worker V2
버전 2.1.2
```

업데이트 주소:

```text
http://192.168.0.62:8021/beta-static/storymaker-beta-gemini-worker.user.js
```

기존 문제:

- 긴 블로그 본문을 포함한 8채널 결과를 하나의 JSON으로 받을 때 따옴표·줄바꿈·응답 길이 때문에 JSON 파싱이 간헐적으로 실패했습니다.

개선 내용:

- 기존 SNS 8채널 JSON 파싱 유지
- V1 방식 `[BLOCK:...]` 결과도 함께 지원
- 지원 BLOCK: TITLE, DESCRIPTION, BLOG, NAVER_PLACE, GOOGLE_BUSINESS, INSTAGRAM, CARROT, CAROUSEL_7, PODCAST_50, PODCAST_80
- Gemini 원문을 `gemini_raw.txt`로 먼저 보존

검증:

- BLOCK 8개 채널 파싱 성공
- PODCAST_50 기본 대본 연결 성공
- JavaScript·Python 문법 검사 통과

## 5. Supertonic·SRT·브라우저 제작 상태

브라우저 자원 진단 결과:

```json
{
  "secureContext": true,
  "webgpu": true,
  "webgpuActive": true,
  "wasm": true,
  "videoEncoder": true,
  "audioEncoder": true,
  "mediaRecorder": true,
  "mp4MimeType": "video/mp4;codecs=avc1.42E01E,mp4a.40.2"
}
```

확인된 실제 작업:

```text
beta_20260724_052201_8005c9
```

해당 작업에서 확인된 내용:

- Gemini SNS 8채널 완료
- PODCAST_50 정상
- 이미지 15장 정상
- 배경음악 MP3 정상
- Beta Supertonic 7790 정상
- voice.wav 생성 완료
- voice.mp3 생성 완료
- subtitle.srt 생성 완료
- 음성 길이 27.79초

중요:

- 브라우저 렌더러에 `voice.wav 없음` 오류가 나오면 먼저 제작 화면의 `PODCAST_50 음성 준비`를 실행해야 합니다.
- WebGPU 활성화, WASM MP3 생성, MP4 생성은 확인했습니다.
- SRT와 배경음악이 브라우저 최종 MP3·MP4에 실제로 반영되는지는 다음 채팅에서 완주 검증이 필요합니다. 매니페스트에는 subtitle과 music 경로가 추가되어 있지만 실제 자막 표시와 음악 믹싱을 끝까지 재확인해야 합니다.

## 6. Beta 보관함 구성

보관함 주소:

```text
http://127.0.0.1:8021/beta/archive
```

V1 보관함을 벤치마킹하여 다음 형태로 변경했습니다.

- 상단 요약 수치: 전체 제작, 완료, MP3, MP4
- 검색·상태 필터·정렬
- 큰 카드 대신 한 줄형 결과 목록
- 왼쪽 썸네일
- 가운데 제목·업체·지역·날짜·작업 ID
- 오른쪽 SNS·이미지·MP3·SRT·썸네일·MP4 상태 배지
- 제목 또는 썸네일 클릭 시 상세 모달
- 별도 상세 버튼 제거
- 상세 모달에 SNS 8채널 탭 제공
- 하단은 이미지·MP3·썸네일·MP4 영역으로 정리
- SRT 파일은 보존하지만 상세 화면의 SRT 카드는 제거
- MP3는 플레이어 없이 파일 열기·다운로드만 제공
- 소리 재생은 최종 MP4에서만 제공
- 미디어 영역은 한 번에 전체 펼침

## 7. 보관함 완전 삭제

목록 우측 `삭제` 버튼을 누르면 버튼 옆에 확인 팝업이 표시됩니다.

```text
완전히 삭제할까요?
[예] [아니오]
```

현재 `예`가 기본 포커스입니다.

- Enter: 바로 삭제
- Space: 바로 삭제
- 아니오: 취소

완전 삭제 범위:

- Beta DB의 해당 작업 레코드
- `data\jobs\<beta_job_id>` 작업 폴더 전체
- input 이미지·배경음악
- channels 텍스트
- output 음성·MP3·SRT·썸네일·MP4
- browser 결과물
- result.json·state.json
- 임시 파일과 중첩 찌꺼기 폴더

안전 순서:

```text
작업 ID와 경로 검증
→ 작업 폴더 임시 격리 이동
→ DB 레코드 삭제
→ 격리 폴더 전체 삭제
→ 잔여 경로 검사
```

별도 테스트 작업 검증 결과:

- DB 레코드 없음
- 작업 폴더 없음
- 중첩 browser/junk 파일 없음
- 잔여 격리 폴더 없음

## 8. V1 로그인 업체정보 자동 채움

Beta 제작 화면 로딩 시 V1 로그인 쿠키를 사용해 기본 업체정보를 가져오는 브리지를 추가했습니다.

Beta API:

```text
GET /beta-api/v1-profile
```

V1 참조 API:

```text
GET /v1-api/auth/personas
```

자동 입력 대상:

- 업체명
- 지역
- 주요 서비스
- 전화번호

동작 원칙:

- V1 기본 업체정보 우선
- 기본 정보가 없으면 첫 번째 업체정보 사용
- 자동 입력 후 사용자가 직접 수정 가능
- V1 로그인이 없거나 조회 실패 시 수동 입력 유지

주의:

- 비로그인 상태 폴백은 검증했습니다.
- 실제 V1 로그인 쿠키가 있는 브라우저에서 네 항목이 자동 채워지는지 다음 채팅에서 화면 검증이 필요합니다.

## 9. 제작 입력 화면 UI 변경

기존:

```text
콘텐츠 주제
한 줄 input
```

변경:

```text
기초 콘텐츠 입력
10줄 textarea
최소 높이 240px
세로 크기 조절 가능
```

## 10. Git·민감 자료 보호

`.gitignore` 제외 항목:

- `.env`, `.env.*`
- API 키·인증서
- `data/jobs/`
- `data/*.db` 및 DB 부속 파일
- 이미지·MP3·WAV·SRT·MP4·WebM
- logs
- backups
- patch_*.py, fix_*.py
- Supertonic3
- FFmpeg 실행 파일
- 모델 캐시

추적 중인 소스에서 API 키·토큰·비밀번호 패턴을 검사했고 실제 민감값은 발견되지 않았습니다.

이번 정리에서 적용이 끝난 임시 `patch_*.py` 11개를 삭제했습니다. 사용자 DB, 작업 폴더, 미디어 결과는 삭제하지 않았습니다.

## 11. 주요 Git 커밋

```text
035cabe chore: exclude local backups and sensitive runtime files
debde21 feat: autofill Beta business info from V1 login
d8f1556 ux: focus delete confirmation yes by default
6ab30f5 feat: add complete Beta archive deletion and cleaner detail access
5c15357 fix: accept V1-style Gemini channel blocks
e29d940 refactor: align Beta archive with V1 compact layout
fed4bf3 feat: organize Beta archive with V1-style details
c9a3570 chore: checkpoint SRT and BGM manifest support
b4013ef feat: connect PODCAST_50 to WASM WebGPU renderer
```

## 12. 수정된 핵심 파일

Backend:

- `F:\StoryMaker_beta\app\beta_jobs.py`
- `F:\StoryMaker_beta\app\beta_gemini.py`
- `F:\StoryMaker_beta\app\beta_gemini_worker.py`
- `F:\StoryMaker_beta\app\beta_steps.py`
- `F:\StoryMaker_beta\app\beta_browser.py`

Frontend:

- `F:\StoryMaker_beta\static\production.html`
- `F:\StoryMaker_beta\static\beta-production.js`
- `F:\StoryMaker_beta\static\archive.html`
- `F:\StoryMaker_beta\static\beta-archive.js`
- `F:\StoryMaker_beta\static\beta-browser-render.js`
- `F:\StoryMaker_beta\static\storymaker-beta-gemini-worker.user.js`

## 13. 주요 백업 위치

```text
F:\v1_backup\BETA_WORKING_20260724_051500_srt_bgm_browser_before
F:\v1_backup\BETA_WORKING_20260724_053000_archive_v1style_before
F:\v1_backup\BETA_WORKING_20260724_060000_archive_modal_v1_before
F:\v1_backup\BETA_WORKING_20260724_063000_gemini_block_parser_before
F:\v1_backup\BETA_WORKING_20260724_070000_archive_delete_detail_before
F:\v1_backup\BETA_WORKING_20260724_072000_delete_yes_default_before
F:\StoryMaker_beta\backups\20260724_074000_v1_persona_autofill_before
```

`backups/`는 Git에서 제외됩니다.

## 14. 다음 채팅에서 우선 확인할 작업

우선순위 1:

- V1 로그인 상태에서 Beta 제작 화면 강력 새로고침
- 업체명·지역·주요 서비스·전화번호 자동 채움 실제 확인

우선순위 2:

- 새 Beta 작업 1개 생성
- Gemini Worker 2.1.2로 SNS 8채널 완주
- PODCAST_50 음성 준비 자동 실행 여부 확인

우선순위 3:

- 브라우저 WASM MP3 생성
- 배경음악 실제 믹싱 확인
- SRT 자막이 WebGPU MP4 프레임에 실제 표시되는지 확인
- MP4 완주 후 Beta 보관함 저장

우선순위 4:

- Beta 보관함 제목·썸네일 상세 진입 확인
- 전체 미디어 한 번에 열기 확인
- MP4만 소리 재생되는지 확인
- 테스트 작업 하나를 삭제해 DB·물리 폴더 완전 삭제 재확인

## 15. 다음 채팅용 핵심 인수인계 문구

```text
작업 루트는 F:\StoryMaker_beta입니다.
F:\StoryMaker_V1은 절대 수정하지 않습니다.
먼저 WORK_LOGS\2026-07-24_StoryMaker_Beta_브라우저제작_보관함_Gemini_인수인계_업무일지.md를 읽습니다.
현재 Gemini Worker는 2.1.2이며 JSON과 V1 BLOCK 형식을 모두 지원합니다.
기본 대본은 PODCAST_50입니다.
Beta Supertonic은 7790, Beta 웹은 8021입니다.
다음 작업은 V1 로그인 업체정보 자동 채움 실제 확인 후, 새 작업으로 WASM MP3·배경음악·SRT 자막·WebGPU MP4·보관함 저장까지 완주 검증하는 것입니다.
```
