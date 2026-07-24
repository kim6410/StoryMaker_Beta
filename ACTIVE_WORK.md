# StoryMaker Beta 진행 중 작업 잠금

상태: 진행 중
마지막 갱신: 2026-07-24
작업 환경: ChatGPT Browser + Windows Desktop MCP

이 문서는 여러 AI·사람·대화가 같은 파일을 동시에 수정하는 것을 막기 위한 소프트 잠금 문서입니다. 실제 OS 파일 잠금은 아니지만, 모든 작업자는 이 문서를 우선 확인해야 합니다.

## 현재 작업

Beta 전용 shortform-lab 독립 이식과 제작 화면 연결을 진행 중입니다.

## 현재 잠금 대상

다음 파일과 폴더에 미커밋 변경이 있으면 기존 작업자의 작업으로 간주합니다.

- `app/main.py`
- `app/beta_shortform.py`
- `static/production.html`
- `static/beta-production.js`
- `static/shortform-lab/`
- `data/experience_route_excerpt.txt`
- `data/shortform_component_excerpt.txt`

## 다른 작업자의 규칙

- 잠금 대상은 사용자 승인 없이 수정하지 않습니다.
- 관련 없는 작업에서도 해당 파일을 스테이징하거나 커밋하지 않습니다.
- `git restore`, `git reset`, `git clean`을 사용하지 않습니다.
- 작업 내용이 불명확하면 Git diff와 최신 업무일지를 읽고 사용자에게 확인합니다.
- 긴급 버그 수정으로 같은 파일을 수정해야 한다면 기존 변경과 충돌 가능성을 먼저 보고합니다.

## 현재 작업 종료 조건

- shortform-lab 라우트와 정적 자산 연결 확인
- Python·JavaScript 문법 검사 통과
- 포트 8021에서 실제 화면 로드
- 기존 Beta 제작·Gemini·브라우저 렌더·보관함 회귀 확인
- 관련 업무일지 작성
- 사용자 승인 후 관련 파일만 커밋·Push
- `CURRENT_STATE.md`, `KNOWN_ISSUES.md` 갱신

## 잠금 해제 방법

작업 완료 시 이 파일을 삭제하지 않고 다음처럼 갱신합니다.

```text
상태: 완료
완료 커밋: <commit>
완료 일시: <date time>
잠금 해제: 예
```

새 작업이 시작되면 현재 작업, 잠금 대상, 작업자, 종료 조건을 새 상태로 갱신합니다.

## 주의

이 문서와 실제 Git 상태가 다르면 실제 Git 상태가 우선입니다. 다만 기존 미커밋 변경을 임의로 정리하지 말고 차이를 사용자에게 보고합니다.
