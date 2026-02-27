# P1 레이어 기반 생성/참여 흐름 라이브 테스트 준비 문서

> 목적: P2/Phase5(회귀·부하·운영리허설)는 보류하고, **현재 구현된 생성/참여 흐름만 먼저 배포 후 라이브 검증**하기 위한 최소 준비 상태를 정리한다.

## 1) 이번 배포 범위 (포함)

### Admin
- 챌린지 생성 시 `challengeType`, `layerPolicy` 설정/저장
  - `requirePersonalGoalOnJoin`
  - `requirePersonalTargetOnJoin`
  - `allowExtraVisibilityToggle`
- 퀘스트 생성 시 `questLayer`, `questScope`, `requireOnJoinInput` 설정/저장

### User
- 챌린지 참여 화면에서 챌린지 타입/정책 기반으로 입력 UI 노출
- 정책 필수값(개인 목표/개인 목표시간) 미입력 시 클라이언트 선검증
- 참여 요청 payload에 필수인 경우만 `personalTarget` 전송
- `personalTarget.timezone`은 브라우저 timezone 사용

### Backend
- 참여 시점 정책 강제 검증
  - 타입 기본 규칙 + `layerPolicy` override
- Join 응답에 `challengeType`, `layerPolicy` 포함

---

## 2) 이번 배포 범위 (제외: 문서화만)

다음 항목은 **실행하지 않고 체크리스트만 유지**한다.
- P2 검증/운영준비
  - E2E 회귀 시나리오
  - 부하/성능 테스트
  - 데이터 정합성 점검
  - 운영 런북/롤백 리허설
- 기존 Phase5(QA/운영 고도화) 작업

---

## 3) 라이브 테스트 전 최소 점검 (배포 게이트)

1. Admin에서 챌린지 생성 시 `challengeType`/`layerPolicy` 저장 확인
2. Admin에서 퀘스트 생성 시 `questLayer`/`questScope`/`requireOnJoinInput` 저장 확인
3. 사용자 챌린지 상세 진입 시 정책에 맞는 입력 UI가 표시되는지 확인
4. 필수 입력 누락 시 API 요청 전에 에러 토스트가 노출되는지 확인
5. 필수 입력 충족 시 `/challenges/{id}/join` 성공 및 preparing 진입 확인

> 위 5개가 통과되면, 현 단계 목적(라이브 환경에서 정책/UX 흐름 검증)을 충족한다.

---

## 4) 라이브 스모크 테스트 시나리오 (운영자용)

### 시나리오 A: leader_only
- 챌린지 생성: `challengeType=leader_only`, `requirePersonalGoalOnJoin=false`, `requirePersonalTargetOnJoin=false`
- 사용자 참여: 개인 입력 없이 성공해야 함

### 시나리오 B: personal_only
- 챌린지 생성: `challengeType=personal_only`
- 사용자 참여: 개인 목표 + 개인 목표시간이 모두 없으면 실패해야 함
- 입력 후 재시도 시 성공해야 함

### 시나리오 C: mixed + override
- 챌린지 생성: `challengeType=mixed`, `requirePersonalGoalOnJoin=true`, `requirePersonalTargetOnJoin=false`
- 사용자 참여: 개인 목표만 필수, 시간 입력은 비필수로 동작해야 함

### 시나리오 D: quest metadata
- 퀘스트 생성 시 레이어/스코프/join-input 플래그를 각각 다르게 생성
- 생성 응답 및 DB 저장값이 일치하는지 확인

---

## 5) 배포 후 이슈 분류 기준 (빠른 판단)

- **P0 긴급**: 참여 불가, 필수 입력 무시/역전, 잘못된 lifecycle 응답
- **P1 후속**: 문구 개선, 안내 메시지 개선, admin 폼 UX 미세 조정
- **P2/Phase5**: 대량 트래픽 시나리오, 운영 자동화, 리허설/회귀 체계

---

## 6) 다음 스프린트 진입 조건

- 라이브 스모크 4개 시나리오 통과
- 운영팀 확인: “정책 의도대로 입력 유도 + 서버 강제 검증 일치”
- 위 조건 충족 시 P2/Phase5 실행 단계로 전환
