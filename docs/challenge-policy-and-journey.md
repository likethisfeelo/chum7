# 챌린지 정책 & 여정 지도 (인증 · 인정 · 관리)

> 현행 **코드 기준** 정리 문서. 각 규칙은 실제 파일:라인을 근거로 한다.
> 작성 시점 검증: 워크스페이스 typecheck 0 · 프론트/어드민 typecheck 0 · 테스트 **42 스위트 / 394개 전부 통과**.
> 대상 서비스: `challenge-api`, `admin-api`, `settlement-worker`, `lifecycle-manager`, `notification-worker`, `frontend`.

---

## 0. 역할(정원) 정의

| 역할 | 판정 | 핵심 권한 |
|---|---|---|
| **리더(생성자, creator)** | `createdBy`(별칭 `creatorId`/`leaderId`) == 내 userId · `resolveOwnerId` (`participations.ts:46`) | 참여 심사, 리더퀘스트 운영, 완료 인정/반려, 인증 게시물 반려·이동, 무료 즉시해산·유료 해산신청, 수동 모집마감·조기시작. **중도포기 불가** |
| **참여자(participant)** | `UC#` 참여 레코드 보유 | 참여 신청, 인증 제출, 완료 인정 요청, 인증 취소·보완, 개인퀘스트 제안, **중도포기** |
| **운영자(operators) / 관리자(admins)** | Cognito 그룹. `isPrivileged = admins‖operators` (`admin challenges.ts:43`) | 전체 챌린지 조회, lifecycle 전환·시작확인, **유료 해산신청 승인/반려**, (admins) 수정·삭제·토글·정산 실행 |

> 그룹 매핑: `productowners/managers → operators`, `leaders → creators` (`admin challenges.ts:2`).

---

## 1. 라이프사이클 상태 머신

```
draft ──▶ recruiting ──▶ preparing ──▶ active ──▶ completed ──▶ archived
   └──────────┴───────────────┴────────────(archived로 조기 종료 가능)
```

- 상태·전이표: `packages/core/src/challenge/lifecycle.ts:6-27` (recruiting→active 직접 점프 허용)
- **자동 전이(시간)**: `resolveEffectiveLifecycle` (`lifecycle.ts:118`) — 모집 오픈/마감 시각, 시작일 도래로 forward-only 전진. 워커 `lifecycle-manager`가 실제 전이 수행, `active→completed` 시 **`challenge.completed` 이벤트 발행**(`lifecycle-manager/src/index.ts:243`).
- **시작 확인 게이트**: `requireStartConfirmation===true && !startConfirmed`이면 active 자동진입 보류 (`lifecycle.ts:139`). `startConfirmed`는 `startConfirmedAt` 존재로 판정.
- **해산(disbanded)은 별도 상태가 아님**: `lifecycle='completed' + disbanded=true`(+`disbandedAt/By/Reason`) 플래그로 완료 탭에 편입 (`participations.ts:59`, `admin challenges.ts:321`). **`challenge.completed` 이벤트는 발행하지 않음** → 자동 정산 미발동.

---

## 2. 인증 제출 & 채점 (Verification)

**엔드포인트**: `POST /c/verifications` (`verifications.ts:40`)

### 2-1. 제출 규칙
- **타입**: `text | image | video | link` (`schemas.ts:86`). 콘텐츠 없으면 `EMPTY_VERIFICATION_CONTENT`, 타입별 필수값 검증(이미지/영상/링크 URL, `https://`, 영상 ≤60s, 이미지 다중 ≤10장) (`verifications.ts:48-72`).
- **시작 전 차단**: draft/recruiting/preparing이면 `CHALLENGE_NOT_STARTED` (`verifications.ts:94`).
- **허용 타입 제한**: 챌린지 `allowedVerificationTypes` 밖이면 `UNSUPPORTED_VERIFICATION_TYPE` (`verifications.ts:125`).
- **시간 검증**: performedAt 미래 불가, 어제 이전 불가(`PRACTICE_TOO_OLD`), day 윈도우 ±1 초과 시 `INVALID_DAY`. 클라 시계 +5분까지 허용 후 서버시각 클램프 (`verification-rules.ts:239`, `day-sync.ts:40`, `verifications.ts:143`).
- **하루 1회 점수**: 이미 완료된 날/이미 제출한 퀘스트 재제출은 **`isExtra=true` → 점수 0·비공개 강제·응원 없음** (`verification-rules.ts:166`, `verifications.ts:247`).

### 2-2. 하루 완료(day complete) 판정 — 챌린지 타입별
`createDayCompletionRules` / `isDayComplete` (`verification-rules.ts:94-116`)

| 챌린지 타입 | 완료 조건 |
|---|---|
| `leader_personal`(혼합) | 리더퀘스트 **전부** + 개인퀘스트 완료 |
| `leader_only` | 등록된 리더퀘스트 전부 완료 (0개면 미완) |
| `personal_only` | 개인퀘스트 1건 |
| 일반(퀘스트 없음) | 제출 즉시 `success` |

- 부분 충족은 `status:'partial'`로 저장 + 안내 (`verifications.ts:263`).
- **점수**: 완료 시 **1점 고정** (`verifications.ts:227`, progress `score:1`). 총점 = success 날들의 합.
- **연속일(consecutiveDays)**: Day1부터 순차로 success인 날 카운트, 끊기면 중단 (`verifications.ts:326`).
- **조기완료 자동응원**: 목표시각보다 일찍 완료면 `cheer.delivered`(즉시분 푸시) 또는 예약분 저장(cheer-scheduler 워커) (`verifications.ts:396`, `auto-cheer.ts`).
- **멱등성**: 그날 **처음** 완료될 때만 cheer/thank 점수 1회 적립 (`verifications.ts:351`).

### 2-3. 공개·피드·종료 열람
- `isPublic` 기본 true·반익명(일일 활동명). 공개 판정 = `isPublic && !isPersonalOnly && !hiddenByAdmin` (`verifications-read.ts:60`).
- **종료된 챌린지 피드**: `completed`/`archived`면 **참여했던 사람 + 생성자/리더만** 열람, 아니면 403 `CHALLENGE_ENDED_MEMBERS_ONLY` (`verifications-read.ts:219`).
- 영상은 `mediaValidationStatus: pending`으로 저장, 실제 invalid 판정은 별도 검증 워커 소관(제출 핸들러엔 거부 분기 없음).
- **`verification.submitted`** 이벤트를 부분완료/완료 두 경로에서 발행 (`verifications.ts:286,450`).

---

## 3. 인증 인정 (Completion) — 요청 & 리더 수동 처리

### 3-1. 완료 인정 요청 (참여자 → 리더)
- **요청**: `POST /c/:challengeId/completion-requests` `{verificationId, day, message?}` (`completion-requests.ts:23`). `completion.requested` 이벤트 → 리더 알림.
- **언제 뜨나(정책)**: 서버는 유효성만 검사. 실제 후보 제한은 프론트 — **이미 완료(자동 인정)된 일자·추가(isExtra)·취소 게시물은 제외** (`ParticipantRequestsTab.tsx:67`, `completedDays` 기준). → *"이미 완료된 날짜엔 인정 요청 버튼이 뜨지 않음"* (최근 수정 반영).
- **중복 방지**: 같은 verification은 상태 뱃지로 표시, 서버는 `attribute_not_exists(sk)` + pending 조건부 갱신으로 이중 차단.
- **리더 처리**: `PUT /leader/completion-requests/:id` `{decision, feedback?}` — **승인 시** `grantDayComplete`(success·1점·`leaderGrantedComplete`) + 총점/연속일 재계산, **반려 시** 상태만 변경(점수 불변). `completion.resolved` 이벤트 → 요청자 알림 (`leader.ts:1017`).

### 3-2. 리더 수동 처리 (leader.ts)
| 액션 | 효과 |
|---|---|
| **grant-complete** (`889`/`921`) | 해당 day success·1점·`leaderGrantedComplete=true`. 재계산 |
| **revoke-complete** (`907`/`935`) | granted 플래그 제거 후 **규칙으로 재판정**(충족 시 유지, 아니면 partial·0점) |
| **set-state** `complete/partial/none` (`949`) | none은 `leaderForcedIncomplete=true`로 고정(자동 상향 재계산이 다시 안 올림) |
| **인증 게시물 reject** (`569`) | 게시물 비공개+gsi2 제거(공개/마당 이탈)·점수0·`rejectedByLeader`, **본인 기록(gsi1)은 유지**, 해당 day 되돌림, `verification.rejected` 이벤트 |
| **move-quest** (`661`) | 리더퀘스트 인증만 questId 재배정, **점수·status·연속일 유지** |
| 리더퀘스트 중단/삭제 | `recomputeProgressUpgradeOnly` — 요구 개수 감소 시 지난 날 **상향만** 재계산(`leaderForcedIncomplete`인 날 제외) |

### 3-3. 개인 퀘스트 제안 심사
- 기본 **자동승인**(`personalQuestAutoApprove !== false`). 명시적 false일 때만 리더 검토 (`proposal-rules.ts:54`).
- 재반려(re-reject): 이미 승인된 제안만, `fallback: block`(재제출 미이행 시 참여 제한) / `keep_original`(원 승인본 유지) (`leader.ts:516`).

---

## 4. 인증 취소 & 보완

### 4-1. 자기 인증 취소 (self cancel)
`PUT /c/verifications/:id/cancel` `{hideFromChallengeFeed?, hideFromOwnerFeed?}` (`verifications-cancel.ts:26`)
- 본인만·복구 불가. **완주(participation.completed) 후 취소 불가** (`CHALLENGE_COMPLETED_READONLY`).
- 게시물 `scoreCancelled=true·score0`(콘텐츠 유지), 옵션에 따라 챌린지 피드/개인 피드 숨김, **마당(plaza)은 항상 유지**.
- 재판정 후 미완이면 `status:'partial'` + **`remedyUnlocked=true`(그 일자 보완 특별 개방)**. leader≠본인이면 `verification.self_cancelled` 알림.

### 4-2. 보완 인증 (remedy)
`POST /c/verifications/remedy` `{originalDay, ...}` (`verifications-remedy.ts:26`)
- 정책 타입: `anytime`(기본) / `last_day` / `disabled` (`defaultRemedyPolicy`).
- **`remedyUnlocked` 존중**: 취소로 열린 날은 정상 창(day 제약·disabled) **우회** 허용.
- 정상 창: `last_day`는 마지막날에만, `anytime`은 Day2부터·이미 지난 day만. 실패일 없으면 `REMEDY_NO_FAILED_DAYS`.
- 이미 보완한 날 `REMEDY_TARGET_ALREADY_DONE`, `last_day+maxRemedyDays` 초과 시 `REMEDY_MAX_REACHED`.
- **점수 70% 계수**: `max(1, floor(base*0.7))` (`day-sync.ts:80`). 보완 인증은 비공개 저장, `remedied=true`.

---

## 5. 관리 (Management) — 참여 여정 & 종료

### 5-1. 참여 여정 & 상태 필드
```
신청(join) ─▶ [무료: 즉시 active | 유료: pending 심사] ─▶ 활성(active) ─▶ 완주 / 미달성 / 중도포기 / 전체해산
```
- **join** (`participations.ts:136`): `recruiting`만 허용, 생성자 참여 차단, 정원(maxParticipants), 중복 차단. 유료(`pricingType=paid_*` or `isPaid`/`price>0`)는 **`orderId` + commerce `paid` 검증** 필수.
- 참여 레코드: `phase`, `status(pending|active)`, `joinStatus(requested|approved)`, `paymentStatus(free|paid_pending_approval|paid_confirmed)`, `refundStatus`.
- **join 심사(리더)** (`participations.ts:315`): approve → `active/approved`; reject → `failed/rejected` + `refunded/completed`(환불 표기).
- **완주/미달성 확정**: 워커 `finalizeParticipants` → `completed|failed`. 읽기 정규화 `resolveNormalizedChallengeState`가 gave_up 유지, 종료 시 `completedDays≥duration ? completed : failed` (`challenge-state.ts:4`).

### 5-2. 중도포기(give-up) vs 전체해산(disband)
| 구분 | 중도포기 (give-up) | 전체해산 (disband) |
|---|---|---|
| 주체 | **참여자 본인** (리더 불가) | **리더** (유료는 운영자 승인 필요) |
| 범위 | 내 참여 레코드만 `gave_up` | 챌린지 전체 `lifecycle=completed + disbanded` |
| 무료 | 즉시 | **리더 즉시** (`participations.ts:433`) |
| 유료·티켓 | — | **불가 → 운영자 해산신청**(`disband-request`, 사유 필수) → 운영자 승인 실행 (`admin challenges.ts:378`) |
| 참여자 영향 | 본인만 | 멤버 전원 `challenge.disbanded` 알림, 완료 탭 **"전체 해산"** 표기 |
| 리더 영향 | — | 리더 참여 레코드는 `gave_up` 표기 |
| 정산/환불 | 없음 | **`challenge.completed` 미발행 → 자동정산 없음. 유료 환불은 운영자 수동(커머스)** |

### 5-3. 완주 & 정산 (settlement-worker)
- 트리거: **`challenge.completed` 이벤트**(정상 완료 경로에서만). disband는 미발행.
- 무료/비유료면 스킵. **보증금형(paid_deposit)**: 완주자→환불대기(`REFUND#`·`refund.due`), 미완주→몰수(`deposit.forfeited`, 크리에이터 정산). **참가비형(paid_fee)**: 총액−수수료(기본 5%)가 크리에이터 정산.
- v0 = 수동 지급(정산서·반환 큐 생성, 실제 송금은 어드민 콘솔).

### 5-4. 완료 탭 상태 라벨 (`challengeLifecycle.ts:160`)
`준비중` · `중도포기`(gave_up) · **`전체 해산`**(disbanded) · `완주`(completed) · `진행중`.
MEPage 완료탭은 인라인으로 `중도 포기 🏳️ / 전체 해산 🏳️ / 종료(미달성) / 완주 완료 🎉` 구분.

---

## 6. 여정 × 역할 영향 지도

| 여정 단계 | 참여자 | 리더 | 운영자 |
|---|---|---|---|
| **모집(recruiting)** | 신청(무료 즉시/유료 결제→pending). 개인퀘스트 제안 | 참여 심사(approve/reject·환불표기), 수동 모집마감, 개인퀘스트 제안 심사 | 전체 조회, lifecycle 강제전환 |
| **준비(preparing)** | 대기. 제안 수정 가능 | 조기 시작(`start`), 시작 확인(confirm-start) | confirm-start, lifecycle 전환 |
| **진행(active)** | 인증 제출→자동채점, 완료 인정 요청, 인증 취소·보완, **중도포기** | 리더퀘스트 CRUD, 완료 인정/취소·게시물 반려·이동, set-state, DM | 인증 숨김(신고 처리), 강제 운영 |
| **종료(completed)** | 피드 조회(참여자 한정), 리캡, 추가인증 공개전환은 기간내만 | 운영탭 회고, (완료 후 취소 불가) | 정산서 확인·지급, 반환 처리 |
| **해산(disbanded)** | 완료 탭 "전체 해산", 피드 유지, 환불(유료)은 운영자 처리 대기 | 무료 즉시/유료 신청. 본인은 "중도포기" | 유료 해산신청 승인/반려, 환불 수동 |
| **보관(archived)** | 조회 전용 | 조회 전용 | archived 전환 |

---

## 7. 시스템 점검 결과

### ✅ 컴파일/테스트 (에러 없음)
- 워크스페이스 **typecheck 통과**(19개 프로젝트) · 프론트/어드민 **typecheck 통과** · **jest 42 스위트 394 테스트 전부 통과**.

### ⚠️ 발견된 정책·로직 갭 (컴파일 에러 아님, 개선 후보)
| # | 위치 | 내용 | 심각도 |
|---|---|---|---|
| 1 | `challengeLifecycle.ts:160` → `ProfilePage.tsx:192` | `getChallengeStatusLabel`이 **`failed`(미달성)을 "완주"로 표기**(버킷이 completed로 접힘). 프로필 상태 배지에서 미달성이 완주로 오표기 | 중 |
| 2 | `participations.ts:145-146` | join의 `requiresApproval` 판정이 `isPaid‖price>0`만 사용(=`pricingType` 제외). 결제검증(:171)은 `pricingType` 포함 → `pricingType=paid_*`인데 `price=0`이면 **결제는 요구하나 승인심사는 건너뜀**(자동 active) | 중(엣지) |
| 3 | disband 경로 전반 | 유료 해산 승인 시 **자동 환불 없음**(설계상 v0 수동). 환불 실행 이벤트/코드 부재 → 운영자 수작업 의존 | 정책(의도됨) |
| 4 | `executeDisband`/`adminExecuteDisband` | 멤버 개별 참여 레코드는 `active`로 남고 `challenge.disbanded` 플래그+정규화로 완료 탭 편입(명시적 상태 전이 없음). 동작은 정상이나 상태가 암묵적 | 낮음(설계) |
| 5 | `lifecycle-manager/src/index.ts:1` 주석 vs `docs/time-policy.md` | 워커 주기 주석("1시간") ↔ 문서("10분") 불일치 | 낮음(문서) |
| 6 | `settlement-worker` vs `PAYMENT_SPEC.md:172` | "종료+7일 환불 보류 후 정산" 규정 미구현(즉시 정산서 생성, v0 축소) | 낮음(v0) |
| 7 | `participations.ts:426` | 중도포기 "포기는쉽다" 뱃지 부여 이벤트 계약 미구현(PORTING gap) | 낮음 |

> **권장 우선순위**: #1(미달성 라벨) → #2(유료 승인 판정 통일)이 사용자 체감·데이터 정합성에 직접 영향. #3~#7은 v0 의도된 축소 또는 문서 드리프트.

---

*이 문서는 코드 스냅샷 기준이며, 상기 갭 수정 시 함께 갱신 필요.*
