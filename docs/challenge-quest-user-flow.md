# 챌린지 참여자 유저 플로우 심화 분석

- 범위: 참여자(유저) 관점 챌린지-퀘스트-레메디 전체 플로우
- 작성 기준: 현재 코드베이스 실구현 + 운영 정책(라이프사이클, 인증, 레메디, 개인 퀘스트)

---

## 1) 핵심 규칙 요약

| 항목 | 규칙 |
|------|------|
| 참여 가능 시점 | `recruiting` 상태에서만 신청 가능 |
| 라이프사이클 | `draft → recruiting → preparing → active → completed` (EventBridge 자동 전환) |
| 일일 인증 시간 검증 | `practiceAt` 기준 4시간 이내 업로드 |
| day 정합성 | 유저 로컬 타임존 날짜 기준 계산, 요청 day와 ±1 허용 |
| extra 인증 | 이미 성공한 day 재인증 → `isExtra=true`, 점수 미지급 |
| 레메디 시점 | Day 6에만 허용 |
| 레메디 대상 | 실패한 Day 1~5 (정책 허용 범위 내) |
| 레메디 점수 | 기본점수의 70% (`remedyScore`) |
| 개인 퀘스트 제안 마감 | 챌린지 시작 D-1 23:59(KST 계산) |
| 완주 조건 | 성공한 날(레메디 포함)이 duration 기준 충족 시 completed |

---

## 2) 참여자 관점 경우의 수 (4개 축)

### 축 1. 챌린지 타입 (challengeType)

| 타입 | 퀘스트 구성 | personalGoal | personalTarget |
|------|------------|--------------|----------------|
| `leader_only` | 공통(리더) 퀘스트 중심 | 기본 불필요 | 기본 불필요 |
| `personal_only` | 개인 퀘스트 중심 | 기본 필수 | 기본 필수 |
| `leader_personal` | 공통 + 개인 퀘스트 | 기본 선택 | 기본 필수 |
| `mixed` | 공통 + 개인 혼합 확장 | 기본 필수 | 기본 필수 |

### 축 2. 개인 퀘스트 운영 모드 (`personalQuestEnabled=true`)

| 모드 | 조건 | 상태 흐름 | 특징 |
|------|------|-----------|------|
| 자동 승인 | `personalQuestAutoApprove=true` | 제출 즉시 `approved` | 즉시 활동 시작 가능 |
| 리더 승인 | `personalQuestAutoApprove=false` | `pending → approved/rejected → revision_pending` | 반려/수정 재제출 루프 |

### 축 3. 레메디 정책 (`remedyPolicy`)

| 정책 | 최대 레메디 일수 | 점수 | 비고 |
|------|----------------|------|------|
| `strict` | 0일 | 불가 | 실패일 복구 없음 |
| `limited` | `maxRemedyDays`(1~2) | 70% | 제한 보완 |
| `open` | 실패일 범위 내 | 70% | 유연 보완 |

### 축 4. 레이어 구조 (`mixed` 확장 운영 시)

| 레이어 | 퀘스트 주체 | 승인 방식 |
|--------|------------|----------|
| A 레이어 | 공통 퀘스트 | 자동 |
| B 레이어 | 리더 확장 퀘스트 | 자동 기본(운영정책에 따라 심사 가능) |
| D 레이어 | 참여자 제안 개인 퀘스트 | 자동 or 리더 심사 |

---

## 3) 대표 참여자 시나리오 5가지

### 시나리오 1 — 엄격 완주형 (`leader_only` + `strict`)

- 예시: 아침 7시 기상 인증 챌린지
- 특징: 공통 퀘스트만 수행, 실패 허용 없음, 레메디 비활성
- 흐름: Join → preparing 대기 → active 진행 → 7일 무결점이면 완료

### 시나리오 2 — 리더 가이드형 (`leader_only` + `limited`)

- 예시: 매일 30분 영어 학습 챌린지
- 특징: 공통 퀘스트 + 소수 실패일 레메디 허용
- 흐름: 누락 1~2일 발생 시 Day 6 보완으로 복구 후 완주 가능

### 시나리오 3 — 자기설계 자유형 (`personal_only` + 자동승인 + `open`)

- 예시: 나만의 30분 독서 루틴 챌린지
- 특징: 개인 목표/시각 기반 인증, 개인퀘스트 즉시 승인, 유연 레메디
- 흐름: 참여 직후 개인 퀘스트 확정 → 개인 루틴 중심 인증/복구

### 시나리오 4 — 구조적 병행형 (`leader_personal` + 리더승인 + `limited`)

- 예시: 운동(공통) + 개인 목표(식단/스트레칭)
- 특징: 공통/개인 병행, 제안 심사 루프, 제한 레메디
- 흐름: `pending → rejected → revision_pending → approved` 재심사 가능

### 시나리오 5 — 멀티레이어 통합형 (`mixed` + `open`)

- 예시: 종합 웰니스(운동+식단+명상)
- 특징: A/B/D 레이어 통합 참여, 인증 경험 풍부, 레메디 유연
- 흐름: 레이어별 수행률 관리가 UX 핵심

---

## 4) 참여자 유저 플로우 4종

### 플로우 A: 챌린지 발견/참여

1. 챌린지 상세 진입
2. lifecycle 확인(`recruiting`일 때만 참여 버튼 활성)
3. challengeType + layerPolicy 기준 입력 분기
4. `POST /challenges/{id}/join` → `phase=preparing`, `proposalDeadline` 수신
5. 개인 퀘스트 활성 챌린지면 플로우 B로 연결

### 플로우 B: 개인 퀘스트 제안/검토

1. `recruiting/preparing`에서 제안 제출
2. 자동승인 모드: 즉시 `approved`
3. 수동승인 모드: `pending` 후 리더 검토
4. 반려 시 수정 재제출(`revision_pending`)
5. 마감 이후(`D-1 23:59` 경과) 제출 불가

### 플로우 C: 일일 인증 (Day 1~7)

1. `POST /verifications`
2. 서버 검증: practiceAt 유효성 + day 정합성 + 중복 성공 확인
3. 첫 성공: 점수/진행도 반영
4. 이미 성공한 day 재인증: extra 기록
5. 조기 달성 등 조건 충족 시 응원권/뱃지 반영

### 플로우 D: 보완(레메디, Day 6 전용)

1. Day 6에만 보완 메뉴 활성
2. 실패한 Day 1~5 중 대상 선택
3. 정책(strict/limited/open) 확인 후 `POST /verifications/remedy`
4. 성공 시 해당 day를 remedied 성공으로 치환
5. 70% 점수 + 보완 결과 반영

---

## 5) 프론트엔드 현황 진단 (현재 코드 기준)

| 파일/영역 | 상태 | 빠진 것 |
|-----------|------|---------|
| `ChallengeDetailPage` | 기본 참여 기능 동작 | 상태별 CTA 문구/타입 안내 통일 강화 필요 |
| `VerificationSheet` | 기본 제출 동작 | delta/streak/뱃지/응원권 즉시 피드백 약함 |
| `RemedyPage` | 기본 제출 동작 | remedyPolicy 분기 노출/잔여 횟수 표시 강화 필요 |
| `TodayPage` | 응원 중심 | 챌린지 진행현황 연계 약함 |
| 개인퀘스트 상태 가시화 | 부분 동작 | 상태칩/다음 액션(재제출, 대기) 강화 필요 |
| Day 1~7 진행 시각화 | 부분 동작 | 정책·예고형 UX 강화 필요 |

---

## 6) 전략적 작업 순서 (3 Phase)

### Phase 1 — 공통 기반 (P0)

1. My Challenge Progress Card 고도화
2. 인증 제출 후 통합 피드백(점수/응원권/뱃지)
3. remedyPolicy 분기 유틸 중앙화

### Phase 2 — 플로우 완성 (P0~P1)

1. Flow A: 참여 CTA·입력 가이드 정리
2. Flow B: 개인퀘스트 상태칩 + 다음 액션 UI
3. Flow C: extra 공개 전환 UX(바텀시트/재시도)
4. Flow D: Day 4~5 사전안내 + Day 6 진입 UX

### Phase 3 — 시나리오 분기 UX (P2)

1. strict: 실패 허용 없음 강조 + 레메디 완전 비노출
2. limited: 남은 보완 횟수 상시 가시화
3. personal_only: 내 목표 카드 상단 고정
4. leader_personal: 심사중/재제출 UX 강화
5. mixed: A/B/D 레이어별 현황 분리

---

## 7) 프론트에서 기능 확인 가능한 운영 방법

- `/ux-plan`은 **정적 체크리스트가 아닌 API 연결 상태 확인 페이지**로 운영합니다.
- 페이지에서 `GET /challenges/my?status=active`, `GET /challenges/{id}/personal-quest` 결과를 직접 읽어 각 챌린지의 Flow A~D 연결 상태를 표시합니다.
- 각 카드에서 바로 **퀘스트 보드(`/quests?challengeId=`)**, **레메디 페이지(`/verification/remedy`)**, **ME(개인 퀘스트 상태)** 로 이동해 실제 동선 테스트가 가능합니다.
- QA는 `ux-plan → 퀘스트/레메디/ME` 순서로 실제 백엔드 연동 시나리오를 재현합니다.


---

## 8) 실행 작업계획 (PHASE별, PHASE 1부터 순차 진행)

아래는 **실제 개발 스프린트에 바로 넣을 수 있는 형태**의 PHASE 계획입니다.

### PHASE 1 — 공통 기반 안정화 (목표: 1주)

**목표**
- 챌린지 참여자의 기본 진행정보(진행률/점수/정책)를 어느 화면에서나 일관되게 보여줄 수 있는 상태 확보.

**개발 항목**
1. `ME` 중심 공통 진행 카드 컴포넌트 확정
   - Day 1~7 상태, currentDay, completedDays, progressPercentage
   - score, consecutiveDays, remedyPolicy 표시
2. 인증 성공 피드백 표준화
   - delta, scoreEarned, newBadges, cheerOpportunity 표시
3. remedyPolicy 공통 유틸 정리
   - strict/limited/open 분기 로직 단일화

**연결 API**
- `GET /challenges/my?status=active`
- `POST /verifications`
- `POST /verifications/remedy`

**검증 페이지**
- `/me`
- `/ux-plan`

**Done 기준 (DoD)**
- 동일 챌린지에 대해 `ME`/`ux-plan`에 정책·진행 수치가 동일하게 노출됨.
- 인증 제출 후 피드백 항목(점수/연속일/뱃지/응원권)이 누락 없이 표시됨.

---

### PHASE 2 — 플로우 A~D 기능 연결 완성 (목표: 1~2주)

**목표**
- 참여자 플로우 A~D를 화면에서 끊김 없이 끝까지 수행할 수 있게 연결.

**개발 항목**
1. Flow A (참여)
   - lifecycle별 CTA 문구/비활성 사유 통일
   - challengeType별 입력 가이드 문구 제공
2. Flow B (개인퀘스트)
   - 상태칩(`pending/rejected/revision_pending/approved/expired`) + 다음 액션
   - 제안 수정/재제출 동선 명확화
3. Flow C (일일 인증)
   - extra 인증 공개 전환 UX(재시도 포함) 개선
4. Flow D (레메디)
   - Day 6 진입 UX, Day 4~5 사전 알림, 남은 보완 횟수 노출

**연결 API**
- `POST /challenges/{id}/join`
- `GET /challenges/{id}/personal-quest`
- `PUT /challenges/{id}/personal-quest/{proposalId}`
- `POST /verifications`
- `POST /verifications/remedy`

**검증 페이지**
- `/challenges/:challengeId`
- `/me`
- `/verification/remedy`
- `/ux-plan`

**Done 기준 (DoD)**
- `ux-plan` 카드에서 진입한 링크로 A~D 각 플로우를 실제 완료할 수 있음.
- 개인퀘스트 상태 전이별(대기/반려/재검토/승인/만료) 화면 분기가 정상 동작.

---

### PHASE 3 — 시나리오별 UX 최적화 (보류: PHASE 2 완료 후 진행)

**목표**
- challengeType × remedyPolicy 조합별로 사용자에게 맞는 안내/강조를 제공.

**개발 항목**
1. strict 시나리오: 실패 허용 없음 강조, 레메디 메뉴 비노출
2. limited 시나리오: 남은 보완 횟수 상시 노출
3. personal_only 시나리오: personalGoal/personalTarget 우선 노출
4. leader_personal 시나리오: 심사중/재제출 상태 강조
5. mixed 시나리오: 레이어(A/B/D)별 진행률 가시화

**연결 API**
- `GET /challenges/my?status=active`
- `GET /quests?challengeId=...`
- `GET /challenges/{id}/personal-quest`

**검증 페이지**
- `/me`
- `/quests`
- `/ux-plan`

**Done 기준 (DoD)**
- 5개 대표 시나리오별로 최소 1개 챌린지 테스트 데이터에서 문구/버튼/안내가 의도대로 분기됨.
- QA 체크리스트 기준 회귀 이슈 없이 플로우 A~D 전부 통과.



## 9) 이번 작업 적용 범위 (PHASE 1 → PHASE 2)

- 이번 스프린트에서는 **PHASE 1을 먼저 완료하고 PHASE 2까지 연속으로 적용**합니다.
- `/ux-plan`을 PHASE 1+2 테스트 허브로 운영하여 공통 기반 점검 후 Flow A~D를 실제 연결 페이지에서 검증합니다.
- 우선 검증 순서:
  1. Flow A: `/challenges/:challengeId`에서 참여 조건/CTA 확인
  2. Flow B: `/me`에서 개인퀘스트 상태/재제출 동선 확인
  3. Flow C: `VerificationSheet`에서 인증 제출 피드백, extra 공개 전환 확인
  4. Flow D: `/verification/remedy`에서 실패 day 선택/정책 분기/제출 확인

## 10) PHASE 1→2 실행용 QA 체크리스트 (바로 사용)

### PHASE 1 체크리스트

- [ ] 동일 챌린지 기준 `ME`와 `/ux-plan`의 진행률/점수/연속일 값이 동일하다.
- [ ] `remedyPolicy`가 strict/limited/open 각각 올바른 라벨로 노출된다.
- [ ] limited 정책에서 잔여 보완 횟수 계산이 실제 progress(remedied 수)와 일치한다.

### PHASE 2 - Flow A 체크리스트

- [ ] `/challenges/:challengeId`에서 lifecycle별 CTA 문구가 상태와 일치한다.
- [ ] 참여 불가 상태(draft/preparing/active/completed)에서 비활성 사유 문구가 정확하다.
- [ ] challengeType/layerPolicy에 따라 personalGoal/personalTarget 필수/선택 안내가 정확하다.

### PHASE 2 - Flow B 체크리스트

- [ ] 개인퀘스트 활성 챌린지에서 상태칩(pending/rejected/revision_pending/approved/expired)이 올바르게 보인다.
- [ ] rejected 상태는 재제출 동선으로 연결된다.

### PHASE 2 - Flow C 체크리스트

- [ ] 인증 성공 시 점수/연속일/delta/뱃지/응원권 피드백이 누락 없이 노출된다.
- [ ] extra 인증 시 `지금 공개/나중에` 선택 UI가 나타난다.
- [ ] `지금 공개` 선택 시 공개 전환 API 호출 후 성공/실패 토스트가 정상 노출된다.

### PHASE 2 - Flow D 체크리스트

- [ ] 레메디 페이지에서 실패 Day(1~5) 후보가 정확히 노출된다.
- [ ] strict 정책은 제출이 차단된다.
- [ ] limited 정책은 남은 횟수 0일 때 제출이 차단된다.
- [ ] 정상 정책/입력 시 레메디 제출 성공 후 ME로 복귀한다.

