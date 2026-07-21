# Phase 2 도메인 이전 가이드 (에이전트/작업자 공통 규칙)

기존 `backend/services/*` 핸들러를 신규 `services/<domain>-api`(Hono 통합 Lambda)로 이식할 때의
공통 규칙. REDESIGN_PLAN §3, PRODUCT_SPEC v2가 상위 문서다.

## 1. 불변 규칙

1. **API 응답 계약 유지**: 성공 `{ success: true, message?, data? }` / 실패 `{ error: CODE, message, details?, data? }`.
   기존 핸들러의 상태코드·에러코드·data 필드명을 그대로 승계한다 (프론트가 의존).
2. **api-kit만 사용**: `createApi/ok/fail/requireAuth/requireGroup`, `docClient/tableName`, `publishEvent`.
   자체 response()·자체 DynamoDB 클라이언트 생성 금지.
3. **풀스캔 금지**: Query(파티션/GSI)만. 기존 코드가 Scan이면 아래 키 설계로 재작성.
4. **도메인 테이블만 접근**: 자기 도메인 테이블 env만 사용. 문서화된 예외(§4)만 허용.
5. **비즈니스 로직은 순수 함수로**: 판정·계산·상태 전이는 `src/domain/*.ts`에 AWS 무의존 순수 함수로
   분리하고 유닛 테스트(`*.test.ts`) 작성. 핸들러는 파싱→도메인 호출→응답만.
6. **이벤트 발행**: 알림이 필요한 지점에서 `publishEvent(type, detail)` (contracts의 타입 사용).
   기존 `backend/shared/lib/notification.ts` 직접 기록 호출은 이벤트 발행으로 대체.
7. **infra2·packages는 수정 금지** (오케스트레이터가 배선). zod 스키마는 `services/<domain>-api/src/schemas.ts`에.
8. 파일당 400줄 이하 유지. 라우트 파일은 기능군별 분리 (`routes/<feature>.ts`).

## 2. 서비스 구조 템플릿

```
services/<domain>-api/
├── package.json        # @chum7/<domain>-api — api-kit·contracts·hono·zod (+필요 SDK)
├── tsconfig.json       # { "extends": "../../tsconfig.base.json", "include": ["src"] }
└── src/
    ├── index.ts        # createApi + 라우트 마운트 + export handler (user-api 참조)
    ├── schemas.ts      # zod 요청 스키마
    ├── repo/*.ts       # 테이블 액세스 (아래 키 설계 준수)
    ├── domain/*.ts     # 순수 로직 + 테스트
    └── routes/*.ts     # Hono 라우트 (보호: /<prefix>/*, 퍼블릭: /public/<domain>/*)
```

라우트 프리픽스 (contracts `API_PREFIXES`): user `/u`, challenge `/c`, social `/s`, cheer `/ch`,
gamification `/g`, admin `/adm`. 퍼블릭(비로그인) 조회는 `/public/...` 아래에 둔다.

## 3. 테이블 키 설계 (바운디드 컨텍스트당 1테이블, generic pk/sk + gsi{n}pk/gsi{n}sk)

### users (env: USERS_TABLE, gsi1)
| 엔티티 | pk | sk | GSI |
|---|---|---|---|
| 프로필 | `USER#<userId>` | `PROFILE` | gsi1pk=`EMAIL#<email>` 또는 핸들 조회용 gsi1pk=`HANDLE#<feedHandle>`, gsi1sk=`USER` |
| 인앱 알림 | `USER#<userId>` | `NOTIF#<ISO ts>#<id>` | — (sk 역순 Query) |
| 알림 설정 | `USER#<userId>` | `SETTINGS#notifications` | — |
| 푸시 구독 | `USER#<userId>` | `PUSH#<endpointHash>` | — |

### challenges (env: CHALLENGES_TABLE, gsi1·gsi2)
| 엔티티 | pk | sk | GSI |
|---|---|---|---|
| 챌린지 본문 | `CHAL#<challengeId>` | `META` | gsi1pk=`LC#<lifecycle>#CAT#<category>`, gsi1sk=`<challengeStartAt>` (탐색: 상태·카테고리 필터+정렬) / gsi2pk=`CREATOR#<userId>`, gsi2sk=`<createdAt>` |
| 참여(user-challenge) | `CHAL#<challengeId>` | `UC#<userId>` | gsi1pk=`UCUSER#<userId>`, gsi1sk=`<createdAt>` (내 챌린지) |
| 인증(verification) | `CHAL#<challengeId>` | `VF#<userId>#D<dd>#<verificationId>` | gsi1pk=`VFUSER#<userId>`, gsi1sk=`<createdAt>` / 공개 인증: gsi2pk=`VFPUB#<YYYY-MM-DD>`(KST), gsi2sk=`<createdAt>` (마당 변환·공개 피드) |
| 퀘스트 | `CHAL#<challengeId>` | `QUEST#<questId>` | — |
| 퀘스트 제출 | `CHAL#<challengeId>` | `QSUB#<questId>#<userId>#<ts>` | gsi1pk=`QSUBUSER#<userId>`, gsi1sk=`<createdAt>` |
| 리더 운영(메모·경고·템플릿·리마인드 규칙) | `CHAL#<challengeId>` | `LEADER#<kind>#<key>` | — |

### social (env: SOCIAL_TABLE, gsi1·gsi2)
| 엔티티 | pk | sk | GSI |
|---|---|---|---|
| 마당 게시물 | `POST#<postId>` | `META` | gsi1pk=`FEED#ALL`(또는 `FEED#<postType>`), gsi1sk=`<createdAt>` / gsi2pk=`TAG#<hashtag>`, gsi2sk=`<createdAt>` |
| 댓글/리액션 | `POST#<postId>` | `CMT#<ts>#<id>` / `RCT#<userId>` | — |
| 챌린지 게시판 | `BOARD#<challengeId>` | `BLOCK#<order>` / `CMT#...` / `PREVIEW` | — |
| 불레틴 | `BULL#<challengeId>#<phase>` | `POST#<ts>#<id>` / `PCMT#...` / `LIKE#<postId>#<userId>` | — |
| 인증 상호작용 | `VER#<verificationId>` | `CMT#<ts>#<id>` / `RCT#<userId>` | — |
| 해시태그 레지스트리·팔로우 | `TAG#<tag>` | `META` / `FOLLOW#<userId>` | gsi1pk=`TAGUSER#<userId>`, gsi1sk=`<tag>` |

### graph (env: GRAPH_TABLE, gsi1·gsi2)
| 엔티티 | pk | sk | GSI |
|---|---|---|---|
| 팔로우 | `USER#<followeeId>` | `FOLLOWER#<followerId>` | gsi1pk=`FOLLOWING#<followerId>`, gsi1sk=`<createdAt>` |
| 팔로우 요청 | `USER#<followeeId>` | `FOLLOWREQ#<followerId>` | 동일 gsi1 패턴 (`FOLLOWREQOUT#<followerId>`) |
| 차단 | `USER#<blockerId>` | `BLOCK#<blockedId>` | — |
| 초대 링크 | `INVITE#<token>` | `META` (ttl) | gsi2pk=`INVITEOWNER#<userId>`, gsi2sk=`<createdAt>` |
| 자유글(개인 포스트) | `USER#<userId>` | `PP#<ts>#<id>` | — |
| 저장 게시물 | `USER#<userId>` | `SAVE#<postId>` | — |

### cheer (env: CHEER_TABLE, gsi1·gsi2)
| 엔티티 | pk | sk | GSI |
|---|---|---|---|
| 응원 | `CHEER#<cheerId>` | `META` | gsi1pk=`RECV#<receiverId>`, gsi1sk=`<createdAt>` / 예약분: gsi2pk=`SCHED#<status>`, gsi2sk=`<scheduledTime>` |
| 발신 조회 | (위 항목에 속성) | | 발신: gsi1pk=`SENT#<senderId>` 별도 아이템 금지 — gsi1 오버로드 대신 `SENT` 프로젝션 아이템 `CHEER#<cheerId>`/`SENDER` 허용 |
| 데드레터 | `DLQ#<cheerId>` | `META` (ttl) | gsi2pk=`DLQ#<YYYY-MM-DD>`, gsi2sk=`<failedAt>` |
| 사용자 통계 | `STATS#<userId>` | `META` | — |

### gamification (env: GAMIFICATION_TABLE, gsi1)
| 엔티티 | pk | sk | GSI |
|---|---|---|---|
| 뱃지 | `USER#<userId>` | `BADGE#<badgeId>` | gsi1pk=`BADGE#<badgeId>`, gsi1sk=`<grantedAt>` |
| 캐릭터/신화 진행 | `USER#<userId>` | `CHARACTER` / `CHARSLOT#<slotId>` | — |

### content (env: CONTENT_TABLE, gsi1)
| 엔티티 | pk | sk | GSI |
|---|---|---|---|
| 카테고리 배너 | `BANNER#<slug>` | `<bannerId>` | gsi1pk=`BANNERACTIVE#<slug>`, gsi1sk=`<sortOrder>` (활성만 기록) |

### ops (env: OPS_TABLE, gsi1)
| 엔티티 | pk | sk | GSI |
|---|---|---|---|
| 감사 로그 | `AUDIT#<YYYY-MM>` | `<ISO ts>#<id>` | gsi1pk=`AUDITTARGET#<targetId>`, gsi1sk=`<ts>` |

## 4. 문서화된 크로스 도메인 예외

- **gamification-api → challenges 테이블 read-only** (오늘 탭 world-summary가 당일 인증 집계).
- **admin-api → 다수 테이블** (운영 표면 특성상 허용, 단 grant는 필요한 테이블만 명시).
- **워커**: lifecycle-manager(challenges RW + gamification W + 이벤트 발행),
  plaza-converter(challenges R + social W), cheer-scheduler(cheer RW + challenges R + 이벤트 발행).
- 그 외 도메인 간 데이터 필요는 **이벤트 발행** 또는 응답 조합(프론트)으로 해결. 새 예외는 이 문서에 추가.

## 5. 이식 절차 (도메인당)

1. 기존 `backend/services/<구 도메인>/**/index.ts` 전수 목록화 → 라우트 매핑표 작성
   (`services/<domain>-api/PORTING.md`에 기존 핸들러 → 신규 라우트 1:1 표 + 미이식 항목 사유).
2. 순수 로직 추출: 기존 `backend/shared/lib/*` 중 해당 도메인 모듈을 `src/domain/`으로 이식
   (import 경로만 수정, 동작 변경 금지). 기존 테스트가 있으면 함께 이식.
3. repo 작성 (위 키 설계 준수), 라우트 작성, `src/index.ts` 조립.
4. `npx tsc -p services/<domain>-api` 통과 + `npx jest --testPathPattern services/<domain>-api` 통과.
5. 폐기 대상(티켓제 등 PRODUCT_SPEC v2에서 제외된 기능)은 이식하지 않고 PORTING.md에 기록.

## 6. 자주 하는 실수

- `Date.now()` 남발 대신 핸들러 진입 시 1회 `new Date()` 캡처 후 전달.
- 페이지네이션: `nextToken`(base64 JSON of LastEvaluatedKey) 패턴 — api-kit에 없으므로 repo 유틸로.
- 기존 경로 하위 호환은 불필요 (프론트가 contracts 상수로 일괄 전환 예정) — 단 응답 바디는 유지.
- KST 계산은 `Asia/Seoul` 고정이 아니라 기존 코드의 타임존 정책(사용자 타임존 헤더 `x-user-timezone`)을 승계.
