# admin-api 이식 기록 (PORTING.md)

레거시 `backend/services/admin/**` (+ `backend/services/quest/{admin-list,approve}`) →
신규 `services/admin-api` (Hono 통합 Lambda). 프리픽스: **`/adm`** (contracts `API_PREFIXES.admin`).

크로스 도메인 다중 테이블 접근은 이전 가이드 §4의 문서화된 예외 (admin-api). grant는 필요한 테이블만:

| env | 용도 | 권한 |
|---|---|---|
| `USERS_TABLE` | 사용자 단건 검색 (gsi1 `EMAIL#`) | R |
| `CHALLENGES_TABLE` | 챌린지 관리·퀘스트 심사·공개 인증 집계 | RW |
| `CHEER_TABLE` | 데드레터 운영·모니터 | RW |
| `CONTENT_TABLE` | 카테고리 배너 CRUD | RW |
| `OPS_TABLE` | 감사 로그 (`AUDIT#`) | RW |
| `SOCIAL_TABLE` · `GAMIFICATION_TABLE` · `EVENT_BUS_NAME` | **예약 — v1 미사용** (plaza/뱃지 운영 표면·알림 이벤트는 후속) | — |

## 1. 라우트 매핑표 (레거시 → 신규)

### A. 챌린지 관리 (`routes/challenges.ts`)

| 레거시 | 신규 | 비고 |
|---|---|---|
| POST /admin/challenges | **POST /adm/challenges** | 스키마·타임라인/보완정책 검증·layerPolicy 정규화 그대로 (`domain/challenge-admin.ts` + 테스트). 신규 키 `CHAL#<id>`/`META` + gsi1 `LC#<lifecycle>#CAT#<category>` + gsi2 `CREATOR#` 기록. `participantCount: 0` top-level 초기화(탐색 인기 정렬 계약). 그룹: admins\|creators (레거시 admins\|leaders) |
| PUT /admin/challenges/{id} | **PUT /adm/challenges/:challengeId** | admins 전용. category 변경 시 gsi1pk 동기 갱신. **category enum은 8종 전체로 교정** (레거시 update만 6종 나열한 결함 — create·신규 키와 정합) |
| DELETE /admin/challenges/{id} | **DELETE /adm/challenges/:challengeId** | 참여자 존재 검사 = challengeId-index Scan성 Query → **pk 파티션 `UC#` Limit 1 Query**. META 아이템만 삭제(레거시 동일 — 부속 QUEST/QSUB 아이템은 잔존, 참여자 0 전제라 실질 무해) |
| PATCH /admin/challenges/{id}/toggle | **PATCH /adm/challenges/:challengeId/toggle** | admins 전용. isActive 반전 — 응답 바디·한국어 메시지 동일 |
| POST /admin/challenges/{id}/confirm-start | **POST /adm/challenges/:challengeId/confirm-start** | preparing→active 조건부 전환 + gsi1pk lifecycle 동기. side effect(미승인 신청 자동 거절→UC failed/rejected + pending 감소, 승인 참여 phase active/currentDay 1) 이식. **sendNotification 5종은 미이식** — contracts에 대응 이벤트 타입 부재 (아래 §3). **개인퀘스트 제안 만료 처리 미이식** — 제안 플로우 자체가 v1 미이식 |
| PUT /admin/challenges/{id}/lifecycle | **PUT /adm/challenges/:challengeId/lifecycle** | 전이 검증을 자체 표 → **`@chum7/core` `canTransition`** 으로 교체 (규칙 차이: core는 recruiting→active 허용, active→archived 불허 — 레거시 표와 다르며 core가 정본). 409 INVALID_TRANSITION의 `allowedTransitions`는 실패 envelope `data`로 이동. admins\|operators 또는 생성자 |
| GET /admin/challenges/mine | **GET /adm/challenges/mine** | **Scan(createdBy 필터) → gsi2 `CREATOR#<userId>` Query** |
| GET /admin/challenges/all | **GET /adm/challenges/all** | **Scan(Limit 500) → gsi1 (lifecycle×category 48개 파티션) 병렬 Query 병합** (파티션당 첫 페이지 100건). admins는 reason 5자 이상 필수 + [AUDIT] 구조화 로그 유지. admins\|operators |

### B. 퀘스트 제출물 심사 (`routes/quests.ts`)

| 레거시 | 신규 | 비고 |
|---|---|---|
| GET /admin/quests/submissions | **GET /adm/quests/submissions?challengeId=** | 전역 status-createdAt-index/questId-index → **challengeId 스코프 필수** (pk 파티션 `QSUB#` Query — 신규 키에 전역 상태 인덱스 없음, 풀스캔 금지). status(all/approved=auto_approved 포함)/questId/questScope 필터·quest enrichment·summary 집계 유지. **S3 presign 재서명 미이식** (UPLOADS_BUCKET env 없음 — 저장된 URL 그대로 반환, 필요 시 프론트/미디어 표면에서 재서명). 페이지네이션은 파티션 전량 조회 후 limit 슬라이스(nextToken 항상 null) |
| PUT /admin/quests/submissions/{id}/review | **PUT /adm/quests/submissions/:submissionId/review** | **바디에 `challengeId` 필수 추가** (신규 키에서 submissionId 단독 Get 불가 — 파티션 내 탐색). 승인: 이력 approved+rewardGranted, ACTIVE 마커 approved 유지(재제출 차단), quest.approvedCount+1 — 3건 TransactWrite. **거절: ACTIVE 유니크 마커 DELETE → 재제출 허용** (challenge-api PORTING.md §C 계약 이행). pending 조건부 갱신으로 중복 심사 409. 응답 바디 `{submissionId,status,rewardGranted,canResubmit}`·메시지 동일 |

### C. 카테고리 배너 (`routes/banners.ts`)

| 레거시 | 신규 | 비고 |
|---|---|---|
| GET /admin/category-banners/{slug} | **GET /adm/category-banners/:slug** | pk `BANNER#<slug>` Query. **레거시 비-envelope 바디 `{data:{banners}}` 유지** (c.json 직접) |
| POST /admin/category-banners/{slug} | **POST /adm/category-banners/:slug** | 생성(기본 비활성 `isActive:'false'` 문자열 — 레거시 계약 유지). 201 `{data: item}` |
| PUT /admin/category-banners/{slug}/{bannerId}/activate | **PUT /adm/category-banners/:slug/:bannerId/activate** | 트랜잭션: 대상 `isActive:'true'` + **gsi1 `BANNERACTIVE#<slug>`/`<sortOrder>` 기록**, 나머지 `'false'` + gsi1 REMOVE (sparse GSI — gamification-api `getActiveBanner` 계약 유지). 100건 청크 |
| — | **DELETE /adm/category-banners/:slug/:bannerId** | **신규** (CRUD 보완). 활성 배너는 삭제 불가(BANNER_ACTIVE 400) |

### D. 응원 운영 (`routes/cheer-ops.ts`)

| 레거시 | 신규 | 비고 |
|---|---|---|
| GET /admin/cheer/monitor | **GET /adm/cheer/monitor** | scheduled-index(status 파티션) → **gsi2 `SCHED#<status>`** 최신 N건. **challengeId 직접 Query는 불가** (신규 키에 challengeId-index 없음) — challengeId 지정 시 조회분 인메모리 필터 + userScores는 `UC#` 파티션 Query로 유지. 응답 바디(summary/pending/sent/receiverCompleted/userScores) 동일 |
| GET /admin/cheer/dead-letters | **GET /adm/cheer/dead-letters** | failedAt-index(status='dead' 파티션) → **gsi2 `DLQ#<YYYY-MM-DD>` 일자 파티션** 최신일부터 순회(범위 상한 62일, 기본 최근 7일), status='dead'·failureCode 필터. nextToken은 `{d: date, k: lastKey}` 인코딩으로 일자 경계 넘어 연속 |
| GET /admin/cheer/dead-letters/stats | **GET /adm/cheer/dead-letters/stats** | 일자 파티션별 dead/requeued COUNT 합산. fromIso/toIso 검증·기본 7일·unresolvedCount 계산 동일 |
| GET /admin/cheer/dead-letters/{cheerId} | **GET /adm/cheer/dead-letters/:cheerId** | `DLQ#<id>`/`META` + 원본 `CHEER#<id>`/`META` 스냅샷 병행 Get — 바디 동일 |
| POST /admin/cheer/dead-letters/{cheerId}/requeue | **POST /adm/cheer/dead-letters/:cheerId/requeue** | 트랜잭션(원본 pending 복구 + DLQ requeued, dead 조건) 승계. **신규: 원본 META의 `gsi2pk=SCHED#pending`/`gsi2sk=<scheduledTime>` 복구** — 없으면 cheer-scheduler가 재발송분을 못 집는다 (레거시 스캐너와 인덱스 구조가 다름) |
| POST /admin/cheer/dead-letters/requeue-batch | **POST /adm/cheer/dead-letters/requeue-batch** | 최대 50건·중복 제거·건별 결과 배열 동일 |
| POST /admin/cheer/dead-letters/requeue-by-query | **POST /adm/cheer/dead-letters/requeue-by-query** | 범위+failureCode 후보 수집(일자 파티션 Query) → dryRun/실행. 응답 바디 동일 |

### E. 사용자 / 통계 / 감사 (`routes/{users,stats,audit}.ts`)

| 레거시 | 신규 | 비고 |
|---|---|---|
| GET /admin/users | **GET /adm/users** | **Scan 폐기.** 신규 users 키(pk=`USER#<id>`/sk=`PROFILE`)에는 전체 목록 접근 경로가 설계상 없음 → v1은 `?email=`(gsi1 `EMAIL#`) / `?userId=` 단건 검색만. 무파라미터 호출은 빈 목록 + `note` 필드 반환 (NOT_IMPLEMENTED 성) — **전체 사용자 목록은 운영용 GSI(예: gsi 오버로드 `USERSALL#<shard>`) 도입 후 후속 티켓** |
| GET /admin/stats, /admin/stats/overview | **GET /adm/stats**, **GET /adm/stats/overview** | 5개 테이블 Scan 전면 폐기. Query 산출 가능 지표만 계산: `totalChallenges`(gsi1 48개 파티션 COUNT 합산), `verifications.verificationDaily/recent7DaysCount`(gsi2 `VFPUB#<KST 날짜>` COUNT — **공개 인증만 집계하는 부분 지표**). `totalUsers`/`totalParticipations`/`operations`(퀘스트 심사 전역 집계)/`verifications.total·remedyCount·extraCount`는 **null + `notes` 필드로 사유 명시** — 집계 워커(EventBridge 카운터 머티리얼라이즈) 도입 후 채움 |
| GET /admin/audit/logs | **GET /adm/audit** (월 파티션) / **GET /adm/audit/target/:targetId** | 레거시는 QUEST_SUBMISSIONS Scan에서 심사 이력을 파생 — 폐기하고 **실제 감사 저장소**로 대체: 모든 변이 어드민 라우트가 ops 테이블에 `AUDIT#<YYYY-MM>`/`<ISO ts>#<id>`(+gsi1 `AUDITTARGET#<targetId>`) 아이템 기록 (레거시 payout-audit 패턴 일반화, `domain/audit.ts` + 테스트). 항목: actorUserId·action·target{type,id}·payloadSummary(1000자 절단) |

감사 기록 대상 액션: `challenge.create/update/delete/toggle/lifecycle/confirm-start`,
`quest.review`, `banner.create/activate/delete`, `cheer.dlq.requeue/requeue-batch/requeue-by-query`.
감사 기록 실패는 로깅만 (본 업무 흐름 비차단).

## 2. 권한 게이트 (Cognito 그룹 매핑)

베이스: `app.use('/adm/*', requireAuth())` + `requireGroup('admins','operators','creators')`.
레거시 그룹 → 신규: **admins→admins, productowners/managers→operators, leaders→creators**.

| 표면 | 세부 게이트 |
|---|---|
| 챌린지 update/delete/toggle, 사용자 검색 | `requireGroup('admins')` |
| 챌린지 all 조회 | `requireGroup('admins','operators')` (+admins는 reason 필수) |
| 챌린지 create | `requireGroup('admins','creators')` |
| lifecycle/confirm-start | admins\|operators 또는 챌린지 생성자 (핸들러 내 검사) |
| 퀘스트 심사·배너·응원 운영·stats·audit | 베이스 게이트 (레거시 배너는 그룹 검사 자체가 없었음 — 베이스 게이트로 강화) |

## 3. 미이식 / 폐기 항목 (사유)

| 레거시 | 사유 |
|---|---|
| admin/plaza/convert-run-now | **plaza-converter 워커 소관** (이전 가이드 §4). 즉시 실행 트리거는 워커/오케스트레이터 표면에서 재설계 |
| challenge/review-payout·finalize-payout·정산/환불 어드민 표면 전체 | **commerce Phase 3가 대체** — 이식 금지 항목. payout-audit 기록 패턴만 §1-E 감사 로그로 일반화 승계 |
| admin/personal-quest/{list,review} | **개인퀘스트 제안 플로우가 v1 미이식** (challenge-api PORTING.md §E — PERSONAL_QUEST_PROPOSALS_TABLE 폐기, challenges 테이블 재설계 필요). 제안 데이터가 신규 테이블에 존재하지 않아 심사 표면도 함께 후속 티켓 |
| confirm-start·quest review의 sendNotification | contracts `domainEventSchemas`에 대응 이벤트 타입(challenge_started 등) 부재 — **packages 수정 금지** 제약으로 이벤트 계약 추가는 오케스트레이터 몫. 타입 추가 후 `publishEvent` 연결 (gap) |
| admin-list의 S3 presigned 재서명 | UPLOADS_BUCKET env 미주입 (admin-api env 계약 밖). 필요 시 env 추가 후 소형 유틸 복원 |
| 레거시 audit/list의 심사 이력 Scan 파생 | 신규 감사 저장소(ops 테이블)로 대체 — §1-E |

## 4. 스캔 제거 요약 (레거시 Scan → 신규)

| 레거시 Scan | 재작성 |
|---|---|
| challenges 전체 (list-all) | gsi1 `LC#<lifecycle>#CAT#<category>` 48개 파티션 병렬 Query 병합 |
| challenges createdBy 필터 (list-mine) | gsi2 `CREATOR#<userId>` Query |
| users 전체 (user/list) | 제거 — EMAIL#/userId 단건 조회 + note (운영 GSI 후속) |
| users/challenges/userChallenges/questSubmissions/verifications COUNT (stats) | 파티션 COUNT Query 합산 또는 null+note |
| questSubmissions 전체 (audit/list) | ops 테이블 감사 로그 Query로 대체 |
| cheers 전체 (monitor 무필터 경로) | gsi2 `SCHED#<status>` 파티션 Query |

## 5. 검증

- `npx tsc -p services/admin-api` ✅
- `npx jest --silent --testPathPattern "services/admin-api"` ✅ (domain 순수 로직 4스위트 33케이스)
