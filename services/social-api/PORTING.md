# social-api 이식 기록 (PORTING.md)

레거시 `backend/services/{plaza,challenge-board,challenge-feed,bulletin}` (+ `plaza/hashtag`)
→ 신규 `services/social-api` (Hono 통합 Lambda).
테이블: **social 단일** (env `SOCIAL_TABLE`, generic pk/sk + gsi1/gsi2 — 이전 가이드 §3 social).
프리픽스: 보호 `/s/*`, 퍼블릭 `/public/{plaza,board,hashtags}...` (contracts `API_PREFIXES`).
그 외 env: `UPLOADS_BUCKET`(이미지 재서명), `ANON_ID_SALT`(익명 ID), `EVENT_BUS_NAME`(이벤트).

## 1. 라우트 매핑표 (레거시 → 신규)

### A. 마당 (plaza — 레거시 배선: verification-stack)

| 레거시 핸들러 | 레거시 라우트 | 신규 라우트 | 비고 |
|---|---|---|---|
| plaza/feed | GET /plaza/feed (퍼블릭) | **GET /public/plaza/feed** | `postType-createdAt-index` → **gsi1 `FEED#<postType>` Query**. filter(all/recruiting/in_progress/completed)→postType 매핑, all은 4타입 병렬 Query + exposureScore 병합 정렬, perType 커서 포맷(base64 `{perType:{...}}`)·구형 커서 재시작·isActive 필터·이미지 재서명(media-key)·sanitize(source* 필드 제거) 모두 승계. `?debug=` 진단 필드만 폐기 |
| (없음 — 신규) | — | **GET /public/plaza/:plazaPostId** | 게시물 상세 (피드와 동일한 sanitize/서명 정책). 404 `POST_NOT_FOUND` |
| (없음 — 신규) | — | **POST /s/plaza/posts** | 사용자 작성 게시물: `recruitment`(모집글)/`progress_update`(진행소식)/`badge_review`(뱃지후기) — 타입 값은 레거시 feed의 postType 승계. `courtyard`는 plaza-converter 워커 전용(§4). 본문 해시태그 추출→TAG# 레지스트리 유지+gsi2pk=`TAG#<대표태그>` 기록 |
| plaza/comments | GET /plaza/{id}/comments (퍼블릭) | **GET /public/plaza/:plazaPostId/comments** | sk `CMT#<createdAt>#<id>` 역순 Query. 바디(commentId/animalIcon/content/createdAt/isMine) 동일 — 퍼블릭 경로에는 클레임이 없어 **isMine 항상 false** (레거시는 토큰 있으면 표시) |
| plaza/comments | POST /plaza/{id}/comments | **POST /s/plaza/:plazaPostId/comments** | 300자 제한·동물 아이콘(`userId:postId` 시드)·commentCount 증분 동일. + `comment.created`(plaza) 발행 |
| plaza/react | POST /plaza/{id}/react | **POST /s/plaza/:plazaPostId/react** | `RCT#<userId>` put → RCT# COUNT 재계산 → META likeCount 갱신. 바디 `{likeCount,myReaction,recommendation}` 동일. **verifications 폴백 제거 (gap ⑤)** |
| plaza/react | POST /plaza/reactions (구형 호환) | — | **미이식**: 하위 호환 경로 불필요 (이전 가이드 §6 — 프론트가 contracts로 일괄 전환) |
| (없음 — 신규) | — | **DELETE /s/plaza/:plazaPostId/react** | `RCT#<userId>` delete + likeCount 재계산 (리액션 취소 표면 신설) |
| plaza/recommend | GET /plaza/recommendations | **GET /s/plaza/recommendations** | **축소 이식 (gap ⑥)**: 레거시는 challenges Scan + user-challenges Query — 풀스캔·크로스 도메인 모두 금지. v1은 소스 게시물의 챌린지 1건 추천 + 억제(dismiss) 필터만. 바디 형태(`{recommendations:[{id,challengeId,challengeTitle,completionRate,isRecruiting,reason}]}`) 유지 |
| plaza/dismiss-recommendation | POST /recommendations/{id}/dismiss | **POST /s/plaza/recommendations/:recommendationId/dismiss** | 48시간 억제 + TTL(`expiresAtTimestamp`) 동일. 저장 키는 `REC#<userId>`/`DIS#<challengeId>` (§3) |
| plaza/convert-verifications | (EventBridge 시간별 잡) | — | **미이식**: API가 아닌 워커 — plaza-converter 워커(오케스트레이터 배선)가 §4 아이템 계약대로 기록 |
| admin/plaza/convert-run-now | POST /admin/plaza/convert/run-now | — | **미이식**: 어드민 표면은 admin-api 소관 |

### B. 챌린지보드 (challenge-board — 레거시 배선: challenge-board-stack)

| 레거시 핸들러 | 레거시 라우트 | 신규 라우트 | 비고 |
|---|---|---|---|
| get-board | GET /challenge-board/{id} | **GET /s/board/:challengeId** | 블록은 `BLOCK#<order>` 아이템으로 분해 저장, 응답은 레거시 단일 문서 바디(플랫, envelope 없음) 재조립. 참여자 검사 스킵 (gap ①) |
| upsert-board | POST /challenge-board/{id} | **POST /s/board/:challengeId** | validateBlocks(quote 허용) 동일. 리더·lifecycle(completed/archived 409) 검사 스킵 (gap ①) |
| get-comments | GET /challenge-board/{id}/comments | **GET /s/board/:challengeId/comments** | nextToken 페이지네이션·리액션 Set 집계·바디 동일. **challengeCompleted=false 고정** (gap ②) |
| submit-comment | POST /challenge-board/{id}/comments | **POST /s/board/:challengeId/comments** | 1000자·일일 익명 ID·parentCommentId 동일. `ANON_SALT_NOT_CONFIGURED` 500 유지. + `comment.created`(board, 소유자=보드 META `updatedBy`) 발행. 참여자 검사 스킵 (gap ①) |
| quote-comment | POST /challenge-board/{id}/comments/{cid}/quote | **POST /s/board/:challengeId/comments/:commentId/quote** | 블록 삽입·isQuoted 마킹·`{success,newBlock}` 동일. 리더 검사 스킵 (gap ①) |
| react-comment | POST /challenge-board/{id}/comments/{cid}/react | **POST /s/board/:challengeId/comments/:commentId/react** | ❤️🔥👏 문자열 Set ADD/DELETE 동일 |
| get-preview | GET /preview-board/{id}·/challenge-preview/{id} | **GET /public/board/:challengeId/preview** | 프리뷰 없을 때 레거시는 challenges 조회 후 프리필 저장 — v1은 **비영속 기본 프리필**(placeholder) 반환 (gap ③). 실제 프리필은 리더가 upsert 시 확정 |
| upsert-preview | POST /preview-board/{id}·/challenge-preview/{id} | **POST /s/board/:challengeId/preview** | validateBlocks(quote 불허) 동일. 리더 검사 스킵 (gap ①). 이중 경로는 단일화 |
| leader-dm | POST /challenge-feed/{id}/leader-dm | **POST /s/board/:challengeId/leader-dm** | threadId 해시(`ldm-` + sha256 24자)·`{threadId,isNew,deepLink}` 동일. **leaderId는 바디 필수(클라이언트 제공)** — challenges 조회 금지 (gap ④). 레거시의 notifications 테이블 직접 기록은 폐기 — 'dm.requested' 이벤트 타입이 contracts에 없어 **v1 무알림** (gap ④) |

### C. 챌린지 피드 (challenge-feed — 레거시 배선: challenge-board-stack)

| 레거시 핸들러 | 레거시 라우트 | 신규 라우트 | 비고 |
|---|---|---|---|
| get-verification-comments | GET /challenge-feed/{cid}/verifications/{vid}/comments | **GET /s/challenge-feed/:challengeId/verifications/:verificationId/comments** | `VER#<vid>`/`CMT#` 정순 50개. 바디 `{data:[...]}`(플랫) 동일. **종료 후 안정 익명 공개·isLeader 판정은 미지원** (gap ②) — displayName은 저장된 일일 익명 ID |
| submit-verification-comment | POST 동일 | **POST 동일 (신규 프리픽스)** | 300자·일일 익명 ID(salt 미설정 시 '익명' 폴백) 동일. lifecycle active 게이트·참여자 검사 스킵 (gap ①). + `comment.created`(verification) — 소유자는 바디 `verificationOwnerId` 제공 시에만 발행 (gap ⑦) |
| delete-verification-comment | DELETE .../comments/{commentId} | **DELETE 동일** | 본인 댓글만·`{data:{deleted,commentId}}` 동일 |
| get-verification-reactions | GET .../reactions | **GET 동일** | emoji별 count+myReacted 집계 동일 |
| toggle-verification-reaction | POST·DELETE .../reactions | **POST·DELETE 동일** | 허용 이모지 10종·유저×인증×이모지 1건 유니크 승계 — sk `RCT#<userId>#<emoji>` (§3 확장 주석) |

### D. 불레틴 (bulletin — 레거시 배선: bulletin-stack)

| 레거시 핸들러 | 레거시 라우트 | 신규 라우트 | 비고 |
|---|---|---|---|
| list-posts | GET /bulletin/{id}/posts?phase= | **GET /s/bulletin/:challengeId/:phase/posts** | phase는 경로 세그먼트로 이동(신규 URL 설계 지시). `challengePhaseKey-index` → pk `BULL#<cid>#<phase>` Query. 최신순·isDeleted 필터·`{posts,total,nextToken,hasMore,phase}` 동일 |
| create-post | POST /bulletin/{id}/posts | **POST /s/bulletin/:challengeId/:phase/posts** | zod 스키마(2000자/이미지4/링크) 동일. **phase는 레거시가 challenge lifecycle에서 유추(+BULLETIN_UNAVAILABLE 409) — v1은 경로 phase 신뢰** (gap ①). 참여자 검사 스킵 (gap ①). 201 바디 동일(challengePhaseKey 포함) |
| like-post | POST .../posts/{postId}/like | **POST /s/bulletin/:challengeId/:phase/posts/:postId/like** | 토글·0 하한 조건·경쟁 조건 성공 처리·`{success,liked,message}` 동일 |
| list-comments | GET .../posts/{postId}/comments | **GET .../posts/:postId/comments** | 정순·isDeleted 필터·바디 동일 |
| create-comment | POST .../posts/{postId}/comments | **POST .../posts/:postId/comments** | 500자·1단 depth·게시글 존재 확인·commentCount 증분 동일. + `comment.created`(bulletin, 소유자=post.userId) 발행 |

### E. 해시태그 (레거시 배선: hashtag-stack → plaza/hashtag 단일 핸들러)

| 레거시 라우트 | 신규 라우트 | 비고 |
|---|---|---|
| GET /hashtags (보호) | **GET /public/hashtags** | **Scan → gsi1 `TAGREG` 파티션 Query 재작성** (registeredAt 역순). 바디 동일. 조회 계열은 퍼블릭으로 이동 (지시된 신규 URL 설계) |
| GET /hashtags/{tag} (보호) | **GET /public/hashtags/:tag** | followerCount = pk `TAG#<tag>` `FOLLOW#` COUNT Query. creatorPublic 마스킹 동일 |
| GET /hashtags/{tag}/posts (보호) | **GET /public/hashtags/:tag/posts** | `hashtag-createdAt-index` → **게시물 gsi2 `TAG#<tag>` Query**. 바디 동일 + 이미지 재서명 정책 일관 적용(신규) |
| GET /hashtags/{tag}/follow/status | **GET /s/hashtags/:tag/follow/status** | 자연 키 Get (`FOLLOW#<userId>`) — 레거시 GSI 조회 대체. 바디 동일 |
| POST /hashtags/{tag}/follow | **POST /s/hashtags/:tag/follow** | 201/`409 ALREADY_FOLLOWING`(followId 최상위 레거시 바디 유지) |
| DELETE /hashtags/{tag}/follow | **DELETE /s/hashtags/:tag/follow** | 200/`404 NOT_FOLLOWING` |

레거시 해시태그 **레지스트리 기록**(verification/submit 내 최초 등록자+postCount 로직)은
`repo/hashtags.registerHashtag`로 이식되어 **마당 게시물 작성 시** 수행된다. 인증 제출 쪽 등록은
challenge-api 소관이 아니므로(社 social 테이블 쓰기) — **plaza-converter가 courtyard 변환 시
hashtag가 있으면 동일하게 레지스트리를 유지해야 한다** (§4).

## 2. 키 설계 (이전 가이드 §3 social + 본 이식의 구체화)

| 엔티티 | pk | sk | GSI/속성 |
|---|---|---|---|
| 마당 게시물 | `POST#<plazaPostId>` | `META` | gsi1pk=`FEED#<postType>`, gsi1sk=`<createdAt>` / gsi2pk=`TAG#<hashtag>`, gsi2sk=`<createdAt>` (대표 태그 있을 때만) |
| 마당 댓글 | `POST#<id>` | `CMT#<createdAt>#<commentId>` | — |
| 마당 리액션 | `POST#<id>` | `RCT#<userId>` | 유저당 1건 (레거시 like 단일) |
| 추천 억제 | `REC#<userId>` | `DIS#<challengeId>` | TTL `expiresAtTimestamp` (48h). 가이드 표에 없던 엔티티 — dismiss 이식을 위해 추가 |
| 보드 메타 | `BOARD#<challengeId>` | `META` | editors/isPublic/updatedAt/updatedBy |
| 보드 블록 | `BOARD#<challengeId>` | `BLOCK#<order 4자리>` | `block` 속성에 블록 JSON |
| 보드 프리뷰 | `BOARD#<challengeId>` | `PREVIEW` | blocks 배열 내장 (단일 문서) |
| 보드 댓글 | `BOARD#<challengeId>` | `CMT#<createdAt>#<commentId>` | reaction_heart/fire/clap 문자열 Set |
| 리더 DM 마커 | `BOARD#<challengeId>` | `DM#<participantId>` | threadId/leaderId |
| 인증 댓글 | `VER#<verificationId>` | `CMT#<createdAt>#<commentId>` | challengeId 저장 (gap ① 방침) |
| 인증 리액션 | `VER#<verificationId>` | `RCT#<userId>#<emoji>` | 가이드 기본형 `RCT#<userId>`에 emoji 세그먼트 확장 — 레거시가 유저당 복수 이모지 허용 |
| 불레틴 게시글 | `BULL#<cid>#<phase>` | `POST#<createdAt>#<postId>` | — |
| 불레틴 댓글 | `BULL#<cid>#<phase>` | `PCMT#<postId>#<createdAt>#<commentId>` | — |
| 불레틴 좋아요 | `BULL#<cid>#<phase>` | `LIKE#<postId>#<userId>` | — |
| 태그 레지스트리 | `TAG#<tag>` | `META` | gsi1pk=`TAGREG`, gsi1sk=`<registeredAt>` (최신 목록 — 레거시 Scan 대체용 추가) |
| 태그 팔로우 | `TAG#<tag>` | `FOLLOW#<userId>` | gsi1pk=`TAGUSER#<userId>`, gsi1sk=`<tag>` |

## 3. 미이식·gap 목록

- **gap ① 참여자/리더/lifecycle 검사 스킵 (핵심 정책 결정)**: 레거시 `_shared/common.ts`의
  `isParticipant/wasParticipant/isLeader/getChallengeMeta`는 user-challenges·challenges 테이블
  조회 — 신규 아키텍처에서 이 데이터는 **challenges 테이블(challenge-api 도메인)** 소유이며
  크로스 도메인 read 금지. **v1 정책 = JWT 신뢰 + 아이템에 challengeId 저장.**
  참여 자격 강제는 **challenge-api join 시점 검증 + 향후 공유 authorizer(participant claim)** 로
  이관 예정. 그때까지 보드/피드/불레틴 쓰기·열람의 참여자 게이트, 보드/프리뷰 업서트·인용의
  리더 게이트, 불레틴 `BULLETIN_UNAVAILABLE`·피드 `CHALLENGE_NOT_ACTIVE` lifecycle 게이트는
  **런타임 미적용** (해당 403/409 에러 코드는 authorizer 도입 시 복원).
- **gap ② 종료 후 익명 공개 미지원**: 챌린지 completed 여부(lifecycle)를 읽을 수 없어
  보드/피드 댓글의 `createPersistentAnonymousId` 전환·`challengeCompleted`/`isRevealed`/`isLeader`
  플래그가 v1에서 비활성(항상 일일 익명, false). 순수 함수(`domain/anonymous-id.ts`)는 이식·테스트
  완료 — lifecycle 신호(이벤트 구독 또는 authorizer claim) 확보 시 활성화.
- **gap ③ 프리뷰 프리필 축소**: 레거시 get-preview는 challenges에서 유형/일정/설명을 읽어
  프리필 생성·저장 — v1은 비영속 placeholder 프리필 반환. 실제 내용은 리더 업서트로 확정.
- **gap ④ 리더 DM**: leaderId를 challenges에서 못 읽으므로 바디 필수 입력. 레거시의
  notifications 테이블 직접 기록은 폐기 — contracts에 DM용 이벤트 타입이 없어 v1 무알림.
  ('dm.requested' 이벤트 계약 추가 시 발행으로 대체.)
- **gap ⑤ plaza react의 verifications 폴백 제거**: 레거시는 게시물이 없으면 verifications
  테이블의 likeCount를 갱신 — 크로스 도메인 금지. v1은 마당 게시물에만 반응 (없으면 404).
  인증 카드 반응은 challenge-feed 라우트가 담당.
- **gap ⑥ 추천 축소**: 레거시 recommend는 challenges 풀스캔 + 리더/카테고리 랭킹.
  v1은 소스 게시물의 챌린지 1건 + dismiss 억제 필터만. 완전한 추천은 challenge-api 표면
  또는 이벤트 기반 프로젝션으로 재설계 필요.
- **gap ⑦ 인증 댓글 알림 소유자**: 인증 소유자(userId)는 challenges 도메인 데이터 —
  `comment.created`(verification)는 클라이언트가 `verificationOwnerId`를 보낸 경우에만 발행.
- **미이식**: `POST /plaza/reactions` 구형 호환 경로(§1-A), plaza feed `?debug=` 진단 필드,
  convert-verifications 잡(워커로), admin convert-run-now(admin-api로),
  개인 피드의 `/plaza/{id}/save*`(personal-feed-stack — user-api 소유 graph 테이블 `SAVE#` 소관).
- 레거시 `trackKpiEvent` 구조화 로그(board 계열)는 폐기 — 신규 표준 로깅(api-kit)이 대체.

## 4. plaza-converter 워커 아이템 계약 (중요)

plaza-converter(challenges R + social W — 가이드 §4 예외)는 공개 인증(gsi2 `VFPUB#<KST date>`)을
마당 게시물로 변환할 때 **아래 아이템을 social 테이블에 그대로 기록해야 한다**
(`repo/plaza.buildPostKeys`와 동일 키 규칙):

```jsonc
{
  "pk": "POST#courtyard-<verificationId>",
  "sk": "META",
  "gsi1pk": "FEED#courtyard",
  "gsi1sk": "<createdAt ISO>",              // 원본 인증 createdAt (없으면 변환 시각)
  // hashtag가 있을 때만:
  "gsi2pk": "TAG#<hashtag>",
  "gsi2sk": "<createdAt ISO>",

  "plazaPostId": "courtyard-<verificationId>",
  "postType": "courtyard",
  "challengeTitle": "<challengeTitle || '챌린지 기록'>",
  "challengeCategory": "<challengeCategory || null>",
  "currentDay": "<day || null>",
  "imageUrl": "<imageUrl || videoUrl || null>",
  "content": "<resolvePlazaFallbackContent(verification).content>", // backend/shared/lib/plaza-convert-content 정책 승계
  "leaderId": null,
  "leaderName": null,
  "leaderMessage": null,
  "recruitmentData": null,
  "sourceType": "verification",
  "sourceId": "<verificationId>",
  "sourceChallengeId": "<challengeId || undefined>",
  "sourceLeaderId": "<leaderId || undefined>",
  "sourceUserId": "<userId || null>",        // comment.created(plaza) targetOwnerId로 사용됨
  "likeCount": 0,                            // 신규 테이블 기준 0에서 시작 (RCT# 재계산과 정합)
  "commentCount": 0,
  "bookmarkCount": 0,
  "isActive": true,
  "createdAt": "<원본 인증 createdAt || 변환 시각>",
  "originalCreatedAt": "<원본 인증 createdAt || null>",
  "convertedAt": "<변환 시각 ISO>",
  "hashtag": "<hashtag>"                     // 있을 때만
}
```

- put은 `ConditionExpression: attribute_not_exists(pk)` (중복 변환 방지 — 레거시 동일).
- hashtag가 있으면 `repo/hashtags.registerHashtag`와 동일하게 `TAG#<tag>`/`META` 레지스트리
  (최초 등록자 기록 + postCount 증분)도 유지할 것.
- 변환 마킹(`isConvertedToPlaza`)은 challenges 테이블 인증 아이템 쪽 — 워커의 challenges RW 권한 소관.
- 피드 라우트는 `isActive !== false` 필터·`exposureScore` 미저장 시 즉석 계산을 하므로
  위 필드만 지키면 추가 계약 없음.

## 5. 이벤트 발행

| 지점 | 타입 | detail |
|---|---|---|
| 마당 댓글 작성 | `comment.created` | targetType=`plaza`, targetId=plazaPostId, targetOwnerId=post.sourceUserId(작성 게시물은 authorId) |
| 보드 댓글 작성 | `comment.created` | targetType=`board`, targetId=challengeId, targetOwnerId=보드 META updatedBy(리더) |
| 인증 댓글 작성 | `comment.created` | targetType=`verification`, targetId=verificationId, targetOwnerId=바디 `verificationOwnerId` (미제공 시 미발행 — gap ⑦) |
| 불레틴 댓글 작성 | `comment.created` | targetType=`bulletin`, targetId=postId, targetOwnerId=post.userId |

레거시의 notification 직접 기록(leader-dm)은 이벤트 계약 부재로 폐기 (gap ④).

## 6. 순수 로직·테스트

| 모듈 | 출처 | 테스트 |
|---|---|---|
| `domain/hashtags.ts` | 레거시 verification/submit 해시태그 정규식·clean 규칙 + 본문 추출(신규) | `hashtags.test.ts` |
| `domain/anonymous-id.ts` | challenge-feed/_shared/common.ts (spec: docs/challenge-feed-anonymous-id-spec.md) — salt 인자화 | `anonymous-id.test.ts` |
| `domain/pagination.ts` | nextToken(base64 LastEvaluatedKey) + plaza perType 커서 포맷 | `pagination.test.ts` |
| `domain/blocks.ts` | challenge-board/_shared/common.ts validateBlocks (동작 변경 금지) | `blocks.test.ts` |
| `domain/plaza-view.ts` | plaza/feed exposureScore·sanitize·filter 매핑, plaza/comments 동물 아이콘 | (순수 상수/매핑 — 피드 로직은 위 테스트로 커버) |
| `domain/media-key.ts` | challenge-api 사본(서비스 간 import 금지 원칙) — 원본 backend/shared/lib/media-key.ts | (challenge-api 쪽 원본 검증 승계) |

검증: `npx tsc -p services/social-api` ✅ / `npx jest --testPathPattern "services/social-api"` ✅ (33 tests).
