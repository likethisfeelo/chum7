# plaza-converter 이식 기록 (PORTING.md)

레거시 `backend/services/plaza/convert-verifications` (EventBridge 매 1시간 — `infra/stacks/verification-stack.ts` PlazaConvertRule)
→ 신규 `services/workers/plaza-converter` (plain Lambda handler, 오케스트레이터가 시간별 배선).

테이블·권한 (이전 가이드 §4 워커 예외): **challenges R(+변환 마커 W) + social W**.
env: `CHALLENGES_TABLE`, `SOCIAL_TABLE` (+옵션 `PLAZA_CONVERT_LOOKBACK_HOURS`, 기본 26).
레거시의 VERIFICATIONS_TABLE/PLAZA_POSTS_TABLE(+HASHTAGS_TABLE)은 challenges/social 단일 테이블로 흡수.

## 1. 동작 매핑 (레거시 → 신규)

| 레거시 | 신규 | 비고 |
|---|---|---|
| `isPublic-createdAt-index` 전체 페이지네이션 (isPublic='true' 파티션을 1970부터 매회 전량 재순회) | gsi2 `VFPUB#<KST 오늘>` + `VFPUB#<KST 어제>` Query, `gsi2sk(createdAt) > high-water mark` | 파티션은 공개 인증만 키가 기록되는 sparse GSI(challenge-api verificationKeys 계약). 어제 파티션은 KST 자정 경계 시간대의 미변환분 커버. high-water mark = `now - lookbackHours`(기본 26h) — 시간별 실행 전제로 이전 실행이 이미 처리한 구간 재조회를 차단 |
| `item.type !== 'normal'` 스킵 | `decideConvert` 동일 (extra/remedy 등 제외) | |
| `item.isConvertedToPlaza === true` 스킵 | 변환 마커 속성 **`plazaConvertedAt`** 존재 시 스킵 | 마커 속성명 변경(지시 사양). 신규 테이블에는 레거시 isConvertedToPlaza 데이터가 없으므로 하위 호환 불필요 |
| `resolvePlazaFallbackContent` (todayNote → tomorrowPromise → "Day n 인증을 완료했어요." → 기본문구) | 사본 — `src/domain/convert.ts` (동작 변경 금지) | |
| 게시물 Put (`plazaPostId = courtyard-<verificationId>`, ConditionExpression attribute_not_exists) | `buildPlazaPostItem` → social `POST#courtyard-<vid>`/`META` + gsi1 `FEED#courtyard`/`<createdAt>` (+hashtag 시 gsi2 `TAG#<tag>`) 조건부 Put `attribute_not_exists(pk)` | **아이템 필드는 services/social-api/PORTING.md §4 계약 그대로** (repo/plaza.buildPostKeys 키 규칙). 차이 1건: `likeCount`는 레거시 `item.likeCount` 승계가 아니라 **0 고정** — 신규 social 테이블은 RCT# 재계산으로 likeCount를 유지하므로 계약이 0 시작을 지정 |
| 변환 후 verification `isConvertedToPlaza/convertedToPlazaAt` Update | verification 아이템(pk/sk 자연 키)에 `plazaConvertedAt` 기록 — **게시물 기록 성공 후** 갱신 | 레거시는 Put 실패(중복)여도 무조건 마킹 — 신규는 중복(ConditionalCheckFailedException)도 이미 존재 확인이므로 동일하게 마킹, 그 외 실패 시 마킹하지 않아 다음 주기에 재시도 |
| (레거시 워커에 없음 — verification/submit이 HASHTAGS_TABLE 기록) | hashtag 있으면 `TAG#<tag>`/`META` 레지스트리 유지 (최초 등록자+동물아이콘, postCount 증분) | social-api PORTING.md §1-E·§4 지시: courtyard 변환 시 레지스트리를 워커가 유지. 아이템·증분 로직은 social repo/hashtags.registerHashtag와 동일, 아이콘 시드는 레거시 submit의 문자합 mod 8 |

## 2. 의도적 미이식·차이 (deviations)

1. **레거시 진단 카운터 축소**: `skipNoTodayNoteCount`(항상 0인 대시보드 호환 필드)·
   fallback source별 카운터 3종은 폐기 — 신규 요약 로그는
   scanned/converted/skipType/skipAlreadyConverted/conditionalDuplicate/failed.
2. **전량 재순회 → 윈도우 조회**: 레거시는 매회 공개 인증 전체를 다시 읽었다(1970-부터).
   신규는 KST 오늘+어제 파티션 × high-water mark 만 조회 — 그보다 오래된 미변환 공개 인증은
   대상에서 제외된다(시간별 실행이 보장되는 한 발생하지 않음; 장기 중단 후 재가동 시
   `PLAZA_CONVERT_LOOKBACK_HOURS`를 늘려 1회 보정 가능).
3. **per-item 오류 격리**: 레거시는 아이템 1건 오류로 전체 잡이 실패(throw) — 신규는 해당
   인증만 failed 집계 후 계속 진행. 마커 미기록으로 다음 주기에 자동 재시도된다.
4. **likeCount 0 고정** (§1 표 참조 — social 계약).
5. **어드민 run-now 표면 없음**: 레거시 `admin/plaza/convert-run-now`는 admin-api 소관
   (social-api PORTING.md §1-A 미이식 항목과 동일 결정).

## 3. 순수 로직·테스트

| 모듈 | 출처 | 테스트 |
|---|---|---|
| `domain/convert.ts` | `resolvePlazaFallbackContent` = backend/shared/lib/plaza-convert-content.ts 사본 / `buildPlazaPostItem` = social-api PORTING.md §4 계약 / `kstDateString` = gamification world-summary 동일 계산 / `animalIconFor`·레지스트리 아이템 = 레거시 submit + social repo/hashtags | `convert.test.ts` — 윈도우(KST 경계·워터마크), 스킵 판정, 아이템 전체 형태(키·sparse gsi2·폴백 체인·미디어/제목/createdAt 폴백), 레지스트리 아이템 |

검증: `npx tsc -p services/workers/plaza-converter` ✅ /
`npx jest --testPathPattern "services/workers/plaza-converter"` ✅.
