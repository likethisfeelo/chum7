# P2 단계 A 구현 노트 — 상호작용 이벤트 원장 + 사용자쌍 집계

> 작성: 2026-07-23 · 상위 설계: docs/relationship-archive-design.md
> 이번 범위: 데이터 적재만(화면 없음). 친구/추천 API·UI는 단계 B 이후.

---

## 1. 이번에 구축한 것

- **`reaction.created` 이벤트 신설**(contracts) + 발행 추가
  - 마당 리액션: `POST /s/plaza/:id/react` → 게시물 소유자 대상(본인 제외)
  - 보드 댓글 리액션: `POST /s/board/:id/comments/:cid/react` (add 시, 본인 제외)
- **interaction-projector 워커**(신규) — `services/workers/interaction-projector/`
  - EventBridge Rule(source `chme.*`) + 전용 DLQ, graph 테이블 read/write
  - 소비 이벤트 → 사용자쌍 상호작용 변환: `comment.created`·`reaction.created`·`cheer.delivered`·`challenge.completed`
  - graph 테이블 적재: 이벤트 원장(`PAIR#lo#hi / EVT#ts#id`) + 사용자쌍 집계(`USER#uid / PAIRSTAT#other`, 양방향 미러) + 추천 gsi1(`REC#uid`)
- 순수 도메인(pairing.ts) 단위테스트

> 화면·API 없음. 지금부터 데이터가 쌓이기 시작한다(기획서: "친구 기능 이전부터 원장 적재").

## 2. 추천 점수 — 확정 초기값

`services/workers/interaction-projector/src/domain/pairing.ts`

| 상호작용 | 가중치 |
|---|---|
| co_challenge (함께 완주) | 3 |
| comment / reply | 2 |
| cheer (응원) | 2 |
| reaction | 1 |
| plaza_meet | 1 |

**최근성 가산(recencyBoost):** 마지막 상호작용이 7일 이내 +2, 30일 이내 +1, 그 외 0.

```
score = 3*sharedChallenge + 2*(comment+reply) + 2*cheer + 1*reaction + 1*plazaMeet + recencyBoost
```

- **추천 임계값 `RECOMMEND_THRESHOLD = 3`** — 이 점수 미만이면 추천 후보에서 제외(gsi1 미기록 → 인덱스 비대화 방지).
- 친구가 되면 gsi1 제거(추천 후보에서 빠짐).
- **조정 지점:** 값이 마음에 안 들면 `WEIGHTS`·`RECOMMEND_THRESHOLD`·`recencyBoost`만 고치면 됨(순수 함수). 과거 점수는 다음 상호작용 시 재계산됨.

> 초기값 근거: "함께 완주"가 가장 강한 신호(3), 대화/응원은 중간(2), 단발 리액션은 약(1). 임계값 3 = 최소 "댓글 1~2회 또는 함께 완주 1회" 수준부터 추천.

## 3. 멱등성 (중복 이벤트 안전)

- EventBridge는 at-least-once. 원장 append를 **조건부 put(attribute_not_exists)**으로 게이트 → 같은 `interactionId` 재수신 시 원장 스킵 + **집계도 스킵**(과다 카운트 방지).
- `interactionId` 도출: comment=commentId, cheer=cheerId, reaction=`rx:actor:target:occurredAt`, co_challenge=`cc:challengeId:lo:hi`(챌린지·쌍당 1건). `occurredAt`은 발행 시 주입되어 재수신에도 동일.
- projector 실패는 throw → DLQ 재처리(멱등이라 안전).

## 4. 아카이브 기본 공개 정책 — 확정 (P3에서 구현)

재식별 위험이 큰 단계일수록 "노출당하는 사람"의 명시 동의를 요구한다.

| 단계 | 기본 | 여는 조건 | 동의 주체 |
|---|---|---|---|
| ① 요약(집계 숫자) | **자동 ON** (친구 수락 시) | 친구 성립 | 암묵(친구됨) |
| ② 타임라인(당시 활동명+날짜) | OFF | **상호 동의** | 노출되는 양쪽 |
| ③ 실콘텐츠(원문 링크) | OFF | **상호 동의 필수 + 글로벌 기능 플래그** | 양쪽 명시 |

- 공개 화면(마당·챌린지)의 과거 익명 표기(수달N·아무개N)는 **친구가 돼도 실명으로 절대 안 바뀜**. 연결은 아카이브 화면 안에서만.
- **차단/친구 해제 → 모든 단계 접근 즉시 차단 + 동의 리셋.** 내부 원장은 신고·무결성 목적 보존.
- 원본 삭제/비공개 → 실콘텐츠 단계에서도 원문 미노출("삭제된 기록"만). 집계 수치는 유지.
- 단계③ 조회는 감사 로그(ops audit) 대상.

## 5. 데이터 모델(적재 결과) — graph 테이블

```
이벤트 원장   PAIR#<lo>#<hi> / EVT#<occurredAt>#<interactionId>
              { actorUserId, targetUserId, interactionType, contextType, contextId,
                sourceEntityType, sourceEntityId, visibilityState:'active', archiveEligible:true }
사용자쌍 집계 USER#<uid> / PAIRSTAT#<other>   (양방향 미러)
              { otherUserId, *Count들, first/lastInteractionAt, recommendationScore, isFriend }
              gsi1pk=REC#<uid> gsi1sk=<제로패딩score>#<other>  (isFriend=false·score≥3일 때만)
```

## 6. 다음 단계 (단계 B~)
- **B**: user-api friends 라우트(요청/수락/차단/해제) + `GET /u/friends/recommendations`(gsi1 REC# 상위 N, 비식별 사유) + 프론트.
- **C**: `GET /u/friends/:id/relationship-summary`(PAIRSTAT).
- **D**: `GET /u/friends/:id/archive`(원장 PAIR# Query, 상호 동의 검증).
- **E**: 실콘텐츠 링크 해석 + 접근제어·감사.

> 친구가 되면 PAIRSTAT의 `isFriend`를 true로 갱신하고 gsi1을 제거하는 로직은 단계 B(친구 수락 핸들러)에서 추가한다. 현재 projector는 isFriend를 false로 초기화만 한다.
