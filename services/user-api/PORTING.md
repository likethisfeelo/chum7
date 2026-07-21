# user-api 이식 기록 (PORTING)

레거시 `backend/services/*` → `services/user-api` (Hono 통합 Lambda, `/u` + `/public/users`).
상위 규칙: `docs/redesign-porting-guide.md`. 테이블: users(USERS_TABLE) + graph(GRAPH_TABLE).

## 1. 라우트 매핑표 (레거시 핸들러 → 신규 라우트)

### 인증/프로필 (backend/services/auth)
| 레거시 | 신규 | 비고 |
|---|---|---|
| auth/register | POST /auth/register | Phase 1 이식 완료 (기존) |
| auth/login | POST /auth/login | Phase 1 이식 완료 (기존) |
| auth/refresh-token | POST /auth/refresh | Phase 1 이식 완료 (기존) |
| auth/get-profile | GET /u/me | Phase 1 이식 완료 (기존) |
| auth/update-profile | **PATCH /u/me** | 요청/응답 계약 동일 (zod 스키마·NO_UPDATE_FIELDS·갱신본 반환). data는 PROFILE 아이템에서 pk/sk/gsi 키 제거본 |

### 알림 (backend/services/notification + notifications — 폴더명 분기 통합)
레거시에는 `notification/`(list, mark-read)과 `notifications/`(settings) **두 폴더가 공존**
(단수/복수 네이밍 분기). 신규에서는 `/u/notifications` 하나로 통합했다 (`src/routes/notifications.ts`).

| 레거시 | 신규 | 비고 |
|---|---|---|
| notification/list (GET /notifications) | **GET /u/notifications** | users 테이블 Query pk=`USER#<id>` begins_with sk=`NOTIF#` ScanIndexForward=false. `includeRead` 필터 승계. **의도적 변경**: 고정 Limit 20 → `limit`(기본 20, 최대 50) + `nextToken`(base64url LastEvaluatedKey) 페이지네이션 추가 — data가 배열 → `{ notifications, nextToken }` |
| notification/mark-read (PATCH /notifications/{id}/read) | **POST /u/notifications/read** | body `{ notificationId }`. 에러코드·메시지 승계. sk=`NOTIF#<notificationId>` 직접 Get. 본인 파티션만 조회하므로 레거시 403(타인 알림) 케이스는 404로 수렴 |
| notifications/settings (GET /notifications/settings) | **GET /u/notifications/settings** | 응답 `{ settings }` (기본값 병합) 동일. 저장 위치: users 아이템 sk=`SETTINGS#notifications` (레거시: 프로필의 notificationSettings 필드) |
| notifications/settings (PUT /notifications/settings) | **PUT /u/notifications/settings** | 카테고리/타입 화이트리스트·`NO_VALID_FIELDS`·응답 `{ updated }` 동일 (`src/domain/notification-settings.ts` + 테스트) |

### 개인 피드 (backend/services/personal-feed, infra/stacks/personal-feed-stack.ts 기준 전 라우트)
| 레거시 | 신규 | 비고 |
|---|---|---|
| GET /personal-feed/{userId} (profile) | **GET /u/feed/:userId** (`me`/`@handle` 지원) | 레이어 판정 `src/domain/feed-visibility.ts`(순수+테스트). 핸들 조회 gsi1pk=`HANDLE#<handle>` |
| (신규 퍼블릭 표면) | **GET /public/users/:handle** | 비로그인 조회 — 동일 응답 형태, requester 없음 → isPublic=true면 L1, 아니면 L0 |
| GET /personal-feed/{userId}/achievements | **미이식** | 사유: user-challenges·verifications·cheers·badges·challenges 테이블 크로스 도메인 read. 가이드 §4 예외 없음 — challenge/gamification/cheer API 응답 조합(프론트) 또는 별도 예외 문서화 후 이관 필요 |
| GET /personal-feed/{userId}/verifications | **미이식** | 사유: challenges 테이블(가이드 §3 gsi1pk=`VFUSER#<userId>`) — challenge-api 소관 |
| GET /personal-feed/{userId}/challenges | **미이식** | 사유: 동일 (user-challenge = challenges 테이블 `UC#`/gsi1 `UCUSER#`) — challenge-api 소관 |
| POST /personal-feed/{userId}/follow-request | **POST /u/feed/:userId/follow-request** | graph: pk=`USER#<followee>` sk=`FOLLOWREQ#<follower>`. 알림 직기록 → `publishEvent('follow.requested')` 로 대체 (notification-worker 소비) |
| PUT /personal-feed/follow-requests/{followId}/accept | **PUT /u/feed/follow-requests/:followId/accept** | 수락 시 FOLLOWREQ 삭제 + `FOLLOWER#` 아이템 생성. followId 계약(`follower#followee`) 유지 |
| PUT /personal-feed/follow-requests/{followId}/reject | **PUT /u/feed/follow-requests/:followId/reject** | 거절 시 FOLLOWREQ 삭제. **의도적 변경**: 레거시는 status='rejected' 아이템이 남아 재요청이 409였으나, 신규는 거절 후 재요청 가능 |
| DELETE /personal-feed/{userId}/follow | **DELETE /u/feed/:userId/follow** | FOLLOWER + 잔여 FOLLOWREQ 모두 삭제 (레거시 단일 아이템 삭제와 등가) |
| DELETE /personal-feed/followers/{followerId} | **DELETE /u/feed/followers/:followerId** | 동일 |
| GET /personal-feed/me/followers | **GET /u/feed/me/followers** | 파티션 Query begins_with `FOLLOWER#`, createdAt 역순 정렬. 응답 동일 |
| GET /personal-feed/me/follow-requests | **GET /u/feed/me/follow-requests** | begins_with `FOLLOWREQ#`. 응답 동일 |
| POST /personal-feed/{userId}/block | **POST /u/feed/:userId/block** | pk=`USER#<blocker>` sk=`BLOCK#<blocked>`, 중복 차단 idempotent 동일 |
| DELETE /personal-feed/{userId}/block | **DELETE /u/feed/:userId/block** | 동일 |
| GET /personal-feed/me/blocked | **GET /u/feed/me/blocked** | blockId 계약(`blocker#blocked`) 유지 |
| POST /personal-feed/me/invite-links | **POST /u/feed/me/invite-links** | pk=`INVITE#<token>` sk=`META`, gsi2pk=`INVITEOWNER#<owner>`. expiresAtTimestamp는 TTL 속성 겸용 |
| GET /personal-feed/me/invite-links | **GET /u/feed/me/invite-links** | gsi2 Query 최신순. 응답 동일 |
| DELETE /personal-feed/me/invite-links/{linkId} | **DELETE /u/feed/me/invite-links/:linkId** | 소유자 gsi2에서 탐색 — 레거시 403(타인 링크) 케이스는 404로 수렴 |
| GET /personal-feed/invite/{token} | **GET /u/feed/invite/:token** | 만료/소진 410, usedCount 증가 동일. 소유자 알림은 이벤트 계약 공백(§3) |
| POST /personal-feed/me/posts/upload-url | **미이식** | 사유: S3 presigned URL 발급 — 신규 워크스페이스에 `@aws-sdk/client-s3`·`s3-request-presigner` 미설치 + UPLOADS_BUCKET 배선 없음. 오케스트레이터가 의존성/grant 배선 후 추가 예정 |
| POST /personal-feed/me/posts | **POST /u/feed/me/posts** | pk=`USER#<userId>` sk=`PP#<createdAt>#<postId>`. EMPTY_POST·visibility 기본값 동일 |
| GET /personal-feed/{userId}/posts | **GET /u/feed/:userId/posts** | 레이어·visibility 필터(순수 함수) 동일, nextToken 동일 형식. **GAP**: 이미지 presign 미이식 — `imageUrls`에 imageKeys 원본 반환 (upload-url과 동일 사유) |
| PUT /personal-feed/me/posts/{postId} | **PUT /u/feed/me/posts/:postId** | postId(uuid)로 본인 파티션 내 검색. 레거시 403(타인 게시물) → 404 수렴 |
| DELETE /personal-feed/me/posts/{postId} | **DELETE /u/feed/me/posts/:postId** | 동일 |
| POST /plaza/{plazaPostId}/save | **POST /u/feed/plaza/:plazaPostId/save** | pk=`USER#<userId>` sk=`SAVE#<postId>`. **GAP**: 광장 게시물 존재 확인·postSnapshot 기록은 social 도메인(PLAZA_POSTS) 크로스 read라 미이관 — 목록의 postSnapshot은 null, 스냅샷은 프론트 조합 또는 social 이벤트로 해결 |
| DELETE /plaza/{plazaPostId}/save | **DELETE /u/feed/plaza/:plazaPostId/save** | NOT_SAVED 404 동일 |
| GET /plaza/{plazaPostId}/save/status | **GET /u/feed/plaza/:plazaPostId/save/status** | 동일 |
| GET /personal-feed/me/saved-posts | **GET /u/feed/me/saved-posts** | 정렬이 savedAt 역순 → sk(plazaPostId) 역순으로 변경 (파티션 Query) |
| PUT /personal-feed/me/handle | **PUT /u/feed/me/handle** | 규칙/30일 제한/중복 409/응답 동일 (`src/domain/handle.ts` + 테스트). 핸들 인덱싱: PROFILE 아이템 gsi1pk=`HANDLE#<handle>` gsi1sk=`USER` |
| PUT /personal-feed/me/settings | **PUT /u/feed/me/settings** | feedSettings 병합 동일. NO_UPDATES 400 동일 |

### 신규 (레거시 없음)
| 신규 | 설명 |
|---|---|
| **POST /u/push-subscriptions** | body `{ endpoint, keys: { p256dh, auth } }` → users sk=`PUSH#<sha256(endpoint) hex 앞 16자>` (node:crypto, `src/domain/push.ts`). 201 `{ endpointId }` |
| **DELETE /u/push-subscriptions** | body(또는 쿼리) `endpoint` 필수 → 해당 PUSH# 아이템 삭제 |

## 2. 미이식 항목 요약
- **personal-feed/achievements·challenges·verifications**: challenge·cheer·gamification 도메인 테이블 크로스 read. 가이드 §1-4(도메인 테이블만 접근)·§4(문서화된 예외 없음) 위배라 이관 보류. 해당 데이터는 각 도메인 API에서 제공(challenges gsi1 `UCUSER#`/`VFUSER#` 설계 존재) 후 프론트 응답 조합으로 전환.
- **personal-feed/posts upload-url + 이미지 presign**: S3 SDK 미배선 (위 표 참고).
- **profile의 공통 챌린지 10회 완주(L2 경로 B) 판정**: user-challenges 크로스 read — 항상 미충족 처리. L2 진입은 초대 링크 경로로만 동작. 필요 시 challenge 도메인 이벤트/API로 대체 설계 필요.
- **레거시 rejected 팔로우 상태 보존**: 거절 이력을 남기지 않는 방향으로 단순화 (재요청 허용). 제품 정책 확인 필요 시 FOLLOWREQ 아이템에 status=rejected 유지로 되돌릴 수 있음.

## 3. 이벤트/계약 공백 (contracts 미수정 — 오케스트레이터 추가 요망)
`@chum7/contracts` `domainEventSchemas`에 다음 타입이 없어 발행하지 못했다 (레거시는 notification 직기록):
- **`follow.accepted`** `{ followerId, followeeId }` — 팔로우 요청 수락 시 요청자에게 알림 (레거시 `feed_follow_accepted`). 현재 수락 시 이벤트 미발행.
- **`feed.invite_link_used`** `{ ownerId, inviteLinkId, usedBy }` — 초대 링크 사용 시 소유자 알림 (레거시 `feed_invite_link_used`). 현재 미발행. 발행 조건(사용자 ≠ 소유자)은 라우트 주석 참고.

발행 중인 이벤트: `follow.requested` (팔로우 요청 → notification-worker가 인앱 알림 기록).

기타 계약 메모:
- 알림 목록 페이지네이션 추가로 응답 data 형태 변경(§1 알림 표) — 프론트 전환 시 반영 필요.
- push-subscriptions는 신규 표면 — contracts에 라우트/스키마 상수 미존재 (schemas.ts에 zod로만 정의).

## 4. 구조
```
src/
├── domain/   feed-visibility, notification-settings, handle, push (+ *.test.ts 4종)
├── repo/     profile-repo, notifications-repo, graph-repo(팔로우/차단), invite-repo,
│             posts-repo(자유글/저장), push-repo, paging(nextToken 유틸)
└── routes/   profile, notifications, personal-feed(프로필·팔로우·차단·핸들·설정 + /public/users),
              personal-feed-content(자유글·저장·초대 — 400줄 제한 분할), push
```

## 5. 검증
- `npx tsc -p services/user-api` 통과
- `npx jest --silent --testPathPattern "services/user-api"` — 4 suites / 26 tests 통과
