# 챌린지 유형 기반 참여 위자드 고도화 계획 (결정 반영 v2)

## 1) 목표
- 참여 위자드가 `challengeType`, `layerPolicy`, `personalQuestEnabled`를 실제로 반영하도록 구조를 재설계합니다.
- 단일 렌더러(`JoinWizard`) + 유형별 스텝 설정(`WizardStepConfig[]`)으로 전환해, 분기 복잡도와 유지보수 비용을 줄입니다.
- `ChallengeDetailPage`와 위자드 관심사를 분리해 이후 상세 페이지 개편과 독립적으로 개선 가능하도록 만듭니다.

## 2) 확정 결정 사항

### A. 스텝 구성 원칙
- 공통: `time`(항상 첫 단계) → `confirm`(항상 마지막 단계)
- 조건부: `quest`는 `personalQuestEnabled === true`일 때만 포함
- 필수/선택 구분:
  - `personal_only`: `quest` 필수(스킵 불가)
  - 그 외(`leader_only`, `leader_personal`, `mixed`): `quest` 선택(스킵 가능)

### B. personalGoal 처리
- 위자드 `goal` 스텝 제거
- DB 컬럼/API 유지
- 상태 문서: `docs/personal-goal-status.md`에 기록

### C. 분기 단일화
- 유형별 스텝 분기는 `resolveWizardSteps(challenge)`에서만 수행
- 신규 유형/정책 추가 시 이 함수만 수정

### D. 타임존 정책 (확정)
- **계산 기준:** 챌린지 타임존 기준 (현재 릴리스는 KST 고정)
- **노출 기준:** 사용자 로컬 타임존 기준
- 즉, 서버/도메인 계산은 `Asia/Seoul`로 처리하되, UI 표기는 `Intl.DateTimeFormat().resolvedOptions().timeZone`를 사용해 로컬로 변환 표시

### E. 컴포넌트 구조 (확정)
- `JoinWizard`는 **바텀시트 기반 독립 컴포넌트**로 분리
- `ChallengeDetailPage`는 데이터 조회/버튼 트리거/결과 핸들링만 담당

## 3) 최적 경로 및 채택안

### 최종 채택
- **경로 1(안전 우선 점진 전환)을 채택**합니다.
- 이유: 챌린지 상세 페이지가 추가 개편 예정이므로, 참여 플로우 변경 리스크를 기능 플래그로 분리해 운영 안정성을 확보합니다.

### 대안 비교(참고)

### 경로 1) 안전 우선 점진 전환 (권장)
1. `JoinWizardBottomSheet` 신규 추가 (기존 상세 페이지 로직은 유지)
2. 기존 입력 UI와 병행 플래그(`useNewJoinWizard`)로 점진 롤아웃
3. 검증 완료 후 기존 인라인 입력 UI 제거

**장점**
- 회귀 리스크 최소화
- 운영 중 빠른 롤백 가능

**단점**
- 일시적으로 코드 중복 발생

### 경로 2) 일괄 전환 (속도 우선)
1. 상세 페이지 인라인 참여 UI 제거
2. `JoinWizardBottomSheet`로 즉시 교체
3. 타입/검증/API payload를 한 번에 정리

**장점**
- 코드 일관성 확보가 빠름
- 중복 코드 최소화

**단점**
- 초기 QA 범위 확대
- 이슈 발생 시 영향 범위 큼

## 4) 제안 아키텍처

### 타입
- `WizardStepKey = 'time' | 'quest' | 'confirm'`
- `WizardFormState = { hour12, minute, meridiem, questTitle, questDescription, questVerificationType }`
- `WizardStepConfig = { id, required, validate }`

### 스텝 상수
- `TIME_STEP`: 항상 통과
- `QUEST_STEP_REQUIRED`: 제목/설명 모두 필수
- `QUEST_STEP_OPTIONAL`: 둘 다 비어있으면 통과, 부분 입력은 에러
- `CONFIRM_STEP`: 항상 통과

### 스텝 리졸버
- 기본 `[TIME_STEP]`
- `personalQuestEnabled`면 `QUEST_STEP_REQUIRED | OPTIONAL` 추가
- 마지막 `CONFIRM_STEP` 추가

## 5) 바텀시트 분리 설계

### 파일 분리안
- `frontend/src/features/challenge/components/JoinWizardBottomSheet.tsx`
- `frontend/src/features/challenge/components/join-wizard/resolveWizardSteps.ts`
- `frontend/src/features/challenge/components/join-wizard/types.ts`

### 책임 분리
- `ChallengeDetailPage`
  - 챌린지/내 참여 상태 조회
  - 바텀시트 open/close
  - join 성공 시 쿼리 invalidation + 이동
- `JoinWizardBottomSheet`
  - 스텝 렌더링/애니메이션/검증/스킵
  - `onSubmit(formState)`로 상위에 결과 전달

## 6) 타임존 구현 가이드 (이번 릴리스: KST only)

### 서버/저장
- `personalTarget.timezone`은 일단 `Asia/Seoul` 고정 저장
- 마감 계산/승인 정책 문구의 기준 시점도 KST로 계산

### 클라이언트 표시
- 사용자 로컬 타임존(`Intl...timeZone`)으로 변환해 안내 텍스트 표시
- 예: `리더 검토 마감: 1/4 23:59 (내 시간)`
- 단, 툴팁/보조문구에 `기준: KST`를 함께 표기하여 혼동 방지

### 이후 확장 포인트
- 챌린지별 timezone 필드 도입 시 `Asia/Seoul` 상수만 치환하면 되도록 유틸화
- 전역 정책을 "계산=글로벌 챌린지 타임존 / 노출=사용자 로컬 타임존"으로 확대해도 구조 변경 없이 확장 가능합니다(타임존 소스만 동적화).

## 7) 화면/UX 스펙

### time 스텝
- 입력: AM/PM + 1~12시 + 0/10/20/30/40/50분
- 기본값: 오전 7시 00분
- 문구는 `challengeType`별로 차등 제공

### quest 스텝
- `personal_only`: 필수 모드(스킵 버튼 없음)
- 기타 유형: 선택 모드(스킵 버튼 노출)
- 하단 승인 배너:
  - auto approve: `✓ 등록 즉시 자동 승인됩니다`
  - manual review: `⏳ 리더 검토 후 승인됩니다 (챌린지 시작 D-1 23:59 마감, 기준 KST)`

### confirm 스텝
- 시간은 항상 표시
- 개인 퀘스트는 입력된 경우에만 요약 표시
- 모집 마감일은 값이 있을 때만 표시

## 8) 구현 단계 (권장 순서)
1. `JoinWizardBottomSheet`/타입/리졸버 파일 분리
2. 기존 `switch` 기반 네비게이션/검증을 `config.validate()` 기반으로 교체
3. `goal` 상태/JSX/payload 제거 (`personalGoal` 제외)
4. `time`/`quest` 문구를 `challengeType` 기반으로 분기
5. confirm 요약에서 `personalGoal` 노출 제거
6. API 호출 시 join payload를 `{ personalTarget }`로 정리
7. 상세 페이지 인라인 입력 UI 제거 및 바텀시트 트리거 버튼만 유지

## 9) 검증 시나리오
- `leader_only + personalQuestEnabled=false`: `time → confirm`
- `personal_only + personalQuestEnabled=true`: quest 스킵 불가, 제목/설명 누락 에러
- `leader_personal + personalQuestEnabled=true`: quest 스킵 가능
- 선택/필수 공통: quest 부분 입력 시 에러 토스트
- full mode: `personalGoal` 입력 UI 부재 확인
- auto approve/manual review 배너 문구 및 참여 후 상태 반영 확인
- KST 기준 마감 계산 + 로컬 타임존 노출 일치 확인

## 10) 리스크 및 완화
- **리스크:** 기존 `layerPolicy.requirePersonalGoalOnJoin` 의존 로직과 충돌
  - **완화:** goal 수집 정책은 deprecated로 간주하고, 서버는 필드 허용(무시) 또는 옵셔널로 유지
- **리스크:** KST 계산/로컬 노출 간 사용자 혼동
  - **완화:** 라벨에 `기준 KST` 명시 + 상세 툴팁 제공
- **리스크:** 분리 초기 이벤트 핸들링 누락(onClose/onSubmit)
  - **완화:** 상태 전이 테스트 케이스(열기/뒤로/닫기/제출) 추가
