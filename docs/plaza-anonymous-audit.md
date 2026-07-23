# 마당(광장) 댓글 · 익명 ON/OFF 점검 및 개선 기획서

> 작성: 2026-07-23 · 대상: `services/social-api`, `frontend/src/features/feed`, `infra2/stacks/api-stack.ts`
> 목적: 마당 댓글과 "익명 ON/OFF" 기능의 현 상태를 점검하고, 제품 관점의 목표 상태와 구체적 수정안을 제안한다.

---

## 0. 한 줄 요약

- **익명 ON/OFF 토글은 지금 "장식"이다.** localStorage에만 저장되고 서버로 전송되지 않아, 켜도/꺼도 실제로 익명화·비익명화되는 것이 없다.
- **익명 신원 체계가 3개로 분열**돼 있고 서로 연결되지 않는다(마당 댓글 8종 이모지 / 보드·인증 댓글 16종 동물+번호 / 프론트 장식용 활동명).
- **치명적 2건:** ① `ANON_ID_SALT` 미주입으로 **보드 댓글이 500**, 인증 댓글은 모두 '익명'으로 붕괴. ② **마당 게시물이 작성자 실제 `userId`(`authorId`)를 퍼블릭 응답에 노출**(반익명이라 표방하나 신원 식별 가능).
- **마당 댓글은 작성·조회는 동작**하나 삭제·수정·댓글반응이 없고, `isMine`이 새로고침 후 사라지며, `commentCount`가 비정합해질 수 있다.

심각도 범례: **[P0] 치명(데이터 유출/기능 불능)** · **[P1] 중대(핵심 UX 결함)** · **[P2] 개선(완성도)**

---

## 1. 점검 범위와 현재 구조

### 1.1 마당(plaza)이란
반익명 커뮤니티 피드("마당 🚀 · 반익명 커뮤니티", `frontend/.../feed/pages/FeedPage.tsx:250-251`). 단일 `social` 테이블에 `pk=POST#<id>`, `sk=META`로 저장. 게시물 타입 4종(`domain/plaza-view.ts:10-14`):

| 타입 | 출처 |
|---|---|
| `courtyard` | 인증글 자동 변환 (plaza-converter 워커 전용) |
| `recruitment` / `progress_update` / `badge_review` | 사용자 작성 (`POST /s/plaza/posts`) |

### 1.2 익명 신원 체계 — **3종 분열**
| 스킴 | 알고리즘 | 사용처 | 강도 |
|---|---|---|---|
| **A. 일일 동물 ID** | `SHA256(cid:uid:KST날짜:salt)` → 16동물×(100–999). 하루 단위 회전, 챌린지별 상이 (`domain/anonymous-id.ts:31-51`) | 보드 댓글, 인증(피드) 댓글 | 상대적 강함(솔트 필요) |
| **B. 마당 댓글 아이콘** | `sum(charCode) % 8` → 8개 이모지. 시드 `userId:postId`, **무솔트** (`plaza-view.ts:62-68`, `routes/plaza.ts:237`) | 마당 댓글 | 약함(8버킷·역산 용이) |
| **C. 프론트 장식 별칭** | 월 기준 4개 한글명 / `아무개NN` (`AnonymousModeBanner.tsx:5,13`, `CommentSection.tsx:5-8,47`) | 화면 표시만 | 무의미(서버 미연동) |

세 스킴은 서로 참조하지 않는다. 같은 댓글이 화면 라벨(C)·서버 아이콘(B)로 **다른 이름**으로 보일 수 있어 사용자가 혼란한다.

### 1.3 "익명 ON/OFF" 토글의 실제 동작
- 위치: `AnonymousModeBanner.tsx`(모바일·데스크톱 2곳), 상태는 `FeedPage.tsx:224-230`의 `toggleAnonymousMode`.
- **동작: `localStorage['outer-space-anonymous-mode']` 한 줄만 기록.** 댓글 작성 호출 `createPlazaComment`은 `{ content }`만 전송(`plazaApi.ts:141-144`) — **익명 플래그가 API에 없음.**
- 즉 **서버에는 사용자 제어 익명 스위치 개념이 아예 없다.** 마당·보드·인증 댓글은 무조건 익명(가명)으로만 작성되며, 실명으로 올리는 경로도, 게시물을 강제 익명화하는 경로도 없다.
- 참고: `FeedSettingsPage.tsx`의 토글은 "업적/챌린지 탭 공개"(`isPublic`/`tab02Public`)로 **익명과 무관**하다. 거기 "익명" 문자열은 팔로우 요청 라벨일 뿐.

---

## 2. 점검 결과 — 이슈 목록

### [P0-1] `ANON_ID_SALT` 미주입 → 보드 댓글 500 · 인증 댓글 익명 붕괴
- **현상:** 보드 댓글 작성 시 `500 ANON_SALT_NOT_CONFIGURED`(`routes/board.ts:181`). 인증(피드) 댓글은 솔트 없으면 전원 `'익명'`으로 폴백(`challenge-feed.ts:59-64`) → 사용자 구분 불가.
- **원인:** `infra2/stacks/api-stack.ts`의 social-api env에 `ANON_ID_SALT`가 없음(`SOCIAL_TABLE`·`UPLOADS_BUCKET`만 주입, `api-stack.ts:155-163`). 인프라 전반(시크릿/스테이지/워커) 어디에도 salt 소스가 **존재하지 않음**(시크릿은 pg·identity·vapid 3종뿐).
- **부가:** 동일 원인인데 실패 모드가 갈림(보드 500 vs 인증 '익명') — 일관성 결함.

### [P0-2] 마당 게시물이 작성자 실제 `userId`를 퍼블릭 응답에 노출
- **현상:** `/public/plaza/feed`, `/public/plaza/:id`, 게시물 작성 응답에 **`authorId`(=실제 userId)**가 그대로 포함. 미인증 퍼블릭 엔드포인트에서 신원 식별 가능.
- **원인:** 작성 시 `authorId: userId` 저장(`routes/plaza.ts:205`), `sanitizePost`가 `sourceUserId` 등은 제거하나 **`authorId`는 안 지움**(`plaza-view.ts:44-60`). 프론트 타입엔 `authorId`가 없어 "화면상 익명"으로 보이는 **누락 의존 마스킹**(leaky-by-omission).
- **영향:** "반익명 커뮤니티" 표방과 정면 배치. 크롤링/직접 호출로 전 게시물 작성자 매핑 가능.

### [P1-1] 익명 ON/OFF 토글이 비기능(오해 유발)
- 켜면 `{아이콘} 익명`, 끄면 `아무개NN`으로 **라벨 포맷만** 바뀔 뿐(둘 다 동일 서버 아이콘 기반). "익명 OFF"가 신원을 드러내지 않고, "ON"이 서버 저장을 바꾸지 않는다(`CommentSection.tsx:47`). 배너·별칭·서버 아이콘이 같은 댓글의 세 이름.

### [P1-2] 마당 댓글 `isMine`이 새로고침 후 사라짐
- 목록이 퍼블릭 엔드포인트(`GET /public/plaza/:id/comments`)만 사용 → 인증 클레임 없어 `isMine` 항상 false(`plaza.ts:53-61,165`). 낙관적 삽입 때만 "나" 배지가 잠깐 뜨고 재조회 시 소멸(`usePlazaComments.ts:123-131`). 인증 목록 엔드포인트 부재.

### [P1-3] 마당 댓글 삭제 불가
- 삭제 라우트·UI 모두 없음. `commentCount`는 +1만 존재(`plaza.ts:249`) → 본인 댓글도 못 지움.

### [P2-1] `commentCount` 비정합
- 비트랜잭션 증분(`putPostComment` 후 별도 `incrementPostCounter`, `repo/plaza.ts:119`)이고 실제 `CMT#` 수와 대사(reconcile) 안 함(likeCount는 매번 재계산과 대비). 중간 실패 시 카운트 드리프트.

### [P2-2] 약한 마당 댓글 가명(8버킷·무솔트)
- 8개 이모지·무솔트·`userId:postId` 시드(`plaza-view.ts:63-68`). 익명 집합이 지나치게 작고 알고리즘 공개라 역산·충돌 용이. 보드/인증(16×900·솔트)과 강도 격차.

### [P2-3] 종료 후 익명 공개(reveal) 미구현
- `createPersistentAnonymousId`·`isRevealed`·`isLeader` 전부 하드코딩 false(`board.ts:139`, `challenge-feed.ts:45`). "챌린지 종료 후 안정 익명/리더 표시" 스펙 절반이 死코드.

### [P2-4] 소소한 결함
- 마당 댓글 목록 UI에 **死 401 분기**("로그인 후 댓글…", `usePlazaComments.ts:87`) — 퍼블릭이라 401 안 남.
- 댓글 작성 **비멱등**(조건식 없음, `repo/plaza.ts:86-88`) → 더블 서브밋 시 중복 가능(프론트만 `isSubmitting` 방어).
- 리액션이 항상 `myReaction:'like'` 반환(`plaza.ts:295`), 취소는 null — 상태 표현 부정확.
- 댓글 수정·댓글 단위 반응·대댓글 없음(보드는 `parentCommentId` 지원 — 표면 격차).

---

## 3. 기획: 목표 상태

### 3.1 제품 원칙(제안)
1. **하나의 정식 익명 신원 체계**로 통일한다(스킴 A 확장). 약한 스킴 B와 장식 스킴 C는 폐기/대체.
2. **마스킹은 서버가 보장**한다(클라이언트가 필드를 안 읽는 데 의존하지 않는다).
3. **"익명"의 의미를 제품 차원에서 확정**한다(§3.2 결정 필요).

### 3.2 ⚠️ 결정 필요 — "익명 ON/OFF"의 의미
현재 토글은 서버에 존재하지 않으므로, 아래 중 하나로 **정의를 확정**해야 한다.

- **옵션 A (권장·단순): 마당은 상시 반익명.** 커뮤니티 정체성상 항상 가명. 오해 유발 토글은 **제거**하고, 대신 프로필/마이페이지에서 "내 활동명(가명)"을 안내만. 실명 노출 경로 없음 → §2 P0-2(authorId) 유출만 막으면 정책 일관.
- **옵션 B (실기능화): 게시물/댓글별 `isAnonymous` 서버 저장.** 토글 상태를 작성 API에 실어 저장하고, 서버가 `isAnonymous=true`면 가명·`false`면 실명 프로필을 응답. 자유도는 높으나 마스킹 분기·마이그레이션·정책 UX 부담 큼.
- **옵션 C: 실명 커뮤니티 + 특정 표면만 익명.** 마당은 실명, 챌린지 인증/보드만 익명. 브랜딩("반익명") 재검토 필요.

> 권장: **옵션 A**. 최소 변경으로 정책 일관성과 신원 보호를 동시에 달성. (아래 개선안은 A 기준으로 기술하되 B 확장 지점 표기.)

### 3.3 통일 익명 신원 설계(스킴 A 확장)
- 모든 커뮤니티 표면(마당 댓글·게시물·보드·인증 댓글)에서 **동일 함수**로 가명 생성.
- 스코프 키: 마당은 `plazaPostId`(또는 전역), 챌린지 표면은 `challengeId`. 사용자에게 **표면 내 일관 + 표면 간 비연결**.
- `ANON_ID_SALT`를 **정식 시크릿으로 provision**(VAPID와 동일 패턴).

---

## 4. 개선 제안 (우선순위·작업량)

### P0 — 즉시(운영 장애·유출)

**P0-1. `ANON_ID_SALT` 시크릿 신설 + social-api 주입**
- `stateful-stack.ts`에 `${prefix}/anon-id-salt` 시크릿 셸 추가(vapid와 동일 패턴).
- `api-stack.ts` social-api env에 `ANON_ID_SALT_SECRET_NAME` 주입 + `grantRead`. Lambda는 콜드스타트 1회 로드·캐시(현재 `anonSaltFromEnv`를 시크릿 로더로 확장, VAPID 로더 재사용).
- 주입 스크립트 추가(`scripts/ops/set-anon-salt.mjs`, `npm run ops:set-anon-salt`) — 32바이트 랜덤 생성·주입.
- 폴백 정책 통일: 보드도 인증과 동일하게 처리하거나(둘 다 500 또는 둘 다 안전 폴백) — **권장: 솔트 필수화 후 둘 다 500 제거**(정상 주입 전제).
- 작업량: **S~M** (인프라 1 + 로더 1 + 스크립트 1).

**P0-2. 마당 게시물 `authorId` 유출 차단**
- `sanitizePost`(`plaza-view.ts`)에서 `authorId` 제거(옵션 A). 작성자 본인 식별이 필요하면 **인증 엔드포인트에서만** `isMine` 계산해 노출.
- 저장 자체는 유지(운영/신고 추적용) 하되 **퍼블릭 응답에서 제거**.
- 작업량: **S** (1파일 + 테스트).

### P1 — 단기(핵심 UX)

**P1-1. 익명 토글 정리(옵션 A 기준)**
- 오해 유발 `AnonymousModeBanner` ON/OFF **제거** 또는 "내 활동명 안내" 배너로 축소. `CommentSection`의 라벨은 **서버 아이콘/가명 단일 소스**로 통일(localStorage 분기 삭제).
- (옵션 B 채택 시) 대신 작성 API에 `isAnonymous` 추가 + 서버 마스킹 분기 — 별도 에픽.
- 작업량: A=**S**, B=**L**.

**P1-2. 마당 댓글 인증 목록 + `isMine` 정상화**
- 인증 목록 엔드포인트 `GET /s/plaza/:id/comments` 추가(클레임으로 `isMine` 계산). 프론트는 로그인 시 인증 경로, 비로그인 시 퍼블릭 경로 사용.
- 死 401 분기 제거(`usePlazaComments.ts:87`).
- 작업량: **M**.

**P1-3. 마당 댓글 삭제**
- `DELETE /s/plaza/:id/comments/:commentId`(본인만) 추가 + `commentCount -1`. 프론트 삭제 액션.
- 작업량: **M**.

### P2 — 완성도

- **P2-1. `commentCount` 정합성:** 작성+증분을 `TransactWrite`로 원자화, 또는 주기적 재계산(likeCount처럼 `begins_with(CMT#)` COUNT). 작업량 **S~M**.
- **P2-2. 마당 댓글 가명 강화:** 스킴 B → 스킴 A 통일(16×900·솔트). 작업량 **S**.
- **P2-3. 종료 후 reveal 구현:** `createPersistentAnonymousId` + `isRevealed`/`isLeader` 실제 판정(보드·인증). 작업량 **M~L**.
- **P2-4. 잔여:** 댓글 작성 멱등(조건식/클라이언트 토큰), 리액션 상태 정확 반환, (선택) 댓글 수정·대댓글·댓글반응. 작업량 **S~M**.

---

## 5. 데이터 모델 영향
- **추가 저장 없음**(P0-2는 응답 필터만, `authorId`는 계속 저장). 
- 삭제(P1-3)·트랜잭션(P2-1)은 기존 `POST#/CMT#` 파티션 내 연산 — 스키마 변경 없음.
- 스킴 통일(P2-2)은 **신규 댓글부터** 적용(과거 아이콘은 그대로 표시) — 마이그레이션 불요.
- `ANON_ID_SALT`(P0-1)는 **한 번 정하면 고정**(변경 시 과거 가명이 전부 바뀌므로 회전 금지 원칙 명시).

---

## 6. 권장 실행 순서
1. **P0-1 + P0-2** (운영 장애·유출 즉시 차단) — 이번 배포에 포함 권장.
2. **§3.2 익명 정책 확정**(옵션 A/B/C 결정) — 이후 작업의 분기점.
3. **P1-1~P1-3** (토글 정리 · 인증 목록/isMine · 삭제).
4. **P2** 완성도 순차.

---

## 부록 A. 핵심 근거(파일:라인)
- 토글 비기능: `AnonymousModeBanner.tsx:29-37`, `FeedPage.tsx:224-230`, `plazaApi.ts:141-144`(플래그 없음)
- authorId 유출: `routes/plaza.ts:205`, `plaza-view.ts:44-60`(authorId 미제거), `repo/shared.ts:5`
- 마당 댓글 마스킹/약한 아이콘: `routes/plaza.ts:53-61,237`, `plaza-view.ts:63-68`
- 솔트 스킴: `domain/anonymous-id.ts:31-58`
- 보드/인증 마스킹·미구현 reveal: `routes/board.ts:139,141-161,180-182`, `routes/challenge-feed.ts:40-47,59-64`
- salt 미주입: `infra2/stacks/api-stack.ts:155-163`(env에 ANON_ID_SALT 없음), 인프라 전반 미참조
- 마당 댓글 라우트(정상): `routes/plaza.ts:148`(목록)·`230`(작성), 데이터 `repo/plaza.ts:84,109-123`
