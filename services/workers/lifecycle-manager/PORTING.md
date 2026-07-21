# lifecycle-manager 이식 기록 (PORTING.md)

레거시 `backend/services/challenge/lifecycle-manager` (EventBridge 매 1시간 — `infra/stacks/challenge-stack.ts` LifecycleManagerRule)
→ 신규 `services/workers/lifecycle-manager` (plain Lambda handler, 오케스트레이터가 시간별 배선).

테이블·권한 (이전 가이드 §4 워커 예외): **challenges RW + gamification W + 이벤트 발행**.
env: `CHALLENGES_TABLE`, `GAMIFICATION_TABLE`, `EVENT_BUS_NAME`.
레거시의 USER_CHALLENGES / PERSONAL_QUEST_PROPOSALS / CHARACTERS / USERS / BADGES 테이블은
challenges·gamification 단일 테이블 키 설계로 흡수됐다.

## 1. 동작 매핑 (레거시 → 신규)

| 레거시 | 신규 | 비고 |
|---|---|---|
| `queryChallengesByLifecycle` (lifecycle-index) | gsi1 `LC#<lifecycle>#CAT#<category>` Query × {recruiting, preparing, active} × 카테고리 8종 | 카테고리 집합은 gamification world-summary `LAYER_ORDER`와 동일 (health/mindfulness/habit/relationship/creativity/development/expand/impact). draft는 시간 전이 없음(§2-①) — 조회 제외 |
| `TRANSITION_RULES` (recruitingStartAt/recruitingEndAt/challengeStartAt/challengeEndAt 비교) | `@chum7/core` `resolveDueLifecycle`(KST 날짜 기준) + `canTransition` — `src/domain/lifecycle-run.decideTransition` | 시작일 = `resolveChallengeActualStartAt`(actualStartAt → startConfirmedAt → challengeStartAt) 승계. `requireStartConfirmation` 미확인 시 hold 게이트 승계. 직접 전이 불가한 점프(예: preparing에서 기간 전체 경과)는 active 경유 2단계로 분해 — 레거시가 여러 시간 주기에 걸쳐 하던 것을 1회 실행에 수행 |
| `transitionChallenge` (lifecycle 조건부 SET) | `repo.transitionChallenge` — lifecycle=from 조건부 + **gsi1pk=`LC#<to>#CAT#<cat>` 동기화** | race 시 ConditionalCheckFailedException → 스킵 (레거시 동일) |
| `syncChallengeScheduleOnActivation` | active 전이 Update에 병합: `actualStartAt = if_not_exists`, `challengeEndAt` 재계산 | `calculateChallengeEndAt`/`resolveDurationDays` 사본 사용 |
| `activateUserChallenges` (approved → phase active, currentDay 1) | `decideActivation('activate')` → UC# 파티션 Query + 갱신 | joinStatus 없음 = 승인 취급 (레거시 attribute_not_exists 승계) |
| `handleUnapprovedJoinRequests` (requested 자동 거절 + 환불 + 알림 ×2) | `decideActivation('reject')` → status/joinStatus/phase 갱신 + stats.pendingParticipants 감소(0 하한 조건) | **환불 필드(paymentStatus/refundStatus) 미기록** — 보증금/환불은 commerce Phase 3 소관(challenge-api PORTING.md §1-E). **알림 미발송**(§2-③) |
| `finalizeUserChallenges` (progress 완료일수 ≥ durationDays → completed/failed) | `finalizeParticipants` — `normalizeProgress` + `isCompletedProgressStatus`(completed/success/remedy) 사본, 판정식 동일 | challengeType별 하루 완료 룰은 인증 제출 시 progress.status에 이미 반영(challenge-api verification-rules) — 완주 판정은 progress만 본다 (레거시 동일) |
| `fillCharacterSlot` (USERS+CHARACTERS 테이블) | gamification 테이블 `USER#<id>`/`CHARACTER`(상태) + `CHAR#<characterId>`(인스턴스) — 판정은 `character-slot.decideSlotFill` 사본 | accumulatePending(활성 캐릭터 없음 → pendingSlotFills+1)·fill·complete(+activeCharacterId 초기화, `isMythologyCompleted`로 completedMythologies 갱신) 분기 승계. 캐릭터/세계관 완성 **알림 미발송**(§2-③) |
| `checkAndGrantLeaderBadges` | gsi2 `CREATOR#<leaderId>` Query(lifecycle=completed 필터) + 각 챌린지 UC# 집계 → `evaluateLeaderBadgeIds` 사본 → `buildSpecificBadgeItem`(+`source:'leader'`) 조건부 Put | 집계 규칙 동일: phase∈{completed,failed}만 모수, status=completed가 완주. 중복 방지 = `attribute_not_exists(pk)` (레거시 badgeId+userId 복합키 조건 대응). 리더 뱃지 **알림 미발송**(§2-③) — `buildLeaderBadgeNotifications` 페이로드는 사본에 보존 |
| (없음 — 레거시는 SNS/직접 기록) | **`publishEvent('challenge.completed', { challengeId, completedUserIds })`** | challenge-api PORTING.md §3-5에서 이 워커 책임으로 지정된 신규 발행 |

## 2. 의도적 미이식·차이 (deviations)

1. **draft→recruiting 자동 전이 없음**: 신규 설계에서 draft 이탈은 publish API(challenge-api
   `PATCH .../publish`)의 명시 동작이며 `resolveDueLifecycle`도 draft를 시간 전이시키지 않는다.
   같은 이유로 **recruiting→preparing의 recruitingEndAt 기반 전이도 없음** — recruiting은 시작일에
   active로 직접 전이(canTransition 허용 전이)하고, preparing은 API가 만드는 상태다.
2. **currentDay 시간별 동기화(`syncActiveUserChallengeDays`) 미이식**: 신규 아키텍처는 읽기 시점에
   `calculateEffectiveCurrentDay = max(stored, calendar)`로 동적 계산(challenge-api my-challenges·remedy)
   하므로 저장값 보정 배치가 불필요. 손상 고값(currentDay > durationDays+1) 보정도 같은 이유로 제외.
3. **알림 직접 기록 전면 폐기** (이전 가이드 §1-6): 레거시 `sendNotification` 7종
   (join_request_auto_rejected, join_requests_auto_rejected, challenge_preparing,
   challenge_start_confirmation_required, challenge_start_delayed, quest_proposal_expired,
   feed_leader_badge_updated / character_complete / mythology_complete)은 notifications 테이블 직접
   기록이라 금지. contracts에 대응 이벤트 타입이 없어 **v1 무알림** — `challenge.completed` 이벤트만
   발행하며, notification-worker의 다중 수신자 확장(Phase 4)에서 복원 예정.
4. **`expirePendingProposals` 미이식**: PERSONAL_QUEST_PROPOSALS_TABLE은 폐기 대상
   (challenge-api PORTING.md §1-E — 개인퀘스트 제안 플로우 별도 티켓). 대응 데이터가 신규 테이블에 없음.
5. **시작 지연 알림(`notifyStartDelay`) 미이식**: ③과 동일 사유. hold 판정은 summary에 `held`로 집계만.
6. **완주자 슬롯 채우기 실패는 per-user 로깅 후 계속** (레거시 fire-and-forget `.catch` 대응 —
   신규는 await + try/catch로 순서 보장).

## 3. 크로스 도메인 grant (배선 요구사항)

- `CHALLENGES_TABLE` **RW**: META gsi1/gsi2 Query·전이 갱신, UC# Query·갱신.
- `GAMIFICATION_TABLE` **RW**: 뱃지 조건부 Put(`USER#<id>`/`BADGE#<badgeId>`),
  캐릭터 상태·인스턴스 Get/Query/Update (`CHARACTER`, `CHAR#<characterId>`).
  (슬롯 판정에 현재 상태 읽기가 필요해 순수 W가 아닌 RW — 이전 가이드 §4 "gamification W"의 구현상 확장.)
- `EVENT_BUS_NAME`: `challenge.completed` PutEvents.

## 4. 순수 로직·테스트

| 모듈 | 출처 | 테스트 |
|---|---|---|
| `domain/lifecycle-run.ts` | 신규 (core resolveDueLifecycle/canTransition 조합 + 레거시 판정 추출) | `lifecycle-run.test.ts` — 전이 대상 판정(경계·게이트·2단계), 활성화/자동거절, 완주/실패, 리더 뱃지 후보, 뱃지 아이템 키 |
| `domain/day-sync.ts` | services/challenge-api/src/domain/day-sync.ts 발췌 사본 | (원본 테스트 승계 — challenge-api day-sync.test.ts) |
| `domain/progress.ts` | services/challenge-api/src/domain/progress.ts 사본 | (원본 progress.test.ts) |
| `domain/badge-grant.ts`·`leader-badge-grant.ts`·`character-slot.ts`·`character-constants.ts` | services/gamification-api/src/domain/* 사본 (서비스 간 import 금지 원칙) | lifecycle-run.test.ts에서 부여 판정·아이템 키 회귀 가드 |

검증: `npx tsc -p services/workers/lifecycle-manager` ✅ /
`npx jest --testPathPattern "services/workers/lifecycle-manager"` ✅.
