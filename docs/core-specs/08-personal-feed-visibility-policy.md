# 08 · 개인 프로필 피드 공개/열람 정책 (Personal Feed Visibility Policy)

> 대상: 개인 프로필 피드(`/personal-feed/:userId`)의 공개 범위·친구/팔로우·차단·초대·열람 조건.
> 목적: 현재 구현된 정책을 한곳에 정리하고(기획 정리), 불일치·공백을 점검(점검)한다.
> 코드 기준일: 2026-08. 관련 서비스: `user-api`, `challenge-api`, `gamification-api`, 프론트 `features/personal-feed`.

---

## 1. 개념 요약

개인 프로필 피드는 **반익명(semi-anonymous)** 이다. 마당/광장 게시물은 작성자 신원을 숨기며, 남의 피드로 가는 링크는 원칙적으로 **초대 링크/핸들 URL** 로만 도달한다(플라자·팔로워 목록엔 링크 없음).

피드는 4개 탭으로 구성된다:

| 탭 | 코드상 명칭 | 데이터 출처(엔드포인트) | 서빙 |
|---|---|---|---|
| 인증 | verifications (Tab01) | `GET /public/users/:id/verifications`(타인·공개만) / `GET /c/verifications/me/profile-feed`(본인·전량) | challenge-api |
| 챌린지 | challenges (Tab02) | `GET /public/users/:id/challenge-history`(완주만) | challenge-api |
| 업적 | achievements (Tab03) | `GET /public/users/:id/achievements` | gamification-api |
| 자유 | posts (Tab04) | `GET /u/feed/:id/posts`(+ 본인 저장글 `/u/feed/me/saved-posts`) | user-api |

프로필 메타(이름·아이콘·핸들·관계) 는 `GET /u/feed/:userId` (user-api) 가 제공한다.

---

## 2. 레이어 모델 (핵심)

공개 범위는 문자열 enum이 아니라 **뷰어와의 관계로 계산되는 레이어 L-1 ~ L4** 로 표현된다.
로직: `services/user-api/src/domain/feed-visibility.ts` `resolveLayer()`.

```
L4  본인 / (상호팔로우 or tab02Public) 수락 팔로워   → 챌린지·자유 등 전량
L3  수락된 팔로워(followStatus==='accepted')          → 인증 탭 열람
L2  팔로우 요청 가능(초대 링크 방문 or 공통 챌린지 자격)  → (현재 서버 경로 미연결, §7 참고)
L1  feedSettings.isPublic=true                         → 업적 탭 열람
L0  기본(비공개 피드의 낯선 사람)                        → 최소 정보만
-1  차단됨                                              → 403 BLOCKED
```

프로필 설정은 **두 개의 불리언** 뿐이다(별도 enum 없음). `USERS_TABLE` `pk=USER#<id>, sk=PROFILE` 의 `feedSettings` 맵:
- `isPublic` — 업적(Tab03) 공개 → L1
- `tab02Public` — 수락 팔로워에게 챌린지(Tab02)까지 공개 → L4 상향

관계 계산은 `feedProfileResponse()` (`user-api/src/routes/personal-feed.ts`) 인라인:
`isOwn`, `followStatus`(내가 그를 팔로우?), `reverseFollowStatus`(그가 나를?), `blockedByTarget`, `isFriend`(친구엣지 accepted), `isMutual = (상호 수락 팔로우) || isFriend`.

**탭별 최소 레이어(프론트 `LayerGate`, `PersonalFeedPage.tsx`):**

| 탭 | 본인 | 타인 최소 레이어 |
|---|---|---|
| 업적 | 0 | **1** (isPublic) |
| 인증 | 0 | **3** (수락 팔로워) |
| 자유 | 0 | **3** |
| 챌린지 | 0 | **4** (상호/친구 or tab02Public) |

자유 탭 개별 게시물은 추가로 `visibility ∈ {private, followers, mutual}` 를 가짐(`personal-feed-content.ts`): `private/mutual→L4`, `followers→L3`.

---

## 3. 팔로우 · 친구 모델

**두 개의 병렬 그래프가 공존한다.**

### (A) 팔로우 그래프 — 요청/승인형 단방향 (`GRAPH_TABLE`, `graph-repo.ts`)
- 팔로우(수락): `pk=USER#<followee>, sk=FOLLOWER#<follower>`, `status:'accepted'`
- 팔로우 요청(대기): `sk=FOLLOWREQ#<follower>`, `status:'pending'`
- 엔드포인트: `POST /u/feed/:id/follow-request`(요청) → `PUT /u/feed/follow-requests/:followId/accept|reject`(피팔로위만) → `DELETE /u/feed/:id/follow`(언팔) / `DELETE /u/feed/followers/:followerId`(팔로워 강제 제거)
- 목록: `GET /u/feed/me/followers`, `GET /u/feed/me/follow-requests`
- **"친구"(열람 관점) = 상호 수락 팔로우** (`isMutual`).

### (B) 친구 그래프 v2 — 상호요청 자동친구 (`FRIENDS_ENABLED`, `friends.ts`/`friends-repo.ts`)
- `pk=USER#<id>, sk=FRIEND#<other>`, status `pending|accepted|blocked|removed`.
- 자격: **양방향 상호작용 임계값**(`FRIEND_ELIGIBILITY_THRESHOLD`, 기본 100) — out·in 모두 ≥ T.
- 별도 accept 없음: 양쪽이 요청하면 `auto_friend` 로 즉시 accepted.
- 피드 열람에 반영: `feedProfileResponse` 가 `getFriendEdge` 를 읽어 `isFriend` → `isMutual` 에 OR 결합(친구는 상호팔로우와 동일 열람권 L4).

---

## 4. 차단 모델
- `POST /u/feed/:id/block`(멱등) / `DELETE /u/feed/:id/block` / 목록 `GET /u/feed/me/blocked`.
- 열람 시 `isBlocked(targetId, viewerId)`(= "피드 주인이 나를 차단했나") → `resolveLayer` -1 → **프로필 `GET /u/feed/:id` 403 `{error:'BLOCKED'}`**.
- 팔로우 요청에도 차단 검사(403).
- **차단은 기존 팔로우 엣지를 삭제하지 않는다**(BLOCK 아이템만 기록).

## 5. 초대 링크 · 핸들
- 초대: `POST/GET/DELETE /u/feed/me/invite-links`, 해석 `GET /u/feed/invite/:token`(만료 410, 소진 410) → `{ownerId, inviteLinkId}` 반환 + 사용수 증가. **서버는 초대 토큰으로 레이어를 부여하지 않는다**(단순 owner 해석 + 카운터). 로그인 필수(`/u/*`).
- 핸들: `PUT /u/feed/me/handle`, 정규식 `^[a-z][a-z0-9_]{2,19}$`, 30일 쿨다운(429), 유일성(409). `@handle` 로 프로필 조회 가능.

## 6. 인증(Auth) 표면
- `user-api`: `/u/*` 는 `requireAuth`. `/public/users/*` 는 무인증(뷰어 `null` 로 `feedProfileResponse` 호출 → isPublic 만으로 L0/L1).
- `challenge-api`: `/c/*` 는 `requireAuth`, **`/public/*` 는 완전 무인증**. `/public/users/:id/verifications`·`/challenge-history` 는 path의 userId만 보고 **공개분만** 반환.
- 재익명 정책: 인증 응답은 실제 userId/이름 대신 일일 `displayName` + `isMine` 만 노출.

---

## 7. 이번 변경 (2026-08) — 본인=전체 / 타인=공개만

**문제:** 인증 탭이 본인 피드에서도 무인증 `/public/users/:id/verifications` 를 호출 → `isPublicVerification` 필터가 본인·타인 무차별 적용되어, **소유자조차 자신의 비공개(`isPublic:false`)·추가(`isExtra`) 인증을 못 봄.**

**수정:**
- 신규 인증 엔드포인트 `GET /c/verifications/me/profile-feed` (challenge-api, `requireAuth`) — `authUser.userId` 기준 `gsi1 VFUSER#<id>` 를 **필터 없이 전량** 반환. 응답 형태는 public 판과 동일(10필드) + `isPublic`/`isExtra` 플래그.
- 프론트 `VerificationsTab` 에 `isOwn` 분기: 본인 → `getMyVerifications()`, 타인 → 기존 `getVerifications()`(공개만). 본인 그리드 타일에 `🔒 비공개`/`➕ 추가` 배지.
- 타인 경로·필터는 변경 없음 → "타인이면 공개만" 정책 유지.

관련 파일: `services/challenge-api/src/routes/verifications-read.ts`, `frontend/src/features/personal-feed/{api/personalFeedApi.ts, pages/PersonalFeedPage.tsx}`.

---

## 8. 점검 — 발견된 불일치·공백 (후속 검토 필요)

| # | 심각도 | 항목 | 내용 / 위험 | 제안 |
|---|---|---|---|---|
| G1 | **높음(보안)** | 공개 콘텐츠 엔드포인트가 레이어/차단 무시 | `challenge-api /public/users/:id/verifications`·`/challenge-history`, `gamification /public/users/:id/achievements` 는 **무인증·관계검사 없음**. 차단당한 사용자나 비팔로워도 URL만 알면 **공개분을 직접 조회 가능**. 프론트는 `LayerGate`(인증 최소 L3)로 가리지만 API는 열려 있어 UI 게이트와 서버 정책이 불일치. | 콘텐츠 엔드포인트에도 관계/차단 검사 도입(옵셔널 auth 또는 `/u/`·`/c/` 인증판 + 공개 폴백). 최소한 차단 사용자 배제. |
| G2 | 중간 | L2 경로 사실상 죽음 | `resolveLayer` 의 `hasSharedChallengeEligibility` 를 프로필 라우트가 **항상 false** 로 전달(교차도메인 미포팅). "공통 챌린지 10완주 시 팔로우 요청" 경로 미작동. | 챌린지 자격 조회 연동 또는 스펙에서 제거. |
| G3 | 중간 | 초대 링크가 서버 권한을 안 줌 | 프론트는 초대 방문 시 `Math.max(serverLayer,2)` 로 팔로우 버튼만 노출. 서버는 L 상향 없음 → 초대받아도 탭 콘텐츠는 여전히 안 보이고 "요청"만 가능. 사용자 기대와 어긋날 수 있음. | 초대 토큰→시청 레이어 부여(예: L2/L3) 서버 반영 여부 정책 결정. |
| G4 | 낮음 | 차단이 팔로우 엣지 미삭제 | 차단해도 상대의 기존 팔로우 관계는 남음(해제 시 그대로 팔로워). 의도라면 명문화 필요. | 차단 시 팔로우 엣지 정리 여부 결정. |
| G5 | 낮음 | 자유 탭 낯선 사람 응답 비일관 | 프로필은 차단 시 403이지만 `GET /u/feed/:id/posts` 는 낯선 사람에게 빈 목록(무403). | 응답 계약 통일(빈 목록 vs 403). |
| G6 | 낮음 | 챌린지 이력도 본인 전량 미제공 | 인증과 동일 이슈 — `/public/.../challenge-history` 는 완주만. 본인은 진행중/포기 이력을 자기 피드에서 못 봄. | 필요 시 인증과 같은 방식으로 본인 전량 엔드포인트 추가. |

> G1 은 보안/프라이버시 영향이 있어 우선 검토를 권장. 나머지는 제품 의도 확인 후 처리.
