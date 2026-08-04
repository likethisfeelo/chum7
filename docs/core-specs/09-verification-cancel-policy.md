# 09 · 인증 취소 정책 (User Verification Cancel)

> 대상: 사용자가 **자신의 특정 인증 게시물**의 "그 일자 완료·점수"를 스스로 취소하는 기능.
> 상태: 기획 확정(2026-08). 구현 전 스펙. 관련: `02-verification-flow`, `08-personal-feed-visibility-policy`,
> `20260321-remedy-policy-spec`, 그리고 이번 세션에 추가된 모더레이션(신고/숨김)·완료 인정 기능.

---

## 1. 핵심 개념

**"인증 취소" = 게시물 삭제가 아니라, 그 게시물이 채운 "해당 일자 완료·점수"를 떼어내는 것.**
게시물(콘텐츠)은 원칙적으로 남고(노출은 선택), **일자 완료·점수만 해제**된다. 그래서 마당엔 남고(§6), 마당에서 내리려면 **별도 삭제 요청**(§7).

기존 유사 기능과 구분:
- **리더 반려**: 리더가 숨김 + 점수 롤백. **관리자 숨김**: 공개면 제거·점수 유지. **완료 인정(요청)**: 점수 부여.
- 본 기능은 **사용자 본인 주도 점수 해제** — 위와 다른 새 액션.

---

## 2. 트리거 · 대상 (확정)

- **단위: 특정 게시물 1건**(verificationId). 사용자가 여러 챌린지를 동시에 하므로, 하루 전체가 아니라 **고른 게시물 하나**를 취소. 효과는 그 게시물이 속한 (challengeId, day, questId)의 일자 완료 재계산으로 전파.
- **진입점: ⋮(세로 점 3개) 오버플로 메뉴** — 눈에 띄지 않게 제한적으로 노출(본인 게시물에만).
- **복구 불가**: 2중 확인 팝업으로 경고("되돌릴 수 없어요"). 실행 후 undo 없음. 회복은 재인증/보완으로만.

---

## 3. 동작 매트릭스 (확정)

| # | 항목 | 확정 동작 |
|---|---|---|
| 1 | 개인 프로필 피드 노출 | 기본 남김, **끄기 선택 가능**(§5의 `removedFromOwnerFeed` 플래그) |
| 2 | 챌린지 피드 노출 | 기본 남김, **끄기 선택 가능**(`isPublic=false` 등) |
| 3 | 해당 일자 인증(점수·완료) | **취소**(그 게시물의 일자 기여 제거 → 재계산) |
| 4 | 취소 후 보완 | **그 일자 보완(remedy)이 특별히 열림**(정상 Day6 창 밖이어도) |
| 5 | 그날이 **당일**이면 | 신규 인증하면 **정상 점수** 인정 |
| 6 | 그날이 **과거** + 보완 안 함 | 완주 뱃지 **실패** |
| 7 | 마당 노출 | **유지(선택 불가)** — 취소로 마당에서 사라지지 않음 |
| 8 | 마당에서 내리기 | **관리자에게 별도 삭제 요청**(§7) |
| f | 취소 표시 | 남은 게시물에 **"취소됨/점수 미반영" 배지** |

---

## 4. 점수 · 완주 · 보완 규칙

- **재계산(d)**: 취소 시 해당 일자에서 그 questId(또는 개인퀘스트 슬롯)를 제거 → `isDayComplete` 재판정. 미완이면 status partial·score 0. **총점·연속일수(consecutiveDays)도 함께 재계산**(연속 끊김 허용). 기존 `recomputeTotals`/재계산 로직 재사용.
- **당일(5)**: 취소한 날이 오늘이면, 같은 날 **신규 인증 → 정상(×1) 점수**. 일반 제출 경로 그대로.
- **과거(6)**: 오늘이 아니면 정상 신규 인증 불가 → **보완(remedy)으로만** 회복. 보완 안 하면 그 일자 미완 확정 → **완주 실패**.
- **보완 특별 개방(c)**: 현재 보완은 Day6에 1~5일치·점수 ×0.7 한정. 취소된 일자는 **remedy 잠금을 특별 해제**하는 플래그(`remedyUnlocked`/`cancelReopenedRemedy`)를 progress[day]에 심어, remedy 제출 경로가 이 플래그를 인정하도록 확장. (보완 점수 계수 ×0.7 정책은 유지)
- **완주 후 잠금(b)**: 사용자가 이미 **완주(뱃지 발급)** 한 챌린지는 챌린지 피드가 **조회 전용** — 취소/보완 등 변경 불가. (뱃지 회수 이슈 원천 차단)

---

## 5. 노출 제어 (플래그)

취소는 "점수 해제"이고 노출은 별도 토글. 필요한 플래그:
- `scoreCancelled: true` + `cancelledAt` — 점수/완료에서 제외 표시(§4 재계산의 근거, §3-f 배지 근거).
- `isPublic: 'false'` (기존) — **챌린지 피드에서 빼기**(2번 끄기 선택 시).
- **신규 `removedFromOwnerFeed: true`** — **개인 프로필 피드에서도 빼기**(1번 끄기 선택 시). 개인 피드(`GET /c/verifications/me/profile-feed`·레거시 mine)는 현재 무필터이므로, 이 플래그를 **읽기 필터에 추가**해 제외.
- 마당(7)은 토글 없음 — 취소해도 courtyard 게시물 유지. (내리려면 §7)

취소 UI: ⋮ → "이 날 인증 취소" → 2중 확인 팝업 안에 옵션 2개 체크박스: `☐ 챌린지 피드에서도 숨기기` / `☐ 개인 프로필 피드에서도 숨기기`.

---

## 6. 마당 게시물은 유지 (7)

취소는 마당(courtyard) 노출에 영향 없음. 점수만 빠지고 마당엔 그대로. (마당 노출/숨김은 관리자 모더레이션·삭제요청의 영역)

---

## 7. 마당 삭제 요청 (8, g)

- **기존 신고/모더레이션 큐 재사용** — `POST /s/reports`에 **사유 `deletion_request`(삭제 요청)** 추가. (신고 사유 enum에 항목 추가)
- 관리자 신고 관리 페이지에서 동일 큐로 확인 → 마당 게시물 숨김/삭제 처리(이미 구현된 `/s/mod/plaza/:id/hide` 등).
- 진입점: ⋮ 메뉴의 "마당에서 내려달라고 요청"(취소와 **다른 동작**임을 문구로 분리).

---

## 8. 알림 (h)

- **인증 취소 → 리더 노티**: 사용자가 자기 인증을 취소하면 리더에게 알림(스탯 영향 인지). 신규 이벤트 `verification.self_cancelled`(수신자 leaderId) → notification-worker 케이스 추가. (알림워커는 `chme.*` 전부 수신 → 인프라 변경 불필요)
- **마당 삭제 요청 → 관리자 전달**: 삭제 요청(신고 사유 `deletion_request`)은 **기존 신고 큐**로 접수돼 관리자 신고 관리 페이지에 노출된다. 별도 푸시 알림 이벤트(`report.created`)는 관리자군 팬아웃 인프라가 없어 이번 범위에서 신설하지 않고, 기존 신고 처리 흐름(관리자 큐)에 합류한다.

---

## 9. 데이터 모델 (제안)

- 인증 아이템(VF#): `scoreCancelled`, `cancelledAt`, `removedFromOwnerFeed`, (기존) `isPublic`. 게시물 자체는 삭제하지 않음.
- 진행기록(progress[day]): 해당 questId를 leaderQuestIds에서 제거 + `remedyUnlocked: true`(보완 특별 개방) + status/score 재계산. `leaderGrantedComplete`가 있었다면 해제.
- 참여(UC#): `score`·`consecutiveDays` 재계산 반영.

---

## 10. 영향 받는 코드/서피스

- **challenge-api**: 신규 `PUT /c/:challengeId/verifications/:verificationId/cancel`(본인 소유·완주 전 가드) — 재계산 + 플래그 + `verification.self_cancelled` 발행. remedy 제출 경로(`verifications-remedy`)가 `remedyUnlocked` 인정하도록 확장. `me/profile-feed`·mine 필터에 `removedFromOwnerFeed` 제외. 챌린지 피드/공개 필터는 기존 `isPublic` 사용.
- **완주 후 잠금(b)**: 챌린지 피드의 사용자 변경 액션(취소·요청 등)을 완주 상태에서 비활성.
- **social-api**: 신고 사유 enum에 `deletion_request` 추가(§7).
- **contracts/worker**: `verification.self_cancelled` (+필요시 `report.created`) 이벤트 + notification-worker 라우팅.
- **frontend**: 본인 인증 카드 ⋮ 메뉴(취소 2중확인+노출 옵션 / 마당 삭제요청), "취소됨" 배지, 완주 후 조회전용 처리. NotificationsPage 라벨.

---

## 11. 구현 상태 (2026-08 구현 완료)

1. ✅ 취소 코어: `PUT /c/verifications/:id/cancel`(본인·완주전 가드 + day 재판정 + 플래그) + "취소됨·점수 미반영" 배지 + 카드 ⋮ 메뉴 + 2중 확인/노출 옵션 체크박스.
2. ✅ 개인피드 제외 필터(`removedFromOwnerFeed` — `me/profile-feed`·레거시 mine) + 챌린지피드 숨김(`isPublic='false'` + gsi2 제거).
3. ✅ 보완 특별 개방(`remedyUnlocked`) — `verifications-remedy` 가 대상 일자의 플래그를 인정해 정상 창(day 제약·disabled)을 우회(점수 ×0.7 유지).
4. ✅ 완주 후 조회전용 잠금 — `participation.status==='completed'` 이면 취소/인정요청 액션 비활성(서버 409 `CHALLENGE_COMPLETED_READONLY` + 프론트 숨김).
5. ✅ 마당 삭제요청 — 신고 사유 `deletion_request` 추가 + ⋮ 메뉴에서 `plaza`(courtyard) 타깃으로 기존 신고/모더레이션 큐 접수.
6. ✅ 인증 취소 → 리더 노티 — `verification.self_cancelled`(수신자 leaderId) + notification-worker 라우팅(알림워커 rate-limit로 스팸 완화).

관련 코드: `services/challenge-api/src/routes/verifications-cancel.ts`, `verifications-remedy.ts`, `verifications-read.ts`;
`packages/contracts/src/events.ts`; `services/workers/notification-worker/src/index.ts`;
`services/social-api/src/schemas.ts`; 프론트 `ChallengeFeedPage.tsx`·`ReportModal.tsx`·`PersonalFeedPage.tsx`·`NotificationsPage.tsx`·`challengeApi.ts`.
