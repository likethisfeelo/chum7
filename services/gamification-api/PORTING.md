# gamification-api 이식 기록 (Phase 2)

레거시 `backend/services/{character,badge,today,category-banners}` → `services/gamification-api`
(Hono 통합 Lambda). 규칙: `docs/redesign-porting-guide.md`.

## 1. 핸들러 → 라우트 매핑

| 레거시 핸들러 | 레거시 경로 | 신규 라우트 | 비고 |
|---|---|---|---|
| `backend/services/character/status` | GET `/characters/me/status` | GET `/g/characters/me/status` | 응답 data 필드 동일 (`onboardingDone`·`activeMythology`·`activeCharacter`·`mythologyProgress`·`completedMythologies`·`themeOverride`) |
| `backend/services/character/start` | POST `/characters/me/start` | POST `/g/characters/me/start` | 409 `ALREADY_ONBOARDED`, 400 `INVALID_INPUT`(+details) 승계 |
| `backend/services/character/next` | POST `/characters/me/next` | POST `/g/characters/me/next` | 409 `CURRENT_CHARACTER_INCOMPLETE`, 403 `MYTHOLOGY_NOT_COMPLETED`, pendingSlotFills 소급 로직 승계 (`domain/character-slot.buildPendingSlotFill`) |
| `backend/services/character/collection` | GET `/characters/me/collection` | GET `/g/characters/me/collection` | `completed[]`(중복 보유 count 포함)/`inProgress[]` 형태 동일 |
| `backend/services/character/theme` | PUT `/characters/me/theme` | PUT `/g/characters/me/theme` | 403 `MYTHOLOGY_NOT_COMPLETED` 문구 유지, `data.themeOverride` 동일 |
| `backend/services/badge/list` | GET `/users/me/badges` | GET `/g/badges` | `data.badges[]`(누락 필드 null)·`data.total` 동일 |
| `backend/services/badge/grant` | (내부 호출) | **이식 안 함** — 뱃지 부여는 lifecycle-manager 워커 책임 (§3) |
| `backend/services/today/world-summary` | GET `/today/world-summary` | GET `/public/today/world-summary` | `data.layers[]`/`data.totals` 형태 동일, 집계 방식 변경 (§4) |
| `backend/services/category-banners/list` | GET `/category-banners` | GET `/public/banners` | 배너 항목 필드 동일. 선택 `?slug=` 필터 추가 (레거시는 파라미터 없음 — 미지정 시 레거시처럼 8개 전체) |

응답 envelope는 api-kit `ok`/`fail`을 사용한다. 레거시 category-banners는 `{ data }`만
반환했으나 신규는 표준 envelope에 따라 `{ success: true, data }` — `data` 필드는 동일하므로
추가 필드만 있는 하위 호환 변경. 레거시가 message 없이 error 코드만 내리던 실패 응답에는
envelope 규칙에 따라 한국어 message가 추가됐다 (error 코드·상태코드는 그대로).

## 2. 데이터 모델 마이그레이션 매핑

gamification 테이블 (env `GAMIFICATION_TABLE`, generic pk/sk + gsi1):

| 레거시 | 신규 |
|---|---|
| USERS_TABLE 필드 `activeMythology`/`activeCharacterId`/`onboardingDone`/`themeOverride`/`completedMythologies`/`pendingSlotFills` | pk=`USER#<userId>`, sk=`CHARACTER` (사용자 캐릭터 상태 아이템) |
| CHARACTERS_TABLE 아이템 (`characterId`,`mythologyLine`,`characterType`,`filledCount`,`slots[]`,`status`,`createdAt`,`completedAt`) | pk=`USER#<userId>`, sk=`CHAR#<characterId>` — "내 캐릭터" = pk Query + `begins_with(sk,'CHAR#')` (레거시 userId-index 대체, 풀스캔·GSI 불필요) |
| badges 테이블 (PK `badgeId` + SK `userId`, userId-index) | pk=`USER#<userId>`, sk=`BADGE#<badgeId>`, gsi1pk=`BADGE#<badgeId>`, gsi1sk=`<grantedAt>` — 목록 = pk Query + `begins_with(sk,'BADGE#')` |
| CATEGORY_BANNERS_TABLE (slug-isActive-index) | content 테이블 (env `CONTENT_TABLE`): pk=`BANNER#<slug>`, sk=`<bannerId>`, 활성 배너만 gsi1pk=`BANNERACTIVE#<slug>`, gsi1sk=`<sortOrder>` (sparse GSI, Limit 1 조회) |

주의:
- 뱃지 목록 정렬: 레거시는 GSI `ScanIndexForward:false`, 신규 sk(`BADGE#<badgeId>`)는 시간순이
  아니므로 `domain/views.toBadgeListView`가 `grantedAt` 내림차순 정렬로 최신순을 보장한다.
- 캐릭터 인스턴스 pk가 사용자 파티션이므로 캐릭터 조회에는 항상 userId가 필요하다
  (레거시 characterId 단독 GetItem → userId+characterId GetItem). 라우트는 모두 본인 것만 다룬다.
- `character/next`에서 사용자 상태 아이템이 없으면 레거시 `USER_NOT_FOUND`(404)로 매핑.

## 3. 뱃지 부여는 lifecycle-manager 워커에 남는다

`backend/services/badge/grant` + `backend/shared/lib/{badge,badge-grant,leader-badge-grant,character-slot}`의
**쓰기 경로**(인증 뱃지 부여, 리더 뱃지 부여, 슬롯 채우기, 세계관 완성 전환)는 이 API로 이식하지
않았다. 챌린지 lifecycle 전환·인증 제출 시점에 lifecycle-manager 워커(challenges RW +
gamification W, 가이드 §4)가 이 서비스의 순수 판정 로직을 사용해 수행한다:

- `src/domain/badge-grant.ts` — `evaluateBadgeIds`/`buildBadgeGrantItems`/`buildSpecificBadgeItem`
  (중복 부여 방지: `attribute_not_exists(pk)` 조건부 Put)
- `src/domain/leader-badge-grant.ts` — `evaluateLeaderBadgeIds`/`buildLeaderBadgeNotifications`
- `src/domain/character-slot.ts` — `decideSlotFill`/`isMythologyCompleted`/알림 페이로드

알림은 레거시 `notification.ts` 직접 기록 대신 워커가 `publishEvent`로 발행한다.

## 4. world-summary 집계 방식 변경

레거시는 로그인 사용자의 userChallenges 전체 + challenges BatchGet + 당일 verifications를
합산하는 **개인화** 집계였다. 신규는 PRODUCT_SPEC v2에 따라 **퍼블릭** 엔드포인트이며,
challenges 테이블 gsi2(`VFPUB#<KST YYYY-MM-DD>` — 당일 공개 인증, 읽기 전용 크로스 도메인
예외 §4)만 Query해 `domain/world-summary.aggregateWorldSummary`로 집계한다.

- 응답 형태(`layers[]` 8층: `category`/`floor`/`label`/`questScore`/`cheerScore`/`thankScore`/`todayQuestDelta`, `totals`)는 유지.
- `todayQuestDelta` = 당일 score=1 인증 수, `questScore` = min(100, delta) — 레거시 상한 유지.
- `cheerScore`/`thankScore`는 공개 인증 스트림에서 파생 불가 → 0 고정 (필드 형태만 보존).
- KST 계산(UTC+9 고정)은 레거시 `getKstTodayRange` 정책 승계 (`kstDateString`).

## 5. 미이식 항목

| 항목 | 사유 |
|---|---|
| `badge/grant` 핸들러 | 내부 쓰기 경로 — lifecycle-manager 워커로 이동 (§3) |
| world-summary의 개인화 누적 점수 | 퍼블릭 전환으로 폐기, 당일 공개 인증 집계로 대체 (§4) |
| 레거시 경로 하위 호환 (`/characters/*`, `/users/me/badges`, `/category-banners`) | 프론트가 contracts `API_PREFIXES` 상수로 일괄 전환 예정 (가이드 §6) — 응답 바디만 유지 |

## 6. 검증

- `npx tsc -p services/gamification-api` 통과
- `npx jest --silent --testPathPattern "services/gamification-api"` 통과
  (`src/domain/views.test.ts` — 뱃지 목록 매핑/정렬, 세계관 진행, 컬렉션 집계, 다음 캐릭터 선택)
