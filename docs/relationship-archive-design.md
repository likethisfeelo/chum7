# 친구 추천 · 관계 아카이브 설계 및 개발 로드맵 (P2 · P3)

> 작성: 2026-07-23
> 대상: 신규 — 상호작용 이벤트 원장, 사용자쌍 집계, 친구 관계, 관계 요약/타임라인/아카이브
> 근거: 이 리포의 실제 구조(graph 테이블 = user-api 소유, EventBus `chme.*`, EventBridge Rule+DLQ 워커 패턴, 기존 발행 이벤트)
> 선행: P0·P1(신원 정책) 완료 — 모든 공개 표면에서 실 userId 미노출, 내부에는 userId 보존. 이 설계는 그 위에 "친구가 된 뒤에만" 관계를 잇는다.

---

## 0. 설계 원칙 (기획서 §5 반영)

1. **익명은 유지, 연결은 내부에서만.** 공개 화면의 활동명(수달N·아무개N)은 절대 실명으로 바뀌지 않는다. 관계는 서버 내부 userId로만 잇고, "친구가 된 두 사람"에게만 별도 화면에서 노출.
2. **이벤트로 적재, 조회는 집계로.** 상호작용은 발생 즉시 이벤트로 원장에 적재(원본 참조 보존)하고, 추천·요약은 집계 테이블로 빠르게 읽는다.
3. **바운디드 컨텍스트 유지.** 관계 데이터는 `graph` 테이블(이미 user-api 소유, 팔로우 그래프)에 둔다. 콘텐츠(social)와 분리. 크로스 도메인은 **이벤트 투영**으로만(동기 스캔 금지 — P1-6에서 정한 원칙 계승).
4. **UI는 나중, 데이터는 지금부터.** 관계 아카이브 화면(P3)은 늦게 만들어도, 원본 참조를 가진 이벤트 원장은 **친구 기능 이전부터** 적재를 시작한다.

---

## 1. 아키텍처 한눈에

```
[social-api / challenge-api / cheer-api]
      │  기존 도메인 이벤트 발행 (chme.*)
      │  comment.created · cheer.delivered · verification.submitted · challenge.completed · follow.accepted
      ▼
[EventBridge  chme bus]
      │  Rule(source prefix 'chme.') — 신규
      ▼
[interaction-projector  (신규 워커)]   ← settlement-worker와 동일 배선 패턴(Rule+DLQ)
      │  1) 원장 append  2) 사용자쌍 집계 갱신  3) 추천 점수 GSI 갱신
      ▼
[graph 테이블]  (user-api 소유)
      ├─ 이벤트 원장     PAIR#<lo>#<hi> / EVT#<ts>#<id>
      ├─ 사용자쌍 집계   USER#<uid> / PAIRSTAT#<other>      (gsi1: 추천 상위 N)
      └─ 친구 관계       USER#<uid> / FRIEND#<other>

[user-api]  (graph 소유 → 읽기 표면 추가)
      ├─ GET  /u/friends/recommendations
      ├─ POST /u/friends/requests · accept · block
      ├─ GET  /u/friends/:id/relationship-summary
      └─ GET  /u/friends/:id/archive  (P3)
```

- **쓰기(투영)**: 오직 interaction-projector 워커만 원장·집계를 쓴다(단일 기록자 → 정합성 단순).
- **읽기(표면)**: user-api가 graph 테이블을 읽어 추천·요약·아카이브 제공.
- **친구가 되기 전**: 추천 점수 산정에만 사용, 특정 활동명↔프로필 연결 절대 노출 금지.

---

## 2. 데이터 모델 (graph 테이블, 단일 테이블)

graph 테이블은 `pk/sk` + `gsi1(pk/sk)` + `gsi2(pk/sk)` 구조(팔로우가 이미 사용). 아래를 공존시킨다.

### 2.1 이벤트 원장 (아카이브 원천)
```
pk = PAIR#<loUserId>#<hiUserId>          // 순서 정규화: lo=min, hi=max (사전순)
sk = EVT#<occurredAt>#<interactionId>
────
interactionId, actorUserId, targetUserId,
interactionType,        // comment | reply | reaction | cheer | co_challenge | plaza_meet
contextType,            // challenge | plaza | verification | board
contextId,              // challengeId / plazaPostId ...
sourceEntityType,       // comment | verification | reaction | post
sourceEntityId,         // 원본 링크용
sourcePostId,           // (있으면)
publicActorSnapshot,    // { displayName, identityMode } — 당시 활동명 보존
visibilityState,        // active | deleted | hidden | reported
archiveEligible,        // boolean
occurredAt, createdAt, ttl?(선택: 미친구 오래된 원장 만료)
```
- 한 쌍의 모든 상호작용이 한 파티션 → 타임라인 조회는 `pk=PAIR#..` Query 정순/역순.
- **원본 참조 필수 보존**(sourceEntityId 등) — 이게 있어야 P3 실콘텐츠 연결 가능.

### 2.2 사용자쌍 집계 (추천 + 요약) — 양방향 미러
```
pk = USER#<userId>
sk = PAIRSTAT#<otherUserId>
────
otherUserId,
sharedChallengeCount, commentCount, replyCount, reactionCount, cheerCount, plazaMeetCount,
firstInteractionAt, lastInteractionAt,
recommendationScore, isFriend(bool), updatedAt
// gsi1pk = REC#<userId>   gsi1sk = <zero-padded score>#<otherUserId>   (isFriend=false·score>=임계값일 때만 기록)
```
- 각 쌍을 **두 사용자 파티션에 미러**(USER#a/PAIRSTAT#b, USER#b/PAIRSTAT#a) → "내 상위 관계"를 각자 파티션에서 조회.
- 추천은 `gsi1pk=REC#<uid>` Query(내림차순) 상위 N. 친구가 되면 gsi1 속성 제거(추천 후보 제외).

### 2.3 친구 관계
```
pk = USER#<userId>
sk = FRIEND#<friendUserId>
────
status,                 // pending | accepted | blocked | removed
requestedAt, acceptedAt,
archiveAccess: { summaryEnabled, timelineEnabled, fullContentEnabled }   // 단계적 공개 제어
```
- 수락은 양쪽에 accepted 기록. 차단/해제는 아카이브 접근 즉시 차단(§5.4).

---

## 3. 이벤트 흐름 — 무엇을 원장에 넣나

기존 발행 이벤트를 그대로 소비(신규 발행 최소화). projector가 이벤트→원장/집계로 변환.

| 소스 이벤트(기존) | interactionType | 비고 |
|---|---|---|
| `comment.created` (plaza/board/verification) | comment | targetOwnerId ↔ authorId 쌍. 이미 authorId·targetOwnerId 포함 |
| `cheer.delivered` | cheer | 응원 보낸/받은 쌍 |
| `verification.submitted` | (집계용) | 같은 챌린지 동시 참여 판정 소스 |
| `challenge.completed` | co_challenge | 완주자 목록으로 함께한 챌린지 +1 (배치) |
| `follow.accepted` | (친구 후보 가중) | 팔로우는 추천 가중치 |

**부족분(신규 발행 필요 시):**
- plaza 게시물에서의 "마주침"(plaza_meet): 같은 게시물에 댓글/반응한 사용자 쌍 → comment.created(plaza)로 유도 가능하므로 별도 이벤트 불필요.
- reaction(마당/보드 리액션): 필요하면 `reaction.created` 발행 추가(현재 미발행). P2-1 범위에서 결정.

> 원칙: **가능하면 기존 이벤트 재사용**. 새 이벤트는 꼭 필요한 것만(reaction 등).

---

## 4. 추천 알고리즘 (친구 되기 전)

`recommendationScore` = 가중 합 (projector가 집계 갱신 시 재계산):
```
score = 3*sharedChallengeCount
      + 2*(commentCount + replyCount)
      + 1*reactionCount
      + 2*cheerCount
      + 1*plazaMeetCount
      + recencyBoost(lastInteractionAt)     // 최근일수록 가산
      - penalties(차단/신고)
```
- 추천 응답은 **비식별 사유만**: `{ sharedChallenges, interactionLevel }`. 특정 댓글/활동명 노출 금지.
- 조회: `gsi1pk=REC#<uid>` 상위 N (isFriend=false, score≥임계값). 차단/이미친구/이미요청 제외 필터.

---

## 5. 관계 아카이브 (P3) — 단계적 공개

### 5.1 단계
| 단계 | 제공 | 데이터 소스 |
|---|---|---|
| 1 요약 | 함께한 챌린지 수·댓글·응원·첫 만남 | PAIRSTAT (즉시, 친구 수락 시 자동) |
| 2 타임라인 | 날짜별 상호작용 카드 + 당시 활동명 | 원장 Query(PAIR#) |
| 3 실콘텐츠 | 원본 게시물/댓글/인증 링크 | 원장 sourceEntityId → 각 도메인 조회 |

- 기본값: **친구 수락 → 요약 자동 공개**. 타임라인/전체는 `archiveAccess` 플래그 또는 상호 동의로 확장.

### 5.2 접근 제어(필수 검증, 매 요청)
현재 친구인가 · 차단 아님 · 해당 원장이 두 사람 쌍인가 · `archiveEligible` · 원본 미삭제/미비공개 · 해당 단계 플래그 활성.

### 5.3 실콘텐츠 연결 원칙
- 공개 화면의 익명 표기는 **그대로**. 아카이브에서만 "현재 친구 OOO와의 기록"으로 연결.
- 당시 활동명(publicActorSnapshot)도 함께 표시 — 실명으로 과거 화면 재작성 금지.

### 5.4 삭제·차단·해제 동기화
- 콘텐츠 삭제 → 원장 visibilityState=deleted, 아카이브 원문 미노출("삭제된 기록"만). 집계 수치 유지 여부는 정책(권장: 수치 유지, 원문 숨김).
- 차단 → 친구 해제 + 아카이브 접근 즉시 중단 + 추천 제외.
- 친구 해제 → 아카이브 접근 중단, 내부 원장은 신고·무결성 목적 보존.

---

## 6. API 표면 (user-api 확장 — graph 소유)

```
GET  /u/friends/recommendations                 // 상위 추천 (비식별 사유)
POST /u/friends/requests            { toUserId } // 친구 요청
POST /u/friends/requests/:id/accept             // 수락(양쪽 accepted)
POST /u/friends/:id/block                        // 차단
DELETE /u/friends/:id                            // 해제
GET  /u/friends                                  // 내 친구 목록(프로필 이름)
GET  /u/friends/:friendUserId/relationship-summary   // 단계1
GET  /u/friends/:friendUserId/archive                // 단계2/3 (플래그 검증)
GET  /u/friends/:friendUserId/archive/:interactionId // 실콘텐츠 링크 해석
```
- 전부 `/u/*`(JWT 보호). 관계 요약/아카이브는 **요청자가 당사자인지** 서버 검증.

---

## 7. 보안·개인정보 원칙 (재확인)
1. 퍼블릭 API에 실 userId 미포함(P0·P1 완료분 유지).
2. 친구 되기 전 익명↔프로필 연결 절대 금지.
3. 친구 후에도 공개 화면 과거 표기는 실명으로 안 바뀜.
4. 아카이브는 당사자 전용 인증 화면. 차단 시 즉시 차단.
5. 삭제 콘텐츠 원문 재노출 금지.
6. 전체 아카이브(단계3) 조회는 감사 로그 대상(`ops` 테이블 audit).

---

## 8. 개발 로드맵 (어떻게 개발해 나갈까)

각 단계는 **독립 배포 가능**하게 쪼갬. 앞 단계가 데이터를 쌓는 동안 뒤 단계 UI를 붙이는 구조.

### 단계 A — 이벤트 원장 기반 (P2-1) · 지금 시작 권장
목표: 상호작용을 원장·집계로 적재 시작(화면 없음).
1. `services/workers/interaction-projector/` 신규 — settlement-worker 복제 뼈대.
2. workers-stack에 `events.Rule({source prefix 'chme.'})` + Lambda + DLQ 배선, graph 테이블 `grantReadWriteData`.
3. projector 도메인: 이벤트→원장 append + PAIRSTAT 양방향 upsert(원자 `ADD`/`if_not_exists`) + score 재계산 + gsi1 갱신.
4. (필요 시) social-api에 `reaction.created` 발행 추가.
5. 테스트: 이벤트 픽스처→원장/집계 매핑 단위테스트(순수 도메인).
   **산출: 데이터가 쌓이기 시작. 되돌리기 쉬움(읽는 곳 없음).**

### 단계 B — 친구 관계 + 추천 (P2-2·P2-3)
1. user-api에 friends 라우트(요청/수락/차단/해제/목록).
2. `GET /u/friends/recommendations` — gsi1 REC# 상위 N, 필터(친구/차단/요청중 제외), 비식별 사유.
3. 프론트: 추천 카드 + 친구 요청/수락 UI.
   **산출: 친구 맺기 + 추천 동작. 요약/아카이브는 아직.**

### 단계 C — 관계 요약 (P3 단계1)
1. `GET /u/friends/:id/relationship-summary` — PAIRSTAT 조회, 당사자 검증.
2. 프론트: 친구 프로필에 "우리의 기록" 요약 카드.
   **산출: 친구 수락 시 요약 자동 노출.**

### 단계 D — 관계 타임라인 (P3 단계2)
1. `GET /u/friends/:id/archive` — 원장 PAIR# Query(페이지네이션), visibilityState=active만, 당시 활동명 포함.
2. 프론트: 날짜별 상호작용 카드.

### 단계 E — 실콘텐츠 연결 + 접근제어 고도화 (P3 단계3)
1. `GET .../archive/:interactionId` — sourceEntityId로 각 도메인 원본 해석(삭제/비공개 검증).
2. archiveAccess 플래그/상호 동의, 차단·해제 동기화, 단계3 감사 로그.
3. 프론트: 원본 게시물/댓글/인증 링크.

### 단계 F — 백필 (선택)
- 과거 상호작용을 원장으로 소급: 각 도메인에서 역산 가능한 범위만 배치. `source="backfill"` 표기. 완벽 복원은 비목표.

---

## 9. 정합성·운영
- **단일 기록자**(projector)라 원장·집계 경쟁 없음. 이벤트 재처리(중복 수신) 대비 `interactionId` 멱등(조건부 put).
- 집계 갱신 실패가 원장 append를 막지 않도록 단계 분리(원장 우선, 집계는 재계산 가능).
- projector 실패는 DLQ로 — 유실 없이 재처리.
- 이벤트 유실/순서역전 허용(집계는 누적·재계산 가능한 형태로 설계).

## 10. 인수 테스트 (핵심)
- 친구 되기 전: 특정 익명 활동↔프로필 연결 불가.
- 반복 상호작용 → 추천 집계 반영, 추천 사유는 비식별.
- 친구 수락 → 요약 노출, 제3자 조회 불가.
- 차단/해제 → 아카이브 접근 즉시 중단.
- 원본 삭제/비공개 → 아카이브 원문 미노출.
- 공개 화면 과거 활동명은 친구 후에도 실명으로 안 바뀜.

---

## 11. 요약 — 지금 결정할 것
1. **단계 A(이벤트 원장)부터 시작** — 데이터를 지금부터 쌓아야 나중에 아카이브가 가능(기획서 핵심).
2. reaction을 원장에 포함할지(→ `reaction.created` 발행 추가 여부).
3. 추천 점수 가중치·임계값 초기값(§4는 시작값 제안).
4. 아카이브 기본 공개 범위(요약 자동 / 타임라인·전체는 플래그·동의).

> 권장 진행: **A(원장) → B(친구·추천) → C(요약) → D(타임라인) → E(실콘텐츠)**. 각 단계 독립 배포·검증.
