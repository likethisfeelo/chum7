# challenge-api 이식 기록 (PORTING.md)

레거시 `backend/services/{challenge,verification,quest}` → 신규 `services/challenge-api` (Hono 통합 Lambda).
테이블: **challenges 단일** (env `CHALLENGES_TABLE`, generic pk/sk + gsi1/gsi2 — 이전 가이드 §3).
프리픽스: 보호 `/c/*`, 퍼블릭 `/public/challenges...` (contracts `API_PREFIXES`).

## 1. 라우트 매핑표 (레거시 → 신규)

### A. 챌린지

| 레거시 핸들러 | 레거시 라우트 | 신규 라우트 | 비고 |
|---|---|---|---|
| challenge/list | GET /challenges | **GET /public/challenges** | **Scan → gsi1 Query 재작성** (`gsi1pk=LC#<lifecycle>#CAT#<category>`, `gsi1sk=challengeStartAt`). lifecycle 필터 기본값 `recruiting,active`(콤마 구분 다중 허용), category 필터, 정렬 `recent`(=latest)/`deadline`(gsi1sk)/`popular`(v1: 조회 페이지의 `participantCount` 인메모리 정렬). 레거시 `completion` 정렬은 폐기(스캔 전제) — popular로 폴백. 응답 바디 `{ challenges, total, filters }` 유지 |
| challenge/detail | GET /challenges/{id} | **GET /public/challenges/:challengeId** | 동일 바디 (내부 키 속성 제거 후 반환) |
| challenge/stats | GET /challenges/{id}/stats | **GET /public/challenges/:challengeId/stats** | 참여자 = pk 파티션 `UC#` Query. Day별 완료율 7일 고정 등 계산 로직 그대로 |
| challenge/create | POST /challenges/me/create | **POST /c/challenges** | 사용자 생성 경로 이식(어드민 생성은 admin-api). `resolvePersonalQuestEnabled`/`resolveLayerPolicy` → `src/domain/join-requirements.ts` (docs/core-specs/01 규칙). 항상 draft 시작. `participateAsCreator` 시 UC 아이템 생성 |
| challenge/update | PATCH /challenges/{id} | **PATCH /c/challenges/:challengeId** | draft/recruiting만. challengeStartAt 수정 시 gsi1sk 동기 갱신 |
| challenge/publish | PATCH /challenges/{id}/publish | **PATCH /c/challenges/:challengeId/publish** | 전이는 `@chum7/core` `canTransition`(draft→recruiting)으로 검증. gsi1pk lifecycle 동기 갱신 |
| challenge/my-created | GET /challenges/me/created | **GET /c/challenges/my-created** | createdBy-index → gsi2 `CREATOR#<userId>` Query |
| challenge/join | POST /challenges/{id}/join | **POST /c/challenges/:challengeId/join** | join-wizard 요구사항(`shared/join-requirements` + layerPolicy) → `src/domain/join-requirements.ts` + 테스트. 중복 참여 검사 = (challengeId,userId) 자연 키 Get (failed면 재참여 허용 — 레거시 의미 승계). stats + `participantCount`(탐색 인기 정렬용 신규 top-level 속성) 증분 |
| challenge/my-challenges | GET /challenges/my | **GET /c/challenges/my** | userId-index → gsi1 `UCUSER#<userId>` Query. 상태 정규화(`challenge-state.ts`)·진행률 enrichment 로직 그대로. `?debug=` 지원은 폐기(운영 표면은 admin-api) |
| challenge/list-join-requests | GET /challenges/{id}/join-requests | **GET /c/challenges/:challengeId/join-requests** | 리더 전용. 레거시 비-envelope 플랫 바디 `{ requests, total }` 유지 |
| challenge/review-join-request | POST /challenges/{id}/join-requests/{ucId}/review | **POST /c/challenges/:challengeId/join-requests/:userChallengeId/review** | approve/reject + pending 조건부 갱신 + stats 증감. kpi-event 구조화 로그 유지 |
| challenge/give-up (verification-stack 배선) | POST /user-challenges/{ucId}/give-up | **POST /c/user-challenges/:userChallengeId/give-up** | 본인 gsi1 파티션 조회라 레거시 FORBIDDEN(타인 UC) 케이스는 404로 흡수. **"포기는쉽다" 뱃지 부여는 gamification 소유 — 미이식 (gap ①)** |

### B. 인증(verification)

| 레거시 핸들러 | 레거시 라우트 | 신규 라우트 | 비고 |
|---|---|---|---|
| verification/submit | POST /verifications | **POST /c/verifications** | 핵심 핸들러. day 윈도우(서버 계산 day ±1)·performedAt(사용자 입력, 당일만·미래 금지, 60초 시계편차 허용)/uploadAt(서버) 정책·challengeType 기반 isDayComplete/isExtra/partial(혼합형 questType 플로우)·progress 배열 업데이트 모두 이식. 순수 로직은 `src/domain/{day-sync,verification-rules,progress}.ts`. **공개 인증이면 gsi2pk=`VFPUB#<KST YYYY-MM-DD>`/gsi2sk=createdAt 기록** (plaza-converter·world-summary 계약). 미이식 부속 기능은 §3 gap 참고 |
| verification/list | GET /verifications | **GET /c/verifications** | mine 모드 → gsi1 `VFUSER#` Query, public 모드 → gsi2 `VFPUB#<KST date>` Query(`?date=` 지정 가능, 기본 오늘). **레거시 Scan 폴백 모드는 풀스캔 금지로 제거 — 무파라미터 호출은 mine으로 동작**. `toRenderableMediaUrl`(media-key 재서명 정책) 이식. nextToken(base64 LastEvaluatedKey) 유지 |
| verification/get | GET /verifications/{id} | **GET /c/verifications/:verificationId** | 신규 키에서 verificationId 단독 GetItem 불가 → 본인 gsi1 파티션 Query+필터. 레거시는 소유권 검사 없이 아무 인증이나 반환했으나 신규는 **본인 인증만** (타 사용자 공개 인증 열람은 social/피드 표면 소관) |
| verification/upload-url | POST /verifications/upload-url | **POST /c/verifications/upload-url** | `@aws-sdk/client-s3` + `s3-request-presigner` presigned PUT, env `UPLOADS_BUCKET`. **키 패턴 신규: `uploads/<userId>/<uuid>.<ext>`** (레거시 `uploads/<userId>/<challengeId>/<ts>-<rand>.<ext>`) — challengeId는 S3 메타데이터로만 유지 |
| verification/remedy | POST /verifications/remedy | **POST /c/verifications/remedy** | 정책(anytime/last_day/disabled)·`effectiveCurrentDay = max(stored, calendar)` 판정·`remedyScore`(×0.7, 최소 1)·progress `status:'success', remedied:true` 마킹 그대로. 스펙 20260321-remedy-policy: last_day = 마지막 날 전용, 대상 Day 1..durationDays-1 (7일 챌린지 기준 "Day 6에 Day 1–5 보완") |
| verification/visibility | PATCH /verifications/{id}/visibility | **PATCH /c/verifications/:verificationId/visibility** | extra 전용 공개 전환. 전환 시 gsi2 `VFPUB#` 키 추가 기록(공개 피드 노출) |
| verification/performed-at | PATCH /verifications/{id}/performed-at | **PATCH /c/verifications/:verificationId/performed-at** | 미래 금지 + 챌린지 기간 내 검사 동일 |
| verification/link-preview | GET /verifications/link-preview | — | **미이식**: 외부 URL 프리뷰 프록시(도메인 데이터 무관). 필요 시 별도 유틸 Lambda/프론트 처리로 재설계 — v1 범위 밖 |
| verification/media-validation | (S3 ObjectCreated 워커) | — | **미이식**: API가 아닌 S3 이벤트 워커 — 워커 단계(오케스트레이터 배선)에서 이식 |

### C. 퀘스트 (유저 사이드)

| 레거시 핸들러 | 레거시 라우트 | 신규 라우트 | 비고 |
|---|---|---|---|
| quest/list | GET /quests?challengeId=&status= | **GET /c/:challengeId/quests** | pk 파티션 `QUEST#` Query. status/기간/personal-scope 필터 + displayOrder 정렬 + `mySubmission`(ACTIVE 마커) enrichment 그대로. **challengeId-미지정 전체 조회(status-index)는 폐기** — 신규 API는 챌린지 스코프 고정 |
| quest/submit | POST /quests/{questId}/submit | **POST /c/:challengeId/quests/:questId/submit** | 2-테이블 패턴 → 단일 테이블: 이력 아이템 `QSUB#<questId>#<userId>#<ts>`(gsi1 `QSUBUSER#`) + **ACTIVE 마커 `QSUB#<questId>#<userId>#ACTIVE` 조건부 put**(attribute_not_exists OR status=rejected)으로 user+quest당 활성 제출 1건 보장. TransactWrite(이력+마커+submissionCount) 유지. 409 `ALREADY_SUBMITTED` 바디 동일 |
| quest/my-submissions | GET /quests/my-submissions | **GET /c/:challengeId/quests/my-submissions** | gsi1 `QSUBUSER#` Query. includeHistory/current 모드·재제출 체인(attemptNumber 정렬)·quest enrichment 유지. 챌린지 스코프 고정(경로 param) |
| quest/create·update·approve·admin-list | /admin/quests... | — | **미이식**: 어드민 리뷰/생성은 admin-api 소관 (범위 명시 제외). rejected 시 ACTIVE 마커 상태를 'rejected'로 갱신하는 책임은 admin-api 이식 시 반영 필요 |

### D. 리더 운영 도구 v1 (신규 표면)

| 신규 라우트 | 내용 |
|---|---|
| **GET /c/:challengeId/leader/briefing** | 오늘 인증률 n/m(활성 참여자 UC# progress + challengeType 완료 판정) + 미인증자 목록 + 대기 퀘스트 제출물 수(QSUB# ACTIVE·pending 집계). 오늘 day는 `@chum7/core` `calendarDay` 캘린더 계산 |
| **GET /c/:challengeId/leader/participants** | 참여자 목록 + 진행률(completedDays/progressPercentage/effectiveCurrentDay) |
| TODO (v2) | **리마인드 발송**(미인증자 대상 — notification 이벤트 계약 필요), **메시지 템플릿**(`LEADER#template#<key>` 아이템 예약), **시즌 복제**(챌린지 복제 + 일정 시프트). 이번 이식에서는 스킵 |

### E. 명시적 미이식 (레거시 기능 폐기/타 도메인 이관)

| 레거시 | 사유 |
|---|---|
| challenge/request-refund, review-refund, review-payout, finalize-payout | **commerce Phase 3가 대체** (보증금/정산/환불). 이식 금지 항목 |
| challenge/lifecycle-manager (EventBridge 스케줄) | 워커(lifecycle-manager) 소관 — `@chum7/core` `resolveDueLifecycle` 사용 예정. API 이식 범위 밖 |
| challenge/advance-lifecycle (수동 전환) | lifecycle-manager 워커·admin-api 표면과 함께 재설계 예정. 상태 전이 규칙은 `@chum7/core` `canTransition`으로 이미 고정 |
| challenge/personal-quest (submit/my/revise) | 개인퀘스트 제안 플로우는 별도 티켓(PERSONAL_QUEST_PROPOSALS_TABLE 폐기, challenges 테이블 재설계 필요). v1 범위 밖 |
| notification/list, mark-read (challenge-stack에 배선돼 있었음) | user-api 도메인(인앱 알림 `USER#<id>`/`NOTIF#...`) 소관 |
| category-banners/list (challenge-stack 배선) | content 테이블 — gamification-api가 이미 담당 (`BANNERACTIVE#` sparse GSI) |
| plaza/* (verification-stack 배선) | social 도메인 소관 |
| verification submit 내 해쉬태그 레지스트리 기록 (HASHTAGS_TABLE) | social 도메인 소관 — 이관 필요 (gap ③) |

## 2. 키 설계 요약 (이전 가이드 §3 준수)

| 엔티티 | pk | sk | GSI |
|---|---|---|---|
| 챌린지 | `CHAL#<id>` | `META` | gsi1: `LC#<lifecycle>#CAT#<category>` / `<challengeStartAt>` · gsi2: `CREATOR#<userId>` / `<createdAt>` |
| 참여 | `CHAL#<id>` | `UC#<userId>` | gsi1: `UCUSER#<userId>` / `<createdAt>` |
| 인증 | `CHAL#<id>` | `VF#<userId>#D<dd>#<verificationId>` | gsi1: `VFUSER#<userId>` / `<createdAt>` · 공개만 gsi2: `VFPUB#<KST YYYY-MM-DD>` / `<createdAt>` |
| 퀘스트 | `CHAL#<id>` | `QUEST#<questId>` | — |
| 퀘스트 제출(이력) | `CHAL#<id>` | `QSUB#<questId>#<userId>#<ts>` | gsi1: `QSUBUSER#<userId>` / `<createdAt>` |
| 퀘스트 제출(ACTIVE 마커) | `CHAL#<id>` | `QSUB#<questId>#<userId>#ACTIVE` | — (조건부 put 유니크 보장, `recordType='active'`) |

- `userChallengeId`/`verificationId`는 속성으로 유지(응답 계약) — 신규 조회는 파티션 Query 경유.
- `participantCount`: 탐색 인기 정렬(v1 인메모리)용 top-level 속성 — join/승인 시 `stats.totalParticipants`와 함께 증분.

## 3. 기록된 gap (후속 티켓 필요)

1. **`verification.submitted` 이벤트 타입 부재 (contracts)** — 레거시 submit이 직접 수행하던 ① auto-cheer 생성/응원권/cheerScore·thankScore 적립(cheer-api 소유), ② 뱃지 부여 `grantBadges`(gamification 소유), ③ 전원 완료 보너스는 이벤트 구독으로 대체해야 하나 contracts에 `verification.submitted`가 없어 **발행하지 않음**. contracts에 이벤트 타입 추가 후 submit에서 발행하도록 후속 작업. 현재 submit 응답은 계약 유지를 위해 `newBadges: []`, `eligibleCheerIds: []`, `cheerOpportunity.cheerTicketGranted: false`(집계 수치는 자체 테이블 UC#로 계산)를 반환.
2. **give-up "포기는쉽다" 뱃지** — gamification 소유. `challenge.gave_up` 유사 이벤트 계약 필요 (contracts 부재 → 미발행).
3. **해쉬태그 레지스트리** — submit의 HASHTAGS_TABLE 기록은 social 도메인으로 이관 필요 (이벤트 또는 social-api 표면). `hashtag` 속성은 인증 아이템에 계속 저장됨.
4. **quest rejected → ACTIVE 마커 갱신** — 어드민 리뷰(admin-api) 이식 시 마커 status='rejected' 갱신(또는 삭제 대체) 반영 필요. 조건부 put은 rejected 마커 덮어쓰기를 허용하도록 이미 구현.
5. **publishEvent('challenge.completed')** — lifecycle-manager 워커 책임 (이 API는 발행하지 않음).

## 4. 순수 로직/테스트 이식 (`src/domain/`)

| 신규 모듈 | 원본 | 테스트 |
|---|---|---|
| day-sync.ts | backend/shared/lib/challenge-day-sync.ts + challenge-quest-policy.ts | day-sync.test.ts ← test/backend/challenge-day-sync.test.ts (assertion 유지) |
| verification-rules.ts | backend/shared/lib/{verification-type,verification-normalization,trim-validation}.ts + submit 핸들러 판정 블록 추출 | verification-rules.test.ts ← test/backend/{verification-submit-infer-type,verification-normalization}.test.ts (assertion 유지) + 혼합형 partial/isExtra 신규 테스트 |
| progress.ts | backend/shared/lib/progress.ts | progress.test.ts ← test/backend/progress-normalization.test.ts |
| join-requirements.ts | shared/join-requirements.ts + create 핸들러 resolveLayerPolicy/resolvePersonalQuestEnabled + join 핸들러 시간 변환 | join-requirements.test.ts ← test/backend/challenge-join-requirements.test.ts 백엔드 파트 (frontend 위자드 테스트는 frontend 소유로 제외) |
| challenge-state.ts | backend/shared/lib/challenge-state.ts | (my-challenges 경유 — 레거시 test/backend/my-challenges-state-normalization.test.ts는 핸들러 통짜 테스트라 미이식) |
| quest-rules.ts | backend/shared/lib/quest-submit-validation.ts | (레거시 test/backend/quest-submit-validation.test.ts와 assertion 동일 로직 — 원본 테스트는 admin 이식 시 함께) |
| media-key.ts | backend/shared/lib/media-key.ts | — |

라이프사이클 상태 머신은 **`@chum7/core` (canTransition/resolveDueLifecycle/resolveBucket/calendarDay) 사용 — 재정의하지 않음**.

## 5. 기타 결정 사항

- KST 계산: 사용자 타임존 헤더 `x-user-timezone` 승계 (`safeTimezone`), 단 `VFPUB#` 파티션 날짜는 마당 변환 계약상 KST(Asia/Seoul) 고정.
- env: `CHALLENGES_TABLE`(필수), `UPLOADS_BUCKET`(presign), `STAGE`(fileUrl 도메인). 타 도메인 테이블 접근 없음.
- 탐색 다중 파티션(라이프사이클×카테고리) Query 병합 v1: 파티션별 첫 페이지만 병합 — 레거시도 limit 슬라이스만 지원했으므로 계약 동일. 페이지네이션 고도화는 후속.
- uuid 패키지 대신 `node:crypto` `randomUUID` 사용 (동일 UUIDv4).
