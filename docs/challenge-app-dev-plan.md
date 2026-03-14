# 챌린지 앱 개발 계획서 (challenge-app-dev-plan)

## Context
코드베이스와 최근 수정 이력을 기준으로, 현재 서비스는 챌린지 핵심 흐름(탐색·참여·인증·마당)을 대부분 갖추고 있으나, 일부 미연결 인프라/저장 레이어 부재로 운영 완결성이 떨어지는 상태다.  
본 계획서는 **실동작 불가(P0) → 상태 불일치(P1) → 기능 확장(P2)** 순서로 정리해 릴리스 리스크를 낮추는 것을 목표로 한다.

---

## 1. 현황 (As-Is)

### 1.1 구현 완료/복구된 기능
- 챌린지 탐색/상세: `/challenges` 중심 UX 완료 (카테고리·정렬 포함)
- 챌린지 참여(Join): wizard 기반 참여, `personalGoal/Target` 처리 가능
- Lifecycle 자동 전환: `lifecycle-index` GSI 복구 및 scheduler 기반 전환 정상화
- `currentDay` 동기화: lifecycle-manager 정기 실행으로 활성 챌린지 day 보정
- 일일 인증: image/video/text/link 타입 지원, 타임존 보정 반영
- 보완(Remedy): Day 6 제한, 정책(strict/limited/open) 반영
- 마당(Plaza) 피드: 컴포넌트 분리 및 피드 동작 완료

### 1.2 최근 버그 수정 요약
- **Lifecycle 조회 누락 이슈**: `lifecycle-index` GSI 복구로 상태 전환 누락 문제 완화
- **마당 이미지 변환 누락**: convert-verifications 경로에서 `imageUrl/videoUrl` 변환 누락 보정

### 1.3 부분 구현/미완료 영역
- 응원(Cheer): 서비스 코드는 일부 존재하나 `use-ticket`, `get-targets` API가 stack 미연결
- 뱃지(Badge): submit 내부 하드코딩 응답만 존재, 저장/조회 레이어 없음
- 어드민 콘솔: 일부 Lambda는 있으나 API Gateway 라우트 연동 미흡
- 결제/환불: 흐름 정의 수준, 외부 PG 연동 미완료

---

## 2. 개발 필요 항목 (Gap) 및 우선순위

### P0 — 필수 (미연결로 실동작 불가)
1. **Cheer use-ticket stack 연결**
   - 대상: `backend/services/cheer/use-ticket/index.ts` + `infra/stacks/verification-stack.ts`
   - 작업: Lambda 등록, 권한 연결, `POST /cheer/use-ticket` 라우트 추가
2. **Cheer get-targets stack 연결**
   - 대상: `backend/services/cheer/get-targets/index.ts` + `infra/stacks/verification-stack.ts`
   - 작업: Lambda 등록, `GET /cheer/targets` 라우트 추가
3. **Badge 저장/조회 레이어 구현**
   - 대상: `backend/services/badge/grant/index.ts`(신규), `backend/services/badge/list/index.ts`(신규), `infra/stacks/badge-stack.ts`(신규 또는 기존 stack 통합)
   - 작업: DynamoDB 테이블/인덱스 구성, 지급 idempotency, `GET /users/me/badges` 연결

### P1 — 중요 (상태 불일치로 UI 오표시)
1. **progress 포맷 정규화**
   - array/object 이중 포맷 제거, API 응답은 배열 단일 포맷 보장
2. **my-challenges 정합성 보강**
   - `status/phase/challenge.lifecycle/currentDay/durationDays` 상호 일관성 보정
3. **화면 간 버킷 분류 통일**
   - `ME/Today/Profile`에서 공통 유틸 기반으로 preparing/active/completed 계산 통일

### P2 — 기능 완성 (운영 확장)
1. **어드민 콘솔 Lambda 라우팅 완성**
   - create/update/delete/toggle, personal-quest review, stats API 연결
2. **결제/환불 흐름 정리**
   - PG 연동 또는 free-flow 단순화 의사결정 후 API/상태머신 확정
3. **Extra 인증 공개 전환 UX**
   - 재인증 데이터의 plaza 공개 여부를 사용자가 제어하도록 UI 보완

---

## 3. 기능별 개발 계획

### 3.1 Lifecycle 안정화
- 목표: 시간 경과에 따른 challenge/userChallenge 상태 자동 전환 신뢰도 확보
- 작업:
  - `lifecycle-index` 기반 조회 결과 모니터링 지표 추가(전환 건수, 실패 건수)
  - `syncActiveUserChallengeDays` 결과 샘플링 로그 강화
  - transition side effect(자동 거절/환불/알림) 실패 재시도 정책 정리
- 완료 기준:
  - 7일 챌린지 기준 Day rollover가 KST 기준 1시간 내 반영
  - active→completed 전환 시 참여자 상태 누락 0건

### 3.2 Verification / Remedy 안정화
- 목표: 인증 데이터 정합성 + 프론트 소비 안정성 확보
- 작업:
  - `progress` 반환 포맷 array 단일화
  - `isExtra` 인증은 score/progress 미반영 정책을 응답에 명시
  - remedy 점수(70%) 및 cheerTicket 지급 정책 회귀 테스트 추가
- 완료 기준:
  - 동일 챌린지/동일 day에서 중복 인증 시 정책대로 저장 및 노출
  - 프론트에서 progress 파싱 예외 0건

### 3.3 Cheer P0 연결
- 목표: 티켓 획득 후 실제 발송 플로우까지 end-to-end 동작
- 작업:
  - `GET /cheer/targets`, `POST /cheer/use-ticket` API Gateway 연결
  - 권한, CORS, 인증 컨텍스트, 에러 응답 포맷 통일
  - 오늘 탭 수신 카드 표시까지 통합 시나리오 점검
- 완료 기준:
  - Day3 연속 인증 → 대상 조회 → 티켓 사용 → 수신자 노출 시나리오 통과

### 3.4 Badge P0 구현
- 목표: 뱃지를 “응답값”이 아니라 “영속 데이터”로 운영
- 작업:
  - `badge/grant`: 지급 조건 평가 + 중복 지급 방지(ConditionExpression)
  - `badge/list`: 사용자 기준 조회 API 제공
  - verification submit에서 하드코딩 로직 제거, grant 호출로 위임
- 완료 기준:
  - 3일/7일 조건 충족 시 1회만 지급
  - `GET /users/me/badges`에서 획득 이력 조회 가능

### 3.5 Frontend 상태/배지 연동
- 목표: 탭별 상태 표시와 뱃지 노출의 UX 일관성 확보
- 작업:
  - 공통 유틸 `resolveChallengeBucket` 적용
  - `currentDay > durationDays` 완료 UI 처리
  - Profile에서 badges API 연동 및 빈 상태 디자인 적용
- 완료 기준:
  - 동일 userChallenge가 ME/Today/Profile에서 동일 버킷으로 표시
  - 실패 챌린지는 “종료(미달성)” 라벨 통일

---

## 4. API 계약 체크리스트

### 4.1 GET `/challenges/my`
필수 보장 항목:
- 루트: `userChallengeId`, `challengeId`, `phase`, `status`, `currentDay`, `startDate`, `durationDays`
- `progress`: **배열 단일 포맷**
  - `day`, `status`, `verificationId`, `timestamp`, `delta`, `score`, `remedied`
- `challenge`: `lifecycle`, `title`, `badgeIcon`, `challengeType`, `personalQuestEnabled`, `durationDays`

검증 포인트:
- `currentDay` 범위: `1 ~ durationDays+1`
- 완료/실패는 completed bucket으로 귀속 가능해야 함

### 4.2 POST `/verifications`
권장 응답 필드:
- `verificationId`, `isExtra`, `day`, `scoreEarned`, `totalScore`, `consecutiveDays`
- `newBadges` (P0 구현 전 빈 배열 가능)
- `cheerOpportunity`: `hasIncompletePeople`, `cheerTicketGranted`

검증 포인트:
- 요청 day와 서버 계산 day 불일치 시 명확한 오류 반환
- `isExtra=true`는 점수/진척도 계산 제외

### 4.3 Cheer / Badge 신규 계약
- `GET /cheer/targets`: 발송 가능 대상 목록(익명표시용 최소 필드 포함)
- `POST /cheer/use-ticket`: 티켓 차감 + cheer 생성 + 알림 트리거
- `GET /users/me/badges`: `badgeId`, `grantedAt`, `meta(optional)` 반환

---

## 5. 검증 방법

### 시나리오 A — Lifecycle 정상 동작
1. 챌린지 생성(draft)
2. `recruitingStartAt` 도달 후 scheduler 실행 → recruiting 확인
3. 참여 승인 후 `challengeStartAt` 도달 → active, userChallenge `currentDay=1`
4. KST 자정 이후 1시간 내 `currentDay=2`
5. `challengeEndAt` 도달 → completed 및 참여자 상태 정합성 확인

### 시나리오 B — 인증/마당 전환
1. Day 1 인증 제출(`isPublic=true`)
2. 변환 잡 실행 후 plaza post 생성 확인
3. 이미지/비디오 인증 URL 필드 누락 없이 렌더링 확인

### 시나리오 C — Cheer 티켓 사용 (P0 완료 후)
1. 3일 연속 인증으로 티켓 획득
2. `GET /cheer/targets` 조회
3. `POST /cheer/use-ticket` 발송 성공
4. 수신자 Today 탭 카드 및 반응 API 동작 확인

### 시나리오 D — Badge 지급 (P0 완료 후)
1. 3일 연속 인증 후 badge 지급 확인
2. 7일 완주 후 추가 badge 지급 확인
3. 동일 조건 재실행 시 중복 지급 없음 확인

---

## 6. 제안 일정 (2주 스프린트 기준)

요청사항 반영: **기능별 계획 3.1 ~ 3.2를 선행**해 기반 안정화를 마친 뒤, **P0 필수 항목**으로 진입한다.

- **Week 1 (기반 안정화 선행: 3.1 ~ 3.2)**
  - D1~D2: Lifecycle 안정화(전환 모니터링/재시도 정책/`currentDay` 동기화 검증)
  - D3~D4: Verification/Remedy 정합성(`progress` array 단일화, `isExtra` 정책 명시)
  - D5: 3.1~3.2 회귀 테스트 및 운영 로그 점검
- **Week 2 (P0 필수 구현)**
  - D1~D2: Cheer endpoints stack 연결(`GET /cheer/targets`, `POST /cheer/use-ticket`)
  - D3~D4: Badge 저장/조회 레이어 + verification 연동
  - D5: P0 통합 E2E 검증(티켓 획득→발송, 3일/7일 뱃지 지급)

후속(다음 스프린트): P1(UI 오표시 해소) → P2(어드민/결제 확장) 순으로 진행 권장.

리스크:
- 기존 데이터에 object형 progress 잔존 가능성
- 결제/환불은 외부 의존성으로 일정 변동 가능

완화 방안:
- migration/response adapter 동시 운영 기간 확보
- P2는 feature flag로 분리 배포



## 7. Week 2 마감 상태 (업데이트)

- 상태: **거의 완료 (D5 검증 진행 중/마감 단계)**
- 완료 항목:
  - Cheer P0 엔드포인트 stack 연결(`GET /cheer/targets`, `POST /cheer/use-ticket`)
  - Badge 저장/조회 레이어 구현 및 verification submit 연동
  - Profile 뱃지 컬렉션의 `GET /users/me/badges` 연동
- 마감 체크:
  - 회귀 가드 테스트(`week2-p0-readiness`, `week2-d5-closure`)로 핵심 배선 누락 방지
  - 배포 환경에서 티켓 발송/수신 및 3일·7일 뱃지 실데이터 검증만 남음
- 다음 단계: P1 착수 (버킷 분류 공통 유틸 도입 및 화면별 적용 확대)



## 8. 다음 스프린트 킥오프: Gap 점검 & 우선순위 재확인

목표: Week 2 마감 산출물을 기준으로, 다음 스프린트에서 **남은 Gap**을 P0/P1/P2로 재확인하고 즉시 실행 가능한 작업 단위로 전개한다.

### 8.1 P0 점검 (실동작 필수)

| 항목 | 현재 상태 | 점검 기준 | 다음 액션 |
|---|---|---|---|
| Cheer `GET /cheer/targets` | 연결됨 | 스택/라우트 존재 + 실제 대상 조회 응답 | 스테이징 실사용 시나리오 검증 |
| Cheer `POST /cheer/use-ticket` | 연결됨 | 스택/라우트 존재 + 티켓 차감/생성/알림 확인 | 수신자 반응 API까지 E2E 확정 |
| Badge 저장 레이어 | 구현됨 | 조건부 중복 방지 + 조회 API 응답 일관성 | 운영 데이터 샘플링 점검 |
| Profile 뱃지 연동 | 구현됨 | `/users/me/badges` 호출/렌더 정상 | 빈 상태·오류 상태 UX 마감 |

**P0 Exit 조건(스프린트 시작 시점 확인):**
- 티켓 획득 → 대상 조회 → 발송 → 수신 확인까지 실패 없이 1회 통과
- 3일/7일 조건에서 뱃지 지급/조회/중복방지 재현 가능

### 8.2 P1 점검 (상태 불일치 해소)

| 항목 | 현재 상태 | 리스크 | 다음 액션 |
|---|---|---|---|
| progress 포맷 정규화 | 반영됨 | 구 데이터 object 포맷 잔존 | API 응답 adapter 관측 로그 추가 |
| my-challenges 정합성 | 반영됨 | edge case에서 완료/실패 버킷 오표시 가능성 | 샘플 계정 회귀 시나리오 자동화 |
| ME/Today/Profile 버킷 통일 | 반영됨 | 일부 레거시 데이터에서 표기 이슈 가능성 | 샘플 계정 회귀 시나리오 자동화로 재검증 |

**P1 Exit 조건:**
- 동일 userChallenge가 ME/Today/Profile에서 동일 bucket으로 노출
- `currentDay > durationDays` 시 완료 처리 일관

### 8.3 P2 점검 (기능 완성)

| 항목 | 현재 상태 | 의존성 | 다음 액션 |
|---|---|---|---|
| 어드민 콘솔 라우팅 완성 | 반영됨 | API/권한/운영 정책 | 스테이징에서 어드민 화면 연동 회귀 점검 |
| 결제/환불 플로우 | 미완 | 외부 PG | free-flow vs PG 연동 의사결정 |
| Extra 인증 공개 전환 UX | 반영됨 | 프론트 정책 합의 | 공개 전환 후 피드 반영 지연 모니터링 |

### 8.4 다음 스프린트 실행 순서 (권장)
1. **Kickoff Day**: P0 E2E 재검증 + 장애 대응 플랜 확정
2. **Sprint D1~D2**: P1(버킷/상태 표시 일관성) 집중 처리
3. **Sprint D3~D4**: P2 중 의존성 낮은 항목(어드민 라우팅/Extra UX) 선행
4. **Sprint D5**: 통합 회귀 + 릴리즈 체크리스트 업데이트

### 8.5 운영 체크리스트(릴리즈 전)
- CloudWatch에서 lifecycle `transition summary`/오류 로그 확인
- badgesTable 쓰기 실패(조건식 제외) 알림 룰 확인
- cheer 티켓 만료(TTL) 및 발송 실패 재처리 플로우 점검
- 프론트 `GET /users/me/badges` 실패 시 fallback UI 확인
