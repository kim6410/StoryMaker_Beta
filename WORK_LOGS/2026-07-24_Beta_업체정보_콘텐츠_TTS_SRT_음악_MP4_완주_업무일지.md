# StoryMaker Beta 업체정보 → 콘텐츠 → TTS → SRT → 음악 → MP4 완주 업무일지

작성일: 2026-07-24

## 작업 목적

`F:\StoryMaker_beta` 내부에서만 동작하는 독립 딸깍 제작 흐름을 완성한다.

목표 흐름:

업체 기본정보 입력 → 콘텐츠 결과 생성 → 실제 대본 저장 → Beta 전용 오프라인 음성 생성 → 대본 기반 SRT → 이미지 순서·전환 효과 → 음악 믹싱 → 최종 MP4

## 절대 수정 금지 준수

다음 대상은 수정하지 않았다.

- `F:\StoryMaker_V1` 기존 메뉴와 기능
- V1 DB
- V1 Queue와 Worker
- V1 보관함
- 기존 브라우저 MP4 보호 번들
- 공용 Supertonic
- 공용 포트 7788

## 수정 파일

- `F:\StoryMaker_beta\app\beta_jobs.py`
- `F:\StoryMaker_beta\static\production.html`
- `F:\StoryMaker_beta\static\beta-production.js`

## 백업 위치

- `F:\v1_backup\V1_WORKING_20260724_181000_Beta_콘텐츠_TTS_SRT_음악_MP4_연결전`

## 구현 내용

### 업체 기본정보

입력 항목:

- 업체명
- 지역
- 주요 서비스
- 전화번호
- 콘텐츠 주제

V1 DB를 읽거나 수정하지 않고 Beta 화면에서 직접 입력받아 작업별 `result.json`에 저장한다.

### 콘텐츠 결과 생성

Beta 내부 규칙 기반 생성기로 제목, 설명, 실제 음성 대본을 만든다.

생성 결과는 다음 파일과 `result.json`에 저장한다.

- `content.txt`
- `script.txt`
- `result.json`의 `content` 필드

외부 AI API를 호출하지 않는다.

### Beta 전용 음성

Windows 로컬 한국어 음성 `Microsoft Heami Desktop (ko-KR)`를 사용한다.

네트워크 TTS와 공용 Supertonic을 사용하지 않는다.

생성 파일:

- `voice.wav`
- `voice.mp3`

### 대본 기반 SRT

대본 문장을 분리하고 글자 수 비율로 실제 음성 길이에 맞춰 자막 시간을 배분한다.

생성 파일:

- `subtitle.srt`

### 이미지 전환

선택된 이미지 순서를 유지한다.

각 이미지에 다음 효과를 적용한다.

- 1080x1920 세로형 크롭
- 미세 줌인
- 페이드 인
- 페이드 아웃
- 이미지별 독립 클립 생성 후 순서대로 결합

### 음악 믹싱

사용자가 올린 MP3, WAV, M4A, AAC 파일을 작업 폴더에 저장한다.

음악이 있으면 음성과 자동 믹싱하며, 음성 길이에 맞춰 음악을 반복하고 종료한다.

음악 볼륨은 10%, 16%, 22%, 30% 중 선택할 수 있다.

음악을 올리지 않아도 음성만으로 최종 MP4가 생성된다.

### 최종 MP4

Beta 전용 FFmpeg:

`F:\StoryMaker_beta\tools\ffmpeg.exe`

최종 파일:

- `final.mp4`
- H.264 영상
- AAC 오디오
- faststart 적용

## 실제 완주 테스트

테스트 작업 ID:

`beta_20260724_020535_8f7d89`

테스트 입력:

- 업체명: 오박사만능인테리어
- 지역: 울산 북구
- 서비스: 집수리와 욕실 리모델링
- 주제: 욕실 곰팡이 해결
- 이미지: 2장
- 배경음악: 테스트 MP3

테스트 결과:

- 작업 생성 API: 200
- 콘텐츠 생성: 성공
- 실제 대본 저장: 성공
- 한국어 음성 생성: 성공
- MP3 변환: 성공
- SRT 생성: 성공
- 이미지 전환 클립 생성: 성공
- 음악 믹싱: 성공
- 최종 MP4 생성: 성공
- MP4 조회 API: 200
- 음성 조회 API: 200
- SRT 조회 API: 200

생성 파일 크기:

- `final.mp4`: 505,108 bytes
- `mixed_audio.m4a`: 481,279 bytes
- `voice.mp3`: 255,981 bytes
- `voice.wav`: 1,529,520 bytes
- `subtitle.srt`: 813 bytes
- `thumbnail.jpg`: 24,645 bytes

## 문법 및 서버 검사

- Python `py_compile`: 통과
- JavaScript `node --check`: 통과
- `/beta/production`: HTTP 200
- `/beta/archive`: HTTP 200
- `/beta-api/jobs`: HTTP 200
- Beta 서버 포트: 8021

## 현재 접속 주소

- `http://127.0.0.1:8021/beta/production`
- `http://127.0.0.1:8021/beta/archive`

## 현재 상태

업체 기본정보부터 최종 MP4까지 Beta 내부에서 독립 완주한다.

외부 AI, 외부 TTS, V1 DB, V1 Queue, V1 Worker, V1 보관함에 의존하지 않는다.

## 남은 실사용 확인

실제 사용자가 보유한 사진과 배경음악으로 브라우저에서 한 번 제작하여 다음을 확인한다.

- 한국어 음성 자연스러움
- 사진별 표시 시간
- 음악 음량
- 전환 속도
- 최종 MP4 재생 품질
