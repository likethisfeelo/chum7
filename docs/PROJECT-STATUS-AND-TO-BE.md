# chum7 (CHME) — 프로젝트 현황 및 TO-BE 정리

> 작성: 2026-08 · 범위: 제품 전반(기능)·시스템 아키텍처·리빌드(마이그레이션) 현황·알려진 공백·개선 로드맵.
> 이 문서는 "지금 무엇이 있고(As-Is), 무엇을 향해 가야 하는가(To-Be)"를 한눈에 보기 위한 상위 요약이다.
> 세부 스펙은 `docs/core-specs/*`, 도메인별 `services/*/PORTING.md`, 루트 `PRODUCT_SPEC.md`/`REDESIGN_PLAN.md` 참조.

---

## 0. 한 줄 요약

**CHME(Challenge Earth with ME, chum7)** = *7일 챌린지 습관형성 소셜앱* + *리더가 유료 챌린지를 운영하는 크리에이터 플랫폼*.
현재는 **레거시(backend/ + infra/) → 신규(services/ + infra2/) 그린필드 리빌드**의 중반. 신규 스택은 아직 **프로덕션 미배포**(DNS 컷오버 예정). 핵심 소셜/챌린지 도메인은 이식 완료됐고, **알림·유료결제(PG)·권한 강제·집계**가 v1 스텁으로 남아 있는 상태.

---

## 1. 제품 개요

| 축 | 내용 |
|---|---|
| 정체성 | 7일 챌린지 기반 습관형성 + 또래 **응원(cheer)** 동기부여 + 리더 **유료 챌린지** 수익화 |
| 사용자 도메인 | `www.chum7.com` (PWA, 모바일 우선, 웹푸시) |
| 운영 콘솔 | `admin.chum7.com` (별도 SPA) |
| 핵심 루프 | 챌린지 참여 → 매일 **퀘스트 인증** → 공개 인증이 **마당(광장)** 에 노출 → **응원** 주고받기 → 완주 시 **뱃지/캐릭터** 성장 |
| 반익명 | 마당·피드는 실명 대신 일일 익명명(16동물+해시). 남의 프로필은 **초대링크/핸들**로만 도달 |

**용어 사전(요약)**

| 용어 | 뜻 |
|---|---|
| 챌린지 | 기간(기본7일)·카테고리·목표시간을 가진 실천 프로그램. 완성축(`challengeType`) × 가격축(`pricingType`) 2축 |
| 퀘스트 | 매일 과제. **리더 퀘스트**(리더 작성·심사) / **개인 퀘스트**(참여 시 자가설정, 신규 제안은 운영 심사) |
| 인증(Verification) | 매일 실천 증명(사진/글/링크/영상). 공개분은 마당으로 자동 변환 |
| 구제/보완 인증(Remedy) | Day6에 1~5일치 만회(점수 ×0.7) |
| 추가 인증(Extra) | 완주 후 잉여 기록, 기본 비공개 |
| 마당/광장(Plaza) | 서비스 전역 공개 소셜 피드(`/plaza`). 공개 인증이 매시 courtyard 포스트로 변환 |
| 응원(Cheer) | 또래의 실천 시각에 도착하도록 예약되는 격려(5분 주기 발송) — 동기부여 핵심 |
| 관심영역(Interest) | 8개 카테고리(건강/마음챙김/습관/관계/창작/자기계발/확장/임팩트) = "세계" 8층. + 챌린지 북마크 의미도 병용 |
| 리더/크리에이터 | 리더=무료 챌린지 운영자. 크리에이터=유료 판매 승인(Cognito `creators`) |
| 개인 프로필 피드 | `/@handle` 단일 공개 프로필(인증/챌린지/업적/자유 탭). 팔로우/친구/차단/초대 |
| 응원 점수/감사 점수 | `score`(완주일수) / `thankScore`(응원 감사) |
| 커머스 v0 | 쿠폰(`CHME-XXXX`) + 수기 계좌입금 확인(‑PG 이전 임시 운영) |

---

## 2. 시스템 아키텍처 (As-Is)

**원칙(REDESIGN_PLAN §3):** 비즈니스 로직은 `packages/core`, AWS는 가장자리에서만. 타입/이벤트는 `packages/contracts`로 통일. **머니(커머스)는 격리** — 커머스 테이블/시크릿은 commerce-api·settlement-worker만 접근, 나머지는 이벤트로만 연동. **풀스캔 금지**, Cognito 그룹 `admins/operators/creators` 통일. 목표: 122 Lambda→14 / 35 테이블→10 / 17 스택→6.

### 2.1 기술 스택
- **백엔드**: Node 20, **Hono** 4(HTTP) / plain Lambda(worker), AWS SDK v3, **zod**, Jest, esbuild, **CDK v2**. npm workspaces 모노레포.
- **프론트**: React 18 + Vite 5 + TS 5 + Tailwind 3, **@tanstack/react-query v5**, zustand(persist), axios, framer-motion, date-fns, TipTap(리치텍스트), **vite-plugin-pwa**(웹푸시). WS 채팅.
- **admin-frontend**: 동일 스택 경량판(zustand/framer/pwa 없음).

### 2.2 서비스 (HTTP 8 + WS 1)
| 서비스 | 프리픽스 | 역할 | 인증 |
|---|---|---|---|
| user-api | `/u` `/auth` `/public/users` | 유저·인증·프로필·알림·개인피드·친구·웹푸시 | `/u/*` requireAuth |
| challenge-api | `/c` `/public/challenges` `/public/users` | 챌린지·인증·퀘스트·참여·리더툴·관심·퀘스트제안 | `/c/*` requireAuth |
| social-api | `/s` `/public/plaza` `/public/board` `/public/hashtags` | 마당·챌린지보드·피드 상호작용·불레틴·해시태그·관심구독 | `/s/*` requireAuth (+plaza-admin 그룹게이트) |
| cheer-api | `/ch` | 응원 발송/목록/리액션/답장/감사, 예약응원, 유저 응원통계 | requireAuth |
| gamification-api | `/g` `/public/today` `/public/users` | 캐릭터·뱃지·세계·배너·오늘뷰 | `/g/*` requireAuth |
| commerce-api | `/pay` (`/pay/admin/*`) | 커머스 v0(쿠폰+수기입금) | requireAuth (+admin 그룹) |
| admin-api | `/adm` | 운영 콘솔 백엔드(교차도메인) | requireAuth + requireGroup(admins/operators/creators) |
| chat-api | (WebSocket) | 챌린지 그룹채팅 + 리더 1:1 DM | `$connect` 토큰 검증 |

### 2.3 워커 (6)
| 워커 | 트리거 | 역할 |
|---|---|---|
| notification-worker | 모든 `chme.*` 이벤트 | 인앱 알림 + 웹푸시, 번들링/레이트리밋, `challenge.recruiting` 관심구독 팬아웃 |
| interaction-projector | `chme.*` | 관계 원장(코멘트/리액션/응원/완주 → 유저쌍 상호작용) |
| cheer-scheduler | rate(5분) | 예약 응원 발송, `cheer.delivered` 발행, thankScore 적립 |
| lifecycle-manager | rate(10분) | 챌린지 생명주기 상태머신, 완주 판정, 캐릭터 슬롯/리더 뱃지, `challenge.completed` |
| plaza-converter | rate(1시간) + `verification.rejected` | 공개 인증 → 마당 포스트 변환, 해시태그 레지스트리 |
| settlement-worker | `challenge.completed` | 유료 챌린지 정산 v0(보증금 환불/몰수), `settlement.ready` |

### 2.4 데이터(테이블 10) — 컨텍스트별 단일테이블
users(1GSI) · challenges(2) · social(2) · graph(2) · cheer(2) · gamification(1) · content(1) · commerce(3) · ops(1) · chat(0, TTL).
공통 인프라: Cognito(그룹 3종 + Google/Kakao 소셜 IdP) · S3 uploads+CloudFront · Secrets(PG/VAPID/anon-salt/identity) · EventBridge 버스 · WS API · CloudWatch/SNS 알림.

### 2.5 공유 패키지
`@chum7/api-kit`(createApi·ok/fail·requireAuth·requireGroup·docClient·publishEvent) · `@chum7/contracts`(envelope·events 스키마) · `@chum7/core`(lifecycle·anonymous-id) · `@chum7/web-kit`(**placeholder**, Phase4 예정).

---

## 3. 기능 인벤토리 (As-Is) — 도메인별 상태

범례: ✅ 구현 · 🟡 부분/스텁 · 🔴 미구현/비활성

| 도메인 | 상태 | 비고 |
|---|---|---|
| 인증/계정 (이메일 가입·로그인·리셋) | ✅ | |
| 소셜 로그인 (Google/Kakao, Hosted UI OAuth) | ✅ | 이번 세션 추가. 시크릿 주입은 `ops:set-oauth` |
| 챌린지 CRUD·상세·참여 | ✅ | 3종 challengeType, 가격축 존재 |
| 퀘스트(리더/개인) + 제안 심사 | ✅ | |
| 인증 제출(사진/글/링크/영상 트리밍) + Remedy(Day6) + Extra | ✅ | |
| 인증 → 개인 프로필 피드 자동적재 | ✅ | 본인=전체 / 타인=공개만 (이번 세션 수정) |
| 마당(플라자) 피드 열람 + 댓글/좋아요/북마크 | ✅ | |
| 마당 상세 박스 + 이미지 라이트박스(스와이프) | ✅ | 이번 세션 추가 |
| 운영자 마당 직접 게시 + 관리(숨김/삭제) | ✅ | 이번 세션 추가 |
| 종료 챌린지 피드 참여자 전용 열람 | ✅ | 이번 세션 추가 |
| 챌린지 보드(불록 에디터) | 🟡 | OneNote형 드래그블록·코멘트 공개 전환은 백로그 |
| 챌린지 채팅(그룹) + 리더 1:1 DM | ✅ | 이번 세션 추가. DM 알림 없음 |
| 응원(예약 발송·감사·리액션) | ✅ | |
| 개인 프로필 피드 + 팔로우/차단/초대/핸들 | ✅ | 레이어 L-1~L4 모델. 정책: `core-specs/08` |
| 친구 모델 v2 (상호요청 자동친구) | 🔴 | `FRIENDS_ENABLED=false` (순차 출시 대기) |
| 관심영역 구독 + 모집 알림 팬아웃 | ✅ | 이번 세션 추가 |
| 알림(인앱) + 웹푸시(VAPID) | 🟡 | 인프라 O. 다수 이벤트 타입이 contracts 미정의라 **다수 알림 미발행**(§5) |
| 게이미피케이션(뱃지/캐릭터/세계/오늘) | 🟡 | 뱃지 grant는 lifecycle-manager 소관. world/achievements 일부 값 0 하드코딩 |
| 커머스(쿠폰 + 수기입금) | 🟡 | **v0** — PG/환불/`/hooks/pg` 미구현 (§5) |
| 정산(보증금 환불/몰수) | 🟡 | settlement v0, 커머스 Phase3에서 확장 |
| 운영 콘솔(챌린지/퀘스트/배너/응원/유저/감사/커머스) | ✅ | stats/user-list는 스캔 은퇴로 일부 null(§5) |

---

## 4. 이번 세션에서 반영한 것 (브랜치 `claude/quest-auth-korean-hashtag-go3dhy`)

1. **소셜 로그인** — Cognito Google/Kakao IdP + Hosted UI + `/auth/social/config` + `/u/bootstrap` 자동 프로필 + 프론트 팝업 OAuth/`/auth/callback`.
2. **챌린지 채팅** — chat 테이블(TTL) + WS API + chat-api($connect/sendMessage/history/read) + 프론트 그룹/DM UI.
3. **관심영역** — 구독 스토어 + 자동구독 + `challenge.recruiting` 다중수신 팬아웃 + 프론트 관심탭.
4. **종료 챌린지 피드** — 참여자/리더만 열람(프론트 게이트 + 백엔드 403).
5. **운영자 마당 게시** — `/s/plaza-admin/*`(작성/업로드/목록/숨김/삭제) + admin 페이지 + 사용자앱 "운영자" 배지.
6. **마당 상세/라이트박스** — 게시물 클릭 상세 박스, 이미지 클릭 전체화면(본문 오버레이·좌우 스와이프).
7. **개인 피드 소유자 전량** — `/c/verifications/me/profile-feed`(본인 비공개·추가 포함) + 프론트 분기·배지.
8. **정책 문서** — `docs/core-specs/08-personal-feed-visibility-policy.md`.

---

## 5. 알려진 공백·리스크 (통합)

출처: 각 `services/*/PORTING.md`, `core-specs/07-backlog.md`, `08`, `status-and-roadmap.md`.

| # | 심각도 | 영역 | 내용 |
|---|---|---|---|
| A1 | **높음** | 이벤트/알림 | `contracts`에 이벤트 타입 다수 누락 → **부수효과 미발행**: `verification.submitted`(자동응원·뱃지·완주보너스), `challenge.gave_up`(포기뱃지), `follow.accepted`·`feed.invite_link_used`(알림), lifecycle 7종 알림, DM 알림 |
| A2 | **높음(보안)** | 권한 강제 | social-api가 **런타임 참여/리더/생명주기 검증 생략**(교차조회 금지 회피, JWT 신뢰). 공유 authorizer(participant 클레임) 대기 |
| A3 | **높음(프라이버시)** | 공개 콘텐츠 API | `/public/users/:id/{verifications,challenge-history,achievements}`가 **차단/관계 무시** — 차단 유저도 URL로 공개분 직접 조회 가능 (`08` G1) |
| A4 | **높음** | 결제 | 커머스 **PG 미연동**(`/hooks/pg` 미구현), 환불 없음, 계좌정보 텍스트 노출, 금액 수기 검증 (커머스 v0 한계) |
| A5 | 중간 | 집계 | admin **stats/user-list 스캔 은퇴** → null/노트. 이벤트 카운터 materializer / ops GSI 필요 |
| A6 | 중간 | 게이미피케이션 | world-summary·achievements의 cheerScore/thankScore **0 하드코딩**(공개 스트림에서 유도 불가) |
| A7 | 중간 | 피드 정책 | 초대링크가 서버 레이어 미부여(L2 死), 낯선사람 posts 403 대신 빈목록 등 비일관 (`08` G2·G3·G5) |
| A8 | 중간 | 마당 성능 | 레거시 Scan → GSI+커서 페이지네이션 이관 미완(백로그 #2) — 대형 챌린지 피드는 드레인 상한 존재 |
| A9 | 낮음 | 스텁 | 플라자 추천 1건 축소, 링크 프리뷰 프리필 placeholder, 완주 후 안정익명 공개 비활성, 차단 시 팔로우 엣지 미삭제 |
| A10 | 낮음 | 배포 | 신규 스택 **프로덕션 미배포**. interaction-projector는 관계데이터 적재 전에 먼저 배포 필요. 미라우팅 `WorldPage`(레거시) |

**백로그(07) 미해결:** 보드 코멘트 공개전환 · 마당 GSI 전환 · 보드 블록에디터 · 유료 결제 플로우 · Remedy 확장 · `/quests` challengeType 조건부 · admin challengeType 변경.

---

## 6. TO-BE 로드맵 (제안)

우선순위는 **출시 차단요소 → 신뢰/수익 → 확장** 순. 각 항목에 위 공백번호 매핑.

### P0 — 출시 전 필수 (신규 스택 컷오버 차단요소)
1. **도메인 이벤트 계약 완성 + 부수효과 복원** (A1) — `contracts/events.ts`에 `verification.submitted`·`challenge.gave_up`·`follow.accepted`·`feed.invite_link_used`·lifecycle 알림·DM 이벤트 추가 → notification-worker에서 인앱/웹푸시 발행, 자동응원·뱃지·완주보너스 재연결. *알림 없는 소셜앱은 리텐션이 무너지므로 최우선.*
2. **권한 강제 일원화** (A2, A3) — 공유 authorizer에 **participant/leader 클레임** 주입 또는 각 도메인에 경량 참여검증 도입. 공개 콘텐츠 API에 **차단/관계 필터**(옵셔널 auth) 적용. *프라이버시·보안 최소선.*
3. **배포 파이프라인 + 컷오버 리허설** (A10) — infra2 스택 스테이징 배포, interaction-projector 선배포, DNS 컷오버 절차 검증.

### P1 — 출시 직후 (수익·신뢰)
4. **커머스 PG 연동** (A4) — `/hooks/pg` 웹훅, 자동 결제확인, 환불 정책, 정산 Phase3. 쿠폰/수기입금은 폴백 유지.
5. **집계 materializer** (A5, A6) — 이벤트 기반 카운터(STATS#/OPS GSI)로 admin stats·user-list, world/achievements 점수 실값화.
6. **개인 피드 정책 정합화** (A7) — 초대링크 서버 레이어 부여 여부 확정, posts 응답계약 통일, L2 경로 결정. (`08` 점검표 반영)
7. **친구 모델 v2 활성화** (`FRIENDS_ENABLED`) — 관계데이터 축적 후 on, 아카이브 stage E(`archiveFullContentEnabled`) 검토.

### P2 — 확장
8. **마당 성능/추천 고도화** (A8, A9) — GSI 전환·커서 페이지네이션, 추천 다건화, 완주 후 안정익명 공개.
9. **챌린지 보드 v2** — 블록 에디터(드래그·이미지+텍스트·헤더), 코멘트 공개전환.
10. **리더툴 v2** — 리마인더 발송·메시지 템플릿·시즌(기수) 클론.
11. **검색/온보딩/네이티브** — OpenSearch 검색, 온보딩 퍼널 튜닝, 네이티브앱(로드맵 PRODUCT_SPEC §8).

### 상시(교차)
- `@chum7/web-kit` 실체화(api-client·mediaUrl·lifecycle 표시 유틸 이동) — 프론트 중복 제거.
- 테스트/관측성 확대(도메인 단위테스트, CloudWatch 대시보드·알람 임계).

---

## 7. 부록 — 문서 맵

- 제품/리빌드: 루트 `PRODUCT_SPEC.md`, `REDESIGN_PLAN.md`, `PAYMENT_SPEC.md`, `README.md`
- 핵심 스펙: `docs/core-specs/01~08`, `07-backlog.md`
- 로드맵/상태: `docs/status-and-roadmap.md`, `docs/challenge-quest-v2-roadmap.md`, `docs/friend-model-v2.md`, `docs/MVP_AFTER_TODO.md`, `docs/p0-operational-risk-backlog.md`
- 도메인 이식 기록: `services/*/PORTING.md`, `services/commerce-api/COMMERCE_V0.md`
- ADR: `docs/adr-0001-challenge-quest-policy-baseline.md`

> 이 문서는 상위 요약이며 단일 진실원천이 아니다. 상충 시 각 도메인 스펙/PORTING.md가 우선한다.
