# CHME 시스템 아키텍처 재구축 기획서 (개발 기획서)

- 작성일: 2026-07-21 (v2)
- 상태: **v2 — 커머스(결제·정산·배송)·푸시 알림·리더 도구를 재구축 범위에 통합한 판**
- 자매 문서: `PRODUCT_SPEC.md` v2 (기능 요건 기준), `PAYMENT_SPEC.md` (결제·정산·배송 상세)
- 결정사항:
  - **범위**: 인프라 + 배포 + 백엔드 완전 재설계, 프론트엔드는 유지·정리 (+커머스·리더 운영 탭 신규 화면)
  - **데이터**: prod는 테스트 수준 → 마이그레이션 없이 새 환경에서 새 출발
  - **백엔드**: 엔드포인트당 Lambda(122개) → **도메인별 통합 Lambda + 경량 라우터(Hono)**
  - **배포**: CI/CD 없이 **크로스플랫폼 로컬 원커맨드 배포**
  - **커머스**: 직접 결제(월렛 없음) / 참가비형+보증금형 / 개인·사업자 크리에이터 / 배송 주체 양쪽 — `PAYMENT_SPEC.md`
  - **알림**: 인앱 + **Web Push**, EventBridge 이벤트 버스를 실사용으로 전환 (v1의 "미사용 리소스 제거" 방침 갱신)

---

## 1. 배경과 목표

### 1.1 배경

CHME(chum7.com)는 7일 챌린지 기반 습관 형성 소셜 앱이다. 초기 학습 과정에서 점진적으로
만들어져 다음 구조적 부채가 누적됐고(§2), 여기에 **유료 챌린지·크리에이터 정산·배송·푸시**라는
신규 요구가 더해졌다. 기존 구조 위에 커머스를 얹는 것은 부채를 복리로 만들므로,
재구축 범위에 커머스를 처음부터 포함해 설계한다.

### 1.2 목표

| # | 목표 | 측정 기준 |
|---|------|-----------|
| G1 | **환경 재현성**: 빈 AWS 계정에서 명령 몇 개로 dev/prod 전체 환경 생성 | `npm run deploy -- --stage dev` 만으로 전체 스택 생성 성공 |
| G2 | **원커맨드 배포**: 빌드→검증→배포→프론트 env 주입까지 한 명령 | 배포 절차가 "명령 1개 + prod 확인 입력"으로 축소 |
| G3 | **구조 단순화**: Lambda 122개 → **API 7 + 워커 7 = 14개**, 스택 17개 → **6개**, 테이블 35개 → **9개** | CDK synth 결과 리소스 수 |
| G4 | **하드코딩 제거**: 계정/리전/배포 ID/시크릿이 코드에 리터럴로 존재하지 않음 | grep 검사 스크립트 통과 |
| G5 | **죽은 코드 0**: 실행 경로 없는 코드/문서가 리포에 남지 않음 | 정리 체크리스트(§8) 완료 |
| G6 | **금전 무결성**: 모든 금전 이동이 원장에 기록되고 일 배치 대사 통과 | 대사 불일치 0건 알람 체계 가동 |

### 1.3 비목표

- 프론트엔드 전면 재작성 (구조 정리 + 신규 화면 추가만, §5.4)
- CI/CD 파이프라인 (로컬 배포 개선까지만 — 단, 나중에 CI를 얹기 쉬운 구조로)
- 데이터 마이그레이션, 멀티리전, ML 추천·OpenSearch (백로그)
- 해외 결제 (PAYMENT_SPEC M5 별도)

---

## 2. 현재 시스템 진단 (As-Is)

### 2.1 구조 요약

```
[사용자 PWA]  [관리자 SPA]          ← React 18 + Vite, S3 + CloudFront
      │             │
      └──── API Gateway HTTP API ── Cognito JWT Authorizer
                    │
         Lambda ×122 (엔드포인트당 1개, esbuild NodejsFunction)
                    │
         DynamoDB ×35 테이블 (멀티테이블 + GSI 다수)

비동기: EventBridge 스케줄 3종(라이프사이클 1h, 응원발송 5m, 마당변환 1h)
        + Step Functions(응원 통계 materializer)
IaC:    CDK 17개 스택 (infra/bin/chme.ts) + 죽은 CDK 앱 2개(루트, infra/bin/infra.ts)
배포:   PowerShell 수동 (deploy-dev.ps1은 core 스택만 배포)
```

### 2.2 핵심 문제점

| 영역 | 문제 | 근거 위치 |
|------|------|-----------|
| 배포 | CI 없음. 공식 스크립트가 core 스택만 배포, 나머지 15개는 수동 `cdk deploy` 의존 | `scripts/deploy-dev.ps1` |
| 배포 | 프론트 배포 경로 2개 경합 (`s3 sync` vs CDK `BucketDeployment`) | `scripts/deploy-*.ps1` vs `infra/stacks/frontend-stack.ts` |
| 배포 | 관리자 프론트 배포·관리자 생성 스크립트가 빈 껍데기 | `scripts/deploy-admin-*.ps1`, `create-admin-user.ps1` |
| IaC | CDK 앱 3개 병존(실제 1 + 죽은 스캐폴드 2). 유일한 CDK 테스트가 죽은 스택 검증 | 루트 `bin/chum7.ts`, `infra/bin/infra.ts`, `test/chum7.test.ts` |
| IaC | CoreStack 메가스택(테이블 35+Cognito+SNS+EventBus)을 15개 스택에 객체 참조로 전파 | `infra/stacks/core-stack.ts` |
| IaC | 스택 경계가 도메인이 아닌 "테이블 grant 편의" 기준 (마당→verification-stack, 알림·배너→challenge-stack) | `infra/stacks/verification-stack.ts` 등 |
| 설정 | 계정·리전·CloudFront ID 하드코딩. **DEV CloudFront ID가 config와 스크립트에서 상이** (`ESKW3DS5HUUK9` vs `ESKW3DSSHIUK9`) | `infra/config/dev.ts` vs `scripts/deploy-dev.ps1` |
| 설정 | S3/CloudFront/Cognito 콘솔 수작업 생성 후 import → 재현 불가. prod Cognito `RemovalPolicy.DESTROY` | `core-stack.ts:102`, `frontend-stack.ts` |
| 설정 | cheer-stack이 synth 시점 쉘 `process.env` 의존 → 비재현 빌드, rate-limit 조용한 스캔 폴백 | `infra/stacks/cheer-stack.ts` |
| 백엔드 | 공유 레이어 형해화: 122핸들러 중 75개 `response()` 복사, 107개 DynamoDB 클라이언트 각자 생성, 88개 JWT 인라인 파싱 | `backend/services/**` |
| 백엔드 | `notification/` vs `notifications/` 폴더 중복 | `backend/services/` |
| 데이터 | 핫패스 풀스캔(챌린지 목록)+JS 정렬, `category-index`/`-v2` 미완 마이그레이션 잔재 | `backend/services/challenge/list/index.ts` |
| 데이터 | 미사용 인프라: Stream 5테이블(컨슈머 없음), EventBus(규칙 없음), SNS(구독 없음) | `infra/stacks/core-stack.ts` |
| 잔재 | `proto/`, `CREATE_28_LAMBDAS.ps1`, `gsi.json`, `dynamodb-stack.ts`(미인스턴스·테이블명 충돌 위험), 문서 루트 5개 산재 | 리포 루트 |
| 프론트 | 1,000~1,500줄 페이지, `any` 263곳, 두 앱 간 로직 중복, 사용자 앱에 admin 라우트 혼입, 권한 모델 2개 병존, prod 소스맵 노출 | `frontend/`, `admin-frontend/` |

---

## 3. 목표 아키텍처 (To-Be)

### 3.1 리포 구조 — npm workspaces 모노레포

```
chum7/
├── package.json              # workspaces 루트, 공통 스크립트
├── tsconfig.base.json
├── packages/
│   ├── core/                 # 순수 도메인 로직 + 타입 (AWS 의존 없음)
│   │   └── src/{challenge,verification,cheer,social,gamification,user,commerce}/
│   ├── api-kit/              # Lambda 공통: Hono 앱 팩토리, 인증·에러·로깅 미들웨어,
│   │   └── src/              #   DynamoDB 클라이언트, 응답 envelope, 이벤트 발행 헬퍼
│   ├── contracts/            # FE↔BE 공유: API 타입, zod 스키마, 라우트 상수, 이벤트 스키마
│   └── web-kit/              # 프론트 공통 런타임: api-client(토큰 갱신), mediaUrl, 라이프사이클 유틸
├── services/                 # 배포 단위 = Lambda 1개
│   ├── user-api/             # auth, profile, personal-feed, notification(통합), settings
│   ├── challenge-api/        # challenge(+탐색 검색·필터·추천), verification, quest, 리더 운영 API
│   ├── social-api/           # plaza, challenge-board, challenge-feed, bulletin, hashtag
│   ├── cheer-api/            # cheer 동기 API
│   ├── gamification-api/     # badge, character, today(world), category-banners(읽기)
│   ├── commerce-api/         # 주문·결제·환불·정산·배송·KYC + PG 웹훅(퍼블릭·서명검증)
│   ├── admin-api/            # 운영자·슈퍼 콘솔 + 크리에이터 제한 영역
│   └── workers/
│       ├── lifecycle-manager/        # 1h: 라이프사이클 전환·완주 판정 (+반환·정산 개시 이벤트 발행)
│       ├── cheer-scheduler/          # 5m: 응원 발송 (알림은 이벤트 발행으로 위임)
│       ├── plaza-converter/          # 1h: 공개 인증 → 마당 게시물
│       ├── cheer-stats-materializer/ # 통계 집계 (Step Functions)
│       ├── notification-worker/      # 이벤트 구독 → 인앱 기록 + Web Push 발송
│       ├── settlement-worker/        # 보증금 반환·정산서 생성·PG 대사 배치
│       └── shipping-tracker/         # 배송 상태 폴링·상태 전이
├── infra/                    # CDK 앱 1개 (유일한 IaC)
│   ├── bin/app.ts
│   ├── config/stages.ts      # 타입 있는 스테이지 설정 (리터럴 하드코딩 금지)
│   └── stacks/               # §3.4 — 6개 스택
├── frontend/                 # 유지 + 정리 + 신규 화면 (§5.4)
├── admin-frontend/           # 유지 + 정리 + 커머스·크리에이터 영역 (§5.4)
├── scripts/
│   ├── deploy.mjs            # 크로스플랫폼 원커맨드 배포 (§4)
│   ├── gen-env.mjs           # CDK Outputs → frontend .env 자동 생성
│   └── ops/                  # 운영 스크립트 (.mjs 통일, sh/ps1 이중화 폐지)
├── docs/                     # 문서 단일 루트 (docs2~4 통합)
└── test/                     # 통합 테스트 (도메인 단위 테스트는 packages/core에 동거)
```

**설계 원칙**

1. **비즈니스 로직은 `packages/core`에, AWS는 가장자리에.** 핸들러는 "HTTP 파싱 → core 호출 → 응답" 3줄. 기존 `backend/shared/lib`의 검증된 도메인 로직과 단위 테스트(~30파일)가 core의 씨앗.
2. **`packages/contracts`로 FE·BE 타입 단일화.** zod 스키마로 요청 검증과 타입 동시 확보. **도메인 이벤트 스키마도 여기서 정의** (발행자·구독자가 같은 타입 공유).
3. **중복 유틸(3벌+인라인 75벌) → `api-kit` 1벌.** 프론트 중복은 `web-kit` 1벌.
4. **돈은 격리한다.** commerce 로직·테이블·시크릿은 commerce-api/settlement-worker에만 grant. 다른 서비스는 이벤트로만 상호작용 (예: lifecycle-manager는 "challenge.completed" 발행만, 반환 실행은 settlement-worker).

### 3.2 백엔드 — 도메인별 통합 Lambda + 이벤트 버스

**라우터: Hono** (경량·TS-first·API Gateway v2 어댑터·esbuild 친화).

- **API Lambda 7개 + 워커 7개 = 14개** (기존 122개).
- API Gateway에는 도메인 프리픽스 프록시 라우트만 등록 (`ANY /u/{proxy+}` → user-api 등).
  퍼블릭 경로는 `GET /public/{proxy+}`(authorizer 없음), **PG 웹훅은 `POST /hooks/pg`**
  (authorizer 없음 + 서명 검증은 핸들러에서) — 노출 표면을 라우트 수준에서 명시 관리.
- 인증: Cognito JWT Authorizer 유지. 역할은 **Cognito 그룹 단일 체계**로 통일:
  `admins`(슈퍼) / `operators`(운영) / `creators`(크리에이터). 이메일 allowlist·role 문자열 폐지.
  admin-api는 그룹 미들웨어로 영역 격리(크리에이터는 자기 리소스만).
- 미들웨어 체인(api-kit): requestId·구조화 로깅 → 인증 컨텍스트 → zod 검증 → 에러→HTTP 매핑.
- **이벤트 버스 (신규 — v1 방침 변경)**: EventBridge 커스텀 버스를 **notification-worker가 첫 소비자로 실사용**.
  - 발행: api-kit의 `publishEvent()` 헬퍼로 각 서비스가 도메인 이벤트 발행
    (`cheer.delivered`, `challenge.completed`, `order.paid`, `settlement.paid`, `shipment.updated`, `comment.created`, `follow.requested` …).
  - 구독: notification-worker(인앱+푸시), settlement-worker(`challenge.completed`).
  - 원칙: **이벤트는 통지이지 트랜잭션이 아니다** — 금전 상태 전이는 commerce 도메인 내부에서 동기 처리하고, 이벤트는 후속 통지·집계에만 사용.
- **Web Push**: 구독 정보(endpoint/keys)는 users 테이블에 저장, VAPID 키는 Secrets Manager.
  notification-worker가 수신 설정·방해금지 확인 후 발송, 실패(410 Gone) 시 구독 자동 정리.
- 트레이드오프 인지: 함수별 최소 IAM은 도메인 단위로 완화된다. 대신 **commerce는 전용 Lambda·전용 테이블·전용 시크릿으로 격리**해 가장 민감한 표면을 좁게 유지한다.

### 3.3 데이터 모델 — 테이블 35개 → 도메인별 9개

바운디드 컨텍스트당 1테이블(제네릭 PK/SK + 엔티티 프리픽스) 절충. 완전한 single-table 불채택.

| 테이블 | 담는 엔티티 (기존 대응) | 대표 액세스 패턴 |
|--------|--------------------------|------------------|
| `users` | users, notifications(수신함), notification-settings, **push-subscriptions**, **kyc-status(요약)** | 프로필, 알림함 시간순, 푸시 구독 조회 |
| `challenges` | challenges, user-challenges, verifications, **리더 운영 데이터(참가자 메모·경고·리마인드 규칙·퀘스트 템플릿·기수 계보)** | **탐색 쿼리**(§하단), 참가자별 인증 day, 리더 브리핑 집계 |
| `social` | plaza-*, challenge-boards/comments/previews, bulletin-*, verification-comments/reactions, hashtags, hashtag-follows | 피드 시간순, 게시물별 상호작용, 태그 피드 |
| `graph` | feed-follows, feed-blocks, feed-invite-links, personal-posts, saved-posts | 팔로우 양방향, 차단 |
| `cheer` | cheers, cheer-dead-letters(TTL), cheer-stats | 수신/발신자별, 예약분, DLQ |
| `gamification` | badges, characters, quests, quest-submissions, active-quest-submissions, personal-quest-proposals | 사용자별 컬렉션, 퀘스트별 심사 |
| `content` | category-banners, 추천 섹션 큐레이션 | slug별 활성 |
| `commerce` | orders, payments, refunds, **ledger-entries(append-only)**, settlements, creator-profiles, kyc-records(CI 암호화), shipments | 주문별 원장 타임라인, 크리에이터별 정산, 미확정 주문 폴링, CI 중복 검사(GSI) |
| `ops` | 감사 로그(금전·권한 행위), 운영 카운터/락 | 시간순 감사 조회 |

- prod: PITR + RETAIN (Cognito 포함 — 현행 `DESTROY` 결함 수정). GSI 명명 `gsi1..n` 통일, `-v2` 네이밍 금지.
- **풀스캔 금지**: 목록성 조회는 파티션 키/GSI Query만.
  - 탐색(§PRODUCT 4.2) 대응 키 설계: `lifecycle#category` GSI(카테고리·상태 필터), `lifecycle#createdAt`(최신), 참여자 수·마감일은 아이템 속성 정렬 캐시(추천 섹션은 5분 캐시 API). 텍스트 검색 v1은 제목 프리픽스+해시태그 GSI — OpenSearch는 백로그.
- **ledger는 append-only**: 수정·삭제 API 자체를 만들지 않는다. 일 1회 PG 정산 파일과 대사(settlement-worker).
- Stream은 이번에도 미사용(소비자 없음). 이벤트는 애플리케이션 레벨 발행으로 통일.

### 3.4 인프라 — CDK 앱 1개, 스택 6개

```
infra/bin/app.ts  →  스테이지(dev|prod)당:

1. StatefulStack      DynamoDB 9테이블, Cognito(UserPool + 그룹 admins/operators/creators),
                      S3(uploads/static/admin-static), Secrets Manager 시크릿 셸
                      (PG API 키·본인확인 키·VAPID 키 — 값은 배포 후 1회 CLI 주입, 코드에 없음)
2. CertStack          us-east-1: CloudFront용 ACM 인증서
3. EdgeStack          CloudFront 2개(app/admin) + Route53 + OAC + /uploads/* 비헤이비어 (전부 CDK 생성)
4. ApiStack           HTTP API + JWT Authorizer + API Lambda 7개 + 프록시/퍼블릭/웹훅 라우트 + 커스텀 도메인
5. WorkersStack       EventBridge 커스텀 버스 + 규칙, 워커 7개, Step Functions(통계), DLQ·재시도 정책
6. ObservabilityStack CloudWatch 대시보드(운영+커머스 대사)·알람·SNS(ops 이메일)
```

- 의존 단선화: Stateful ← Api/Workers, Cert ← Edge. CoreStack식 전파 폐지.
- 하드코딩 제거: 계정/리전은 CLI 프로파일, 도메인·존은 `stages.ts` 타입 설정,
  산출값(배포 ID 등)은 **CfnOutput → 배포 스크립트 소비**. Route53 호스티드 존만 lookup.
- synth 시 `process.env` 읽기 금지 — 같은 커밋 = 같은 synth.
- CDK 테스트: 스택별 assertion(테이블 RETAIN, authorizer 유무, **commerce 테이블 grant가 commerce 계열 Lambda로 한정되는지**, 웹훅 라우트 authorizer 부재 확인 등)을 배포 전 필수 게이트로.

### 3.5 관측성

- api-kit 구조화(JSON) 로그 → Logs Insights 쿼리 가능. Lambda 14개 각각 에러율·지연 알람.
- **커머스 전용 위젯**: 결제 성공률, 웹훅 지연, 대사 불일치(0 아니면 알람), 정산 보류 건수, 푸시 발송 성공률.
- 기존 cheer 대시보드·위젯 카탈로그 lint 이식.

---

## 4. 배포 체계 — 로컬 원커맨드 (크로스플랫폼)

PowerShell/bash 이중화를 폐지하고 **Node 스크립트(`scripts/deploy.mjs`) 하나**로 통일.

```bash
npm run deploy -- --stage dev                 # 전체 (기본)
npm run deploy -- --stage dev --only api      # API Lambda만
npm run deploy -- --stage dev --only frontend # 프론트 빌드+업로드만
npm run deploy -- --stage prod                # 'DEPLOY' 확인 입력 후 진행
npm run deploy -- --stage dev --diff          # 배포 없이 cdk diff만
```

**파이프라인**: ① typecheck+단위 테스트+CDK 테스트 → ② 프론트 빌드 → ③ cdk diff 요약
(prod 확인 입력) → ④ `cdk deploy --all` (프론트는 BucketDeployment 단일 경로 — 수동 s3 sync 폐지)
→ ⑤ CfnOutputs → `gen-env.mjs`가 `frontend/.env.{stage}` 자동 생성 (Cognito ID 수동 복사 소멸)
→ ⑥ 스택별 결과 리포트.

**안전장치**: prod에서 Stateful 리소스 삭제/치환 diff 감지 시 강제 중단(명시 플래그로만 통과).
검증 실패 시 배포 진입 차단. 산출 ID를 스크립트에 재기재 금지(CloudFront ID 드리프트 재발 방지).
시크릿 주입은 1회성 `npm run ops:set-secrets -- --stage dev` (값은 프롬프트 입력, 파일 미저장).

**운영 스크립트**: 백필·재처리·관리자 생성(`ops:create-admin`)·크리에이터 승격(`ops:grant-creator`) 등
전부 `.mjs`로 `scripts/ops/` 통일.

---

## 5. 컴포넌트별 계획

### 5.1 packages/core — 도메인 로직 이식 + 신규

- 이식(테스트 보유 모듈 우선): challenge-state / day-sync / progress / verification-normalization /
  media-validation / cheer 스케줄링 / badge-grant / quest-policy.
- 신규 작성: **commerce**(주문 상태 머신, 환불 규정 엔진, 수수료·원천세 계산, 정산 상태 머신,
  배송 상태 머신 — 전부 순수 함수로 작성해 단위 테스트 최우선 커버), **탐색 랭킹 룰**, **알림 라우팅 룰**(유형→채널·우선순위·방해금지).

### 5.2 서비스 구성 (기존 122개 + 신규 요구 매핑)

| 신규 서비스 | 흡수·신설 | 비고 |
|-------------|-----------|------|
| user-api | auth, personal-feed, notification+notifications(통합), profile, 푸시 구독 등록 | 폴더 이원화 해소 |
| challenge-api | challenge, verification, quest(사용자측), **탐색(검색·필터·정렬·추천 섹션)**, **리더 운영 API(브리핑·참가자 관리·리마인드·템플릿·시즌 복제)** | give-up 배치 오류 해소 |
| social-api | plaza, challenge-board, challenge-feed, bulletin, hashtag | plaza 무스택 문제 해소 |
| cheer-api | cheer 동기 API | 발송·통계는 워커 |
| gamification-api | badge, character, today, category-banners(읽기) | |
| commerce-api | **신설** — 주문·결제·환불·KYC·배송 조회 + PG 웹훅 | PAYMENT_SPEC §5~8 |
| admin-api | admin 전체 + 커머스 콘솔(환불 승인·정산·크리에이터 심사) + 크리에이터 제한 영역 | 그룹 미들웨어 격리 |
| workers ×7 | 기존 4 + notification-worker·settlement-worker·shipping-tracker | §3.2 |

### 5.3 인증·권한 단일화

- Cognito 그룹: `admins / operators / creators`. 이메일 allowlist·role 문자열·4그룹 혼재 폐지.
- 리더는 그룹이 아니라 **소유 관계**(챌린지 createdBy)로 판정 — 누구나 무료 챌린지를 열면 리더.
- KYC 상태는 그룹이 아닌 users 레코드 속성 (결제 미들웨어에서 검사).
- 토큰 갱신 로직은 web-kit으로 승격, 두 프론트 공용.

### 5.4 프론트엔드 — 정리 + 신규 화면

**정리** (PRODUCT_SPEC §3.1 확정 반영):
1. admin 표면을 admin-frontend로 전부 이동, 사용자 번들에서 제거.
2. 라우트 정리: `/assets`·`/earth`·`/today/debug`·`/design-mockup/*`·`/ux-plan` 삭제,
   `/outer-space` → `/plaza` 개명, 공개 프로필 `/@핸들` 단일화.
3. 공유 승격: api-client·mediaUrl·라이프사이클 유틸 → web-kit, 타입·라우트 상수 → contracts.
4. 빌드 위생: prod 소스맵 off, admin 미사용 의존성 제거. env는 gen-env.mjs 자동 생성.

**신규 화면** (재구축 범위에 포함):
| 앱 | 화면 |
|----|------|
| frontend | 결제 플로우(주문 요약→KYC 임베드→PG 위젯→완료), 마이 탭 [주문/배송], 배송지 입력, **리더 운영 탭**(브리핑·참가자·독려·퀘스트 운영·통계·시즌 복제), 탐색 홈(검색·필터·추천 섹션), 푸시 권한 요청 시트, 서비스워커 푸시 수신·딥링크 |
| admin-frontend | 크리에이터 영역(판매·정산·배송·개설 폼), 슈퍼 영역(환불 승인·정산 실행·온보딩 심사·수수료·KYC·대사 모니터), 배송 관리, 알림 발송 현황 |

---

## 6. 이행 전략

그린필드 병행 구축 → DNS 전환 → 구환경 철거. 새 스택 프리픽스 `chme2-${stage}-*`.

### Phase 0 — 준비·정리 (0.5주)
- 죽은 코드 삭제(§8), docs 통합, 기획서 3종(본 문서·PRODUCT_SPEC·PAYMENT_SPEC) 승인.

### Phase 1 — 골격 (1주)
- 모노레포 전환, packages 스캐폴드, 신규 CDK 앱: 6스택 + user-api "헬스체크+auth"로 dev 수직 관통(G1 검증).
- deploy.mjs v1, 이벤트 버스+notification-worker 골격(인앱 기록까지).

### Phase 2 — 도메인 이전 (4주, 도메인 간 병렬 가능)
의존 역순: ① user(auth/profile/알림 통합/푸시 구독) → ② challenge(+verification·quest·**탐색**)
→ ③ gamification(+lifecycle-manager) → ④ social → ⑤ cheer(+워커·SFN·대시보드, **응원 푸시 연결**) → ⑥ admin(기존 기능분).
각 도메인 완료 기준: core 단위 테스트 + dev 프론트 연동 스모크 + 기존 핸들러 1:1 대조 체크리스트.

### Phase 3 — 커머스 (3주) ← PAYMENT_SPEC M1·M2
- commerce-api: KYC(한국)·주문·참가비형 결제·규정 내 환불·원장/대사. settlement-worker(수동 지급 처리부터).
- admin: 커머스 콘솔·크리에이터 온보딩. frontend: 결제 플로우·주문/배송 화면.
- 완료 기준: dev에서 PG 테스트 결제 왕복(결제→참여→환불→대사) + 금전 무결성 테스트(G6).

### Phase 4 — 리더 도구 + 프론트 정리 (1.5주)
- 리더 운영 탭(브리핑·참가자·리마인드·템플릿·시즌 복제) + §5.4 정리 전체.
- 푸시 권한 UX·방해금지·딥링크 마감.

### Phase 5 — 전환·철거 (1주)
- prod 배포 → www/api.chum7.com DNS 전환 → 구 `chme-*` 스택 destroy, 콘솔 수작업 리소스 삭제,
  구 backend/·구 infra/·ps1 삭제, README 재작성.

### Phase 6 — 커머스 확장 (별도 트랙) ← PAYMENT_SPEC M3·M4
- 보증금형(완주 반환 자동화 — lifecycle 이벤트→settlement-worker), 실물 배송(shipping-tracker·조회 연동).

총 예상: **Phase 0~5 약 11주** (1인 기준, Claude Code 병행 시 단축 여지 큼). Phase 6은 운영 개시 후 순차.

---

## 7. 리스크와 열린 질문

| 리스크 | 완화 |
|--------|------|
| 기능 재현 누락 (122핸들러의 암묵 동작) | 도메인별 1:1 대조 체크리스트 + 기존 테스트 core 이식 |
| 커머스 정합성 사고 (돈만 나가고 참여 안 됨 등) | 웹훅 승인 후 확정 원칙, 원장+일 대사, 부분 실패 자동 취소, CDK 테스트로 권한 격리 검증 |
| 통합 Lambda 콜드스타트 | esbuild 트리셰이킹, 실측 후 필요 시 프로비저닝드 컨커런시 |
| 이벤트 유실 (푸시 미발송) | EventBridge 규칙 DLQ + 재시도, 인앱 기록과 푸시 분리(인앱이 진실 원장) |
| iOS 푸시 도달 한계 (미설치 사용자) | 설치 유도 배너, 응원 도착은 인앱·이메일 폴백 없이 인앱 알림 유지(과설계 방지) |
| 병행 기간 이중 비용 | 전부 서버리스 종량제, Phase 5에서 즉시 철거 |
| PG 심사 리드타임 | Phase 3 착수 전(Phase 1 중) PG·본인확인기관 계약 심사 선행 신청 |

**열린 질문** (해당 Phase 착수 전 확정):

1. ~~중복 화면~~ / ~~탐색~~ / ~~푸시~~ → **v2에서 확정** (PRODUCT_SPEC §3.1, §4.2, §4.10).
2. 플랫폼 수수료율 기본값 / 보증금 실패분 귀속(v1 크리에이터) / PG 최종 선정 / 시작 후 참가비 환불 규정 / 미성년 결제 차단 — `PAYMENT_SPEC.md` §12 (Phase 3 착수 전).
3. Cognito 기존 4그룹 중 `productowners/managers`의 실사용 여부 — 미사용 확인 시 3그룹안 확정.

---

## 8. Phase 0 정리 체크리스트 (즉시 삭제 안전 목록)

- [ ] 루트 CDK 앱: `bin/chum7.ts`, `lib/chum7-stack.ts`, `cdk.json`(루트), `lambda/hello/`, `test/chum7.test.ts`
- [ ] `infra/bin/infra.ts`, `infra/lib/infra-stack.ts` (미참조 스캐폴드)
- [ ] `infra/stacks/dynamodb-stack.ts` (미인스턴스 — 테이블명 충돌 위험 제거)
- [ ] `proto/` 전체 (zip 4개 + 추출본 — 히스토리는 git에 있음)
- [ ] `CREATE_28_LAMBDAS.ps1`, `gsi.json`
- [ ] `scripts/deploy-admin-dev.ps1`, `deploy-admin-prod.ps1`, `create-admin-user.ps1` (빈 껍데기)
- [ ] `infra/README.md` (cdk init 보일러플레이트) → 실제 내용으로 교체
- [ ] `docs2/ docs3/ docs4/` → `docs/`로 통합 (내용 보존, 위치만)
- [ ] README의 CloudFront ID 등 리터럴 기재 제거
