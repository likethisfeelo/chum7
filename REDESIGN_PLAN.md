# CHME 시스템 아키텍처 재구축 기획서

- 작성일: 2026-07-21
- 상태: 초안 (v1)
- 결정사항 반영:
  - **범위**: 인프라 + 배포 체계 + 백엔드를 완전히 재설계. 프론트엔드 2종은 유지하되 구조 정리만 수행
  - **데이터**: 현재 prod는 테스트 수준 → 데이터 마이그레이션 없이 새 환경에서 새로 시작
  - **백엔드 구조**: 엔드포인트당 Lambda 1개(현행 122개) → **도메인별 통합 Lambda + 경량 라우터**
  - **배포**: CI/CD 없이 **로컬 원커맨드 배포**를 크로스플랫폼으로 재구축

---

## 1. 배경과 목표

### 1.1 배경

CHME(chum7.com)는 7일 챌린지 기반 습관 형성 소셜 앱이다. 초기 학습 과정에서 점진적으로
만들어져 다음과 같은 구조적 부채가 누적됐다.

- AWS 콘솔 수작업으로 만든 리소스를 CDK가 import하는 반쪽짜리 IaC → 환경 재현 불가
- 배포가 수동 PowerShell 스크립트이며, 그마저 core 스택만 배포하고 나머지 15개 스택은 기억에 의존
- Lambda 122개 / DynamoDB 테이블 35개 / CDK 스택 17개로 파편화 → 변경 1건의 배포 비용이 큼
- 죽은 코드(루트 CDK 스캐폴드, proto/ 아카이브, 미사용 스택)와 실코드가 뒤섞여 무엇이 진짜인지 파악 곤란

### 1.2 목표

| # | 목표 | 측정 기준 |
|---|------|-----------|
| G1 | **환경 재현성**: 빈 AWS 계정에서 명령 몇 개로 dev/prod 전체 환경 생성 | `npm run deploy -- --stage dev` 만으로 전체 스택 생성 성공 |
| G2 | **원커맨드 배포**: 빌드→검증→배포→프론트 env 주입까지 한 명령 | 배포 절차 문서가 "명령 1개 + prod 확인 입력"으로 축소 |
| G3 | **구조 단순화**: Lambda 122개 → 핸들러 ~15개 이내, 스택 17개 → 6개 이내, 테이블 35개 → 10개 이내 | CDK synth 결과 리소스 수 |
| G4 | **하드코딩 제거**: 계정/리전/배포 ID가 코드 어디에도 리터럴로 존재하지 않음 | grep 검사 스크립트 통과 |
| G5 | **죽은 코드 0**: 리포에 실행 경로 없는 코드/문서가 남지 않음 | 정리 체크리스트(§8) 완료 |

### 1.3 비목표 (이번에 하지 않는 것)

- 프론트엔드 전면 재작성 (구조 정리만, §5.4)
- 기능 추가/변경 — 현재 제품 기능은 그대로 재현한다
- 데이터 마이그레이션 — 새 환경에서 새로 시작
- CI/CD 파이프라인 구축 — 로컬 배포 개선까지만 (단, 나중에 CI를 얹기 쉬운 형태로 설계)
- 멀티리전/대규모 트래픽 대응 — 테이블 키 설계에서 스캔 제거 수준의 확장성만 확보

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
IaC:    CDK 17스택 (infra/bin/chme.ts) + 죽은 CDK 앱 2개(루트, infra/bin/infra.ts)
배포:   PowerShell 수동 (deploy-dev.ps1은 core 스택만 배포)
```

### 2.2 핵심 문제점

| 영역 | 문제 | 근거 위치 |
|------|------|-----------|
| 배포 | CI 없음. 공식 스크립트가 17개 중 core 스택만 배포. 나머지는 수동 `cdk deploy` | `scripts/deploy-dev.ps1` |
| 배포 | 프론트 배포 경로 2개 경합 (스크립트 `s3 sync` vs CDK `BucketDeployment`) | `scripts/deploy-*.ps1` vs `infra/stacks/frontend-stack.ts` |
| 배포 | 관리자 프론트 배포/관리자 생성 스크립트가 빈 껍데기 | `scripts/deploy-admin-*.ps1`, `create-admin-user.ps1` |
| IaC | CDK 앱 3개 병존(실제 1 + 죽은 스캐폴드 2). 유일한 CDK 테스트가 죽은 스택 검증 | 루트 `bin/chum7.ts`, `infra/bin/infra.ts`, `test/chum7.test.ts` |
| IaC | CoreStack 메가스택: 테이블 35개+Cognito+SNS+EventBus를 한 스택에 두고 15개 스택에 전파 | `infra/stacks/core-stack.ts` |
| IaC | 스택 경계가 도메인이 아닌 "테이블 grant 편의" 기준 (마당 Lambda가 verification-stack에, 알림·배너가 challenge-stack에) | `infra/stacks/verification-stack.ts`, `challenge-stack.ts` |
| 설정 | 계정 ID·리전·CloudFront ID 하드코딩. **DEV CloudFront ID가 config와 스크립트에서 서로 다름** (`ESKW3DS5HUUK9` vs `ESKW3DSSHIUK9`) | `infra/config/dev.ts` vs `scripts/deploy-dev.ps1`, `README.md` |
| 설정 | S3/CloudFront/Cognito가 콘솔 수작업 생성 후 import → 재현 불가. prod Cognito `RemovalPolicy.DESTROY` | `infra/stacks/core-stack.ts:102`, `frontend-stack.ts` |
| 설정 | cheer-stack이 synth 시점의 쉘 `process.env`에 의존 → 비재현적 빌드, rate-limit이 조용히 스캔 폴백 | `infra/stacks/cheer-stack.ts` |
| 백엔드 | 공유 레이어 형해화: 핸들러 122개 중 75개가 `response()` 자체 복사, 107개가 DynamoDB 클라이언트 각자 생성, 88개가 JWT 클레임 인라인 파싱 | `backend/services/**`, `backend/shared/lib/*` |
| 백엔드 | `notification/` vs `notifications/` 서비스 폴더 중복 | `backend/services/` |
| 데이터 | 핫패스 풀스캔(챌린지 목록 등) + JS 정렬. `category-index`/`-v2` 반쯤 끝난 GSI 마이그레이션 | `backend/services/challenge/list/index.ts` |
| 데이터 | 미사용 인프라: Stream 5개 테이블(컨슈머 없음), EventBus(규칙 없음), SNS(구독 Lambda 없음) | `infra/stacks/core-stack.ts` |
| 잔재 | `proto/`(초기 계획+zip 아카이브), `CREATE_28_LAMBDAS.ps1`, `gsi.json`, `infra/stacks/dynamodb-stack.ts`(미인스턴스, 배포 시 테이블명 충돌 위험), 문서 루트 5개(docs~docs4) 산재 | 리포 루트 |
| 프론트 | 1,000~1,500줄 페이지 파일, `any` 263곳, 두 앱 간 라이프사이클/API 클라이언트 중복, 사용자 앱에 admin 라우트 혼입, 권한 모델 2개 병존, prod 소스맵 노출 | `frontend/`, `admin-frontend/` |

---

## 3. 목표 아키텍처 (To-Be)

### 3.1 리포 구조 — npm workspaces 모노레포

기존 리포를 정리하지 않고 **새 디렉터리 트리를 병행 구축 후 교체**한다(§6 이행 전략).
새 도구 도입을 최소화하기 위해 npm workspaces를 사용한다 (pnpm/turborepo 불채택).

```
chum7/
├── package.json              # workspaces 루트, 공통 스크립트
├── tsconfig.base.json
├── packages/
│   ├── core/                 # 순수 도메인 로직 + 타입 (AWS 의존 없음)
│   │   └── src/{challenge,verification,cheer,social,gamification,user}/
│   ├── api-kit/              # Lambda 런타임 공통: Hono 앱 팩토리, 인증 미들웨어,
│   │   └── src/              #   에러 핸들러, DynamoDB 클라이언트, 응답 envelope, 로거
│   └── contracts/            # FE↔BE 공유: API 요청/응답 타입, zod 스키마, 라우트 상수
├── services/                 # 배포 단위 = Lambda 1개
│   ├── user-api/             # auth, profile, personal-feed, notification(통합), settings
│   ├── challenge-api/        # challenge, verification(remedy 포함), quest
│   ├── social-api/           # plaza, challenge-board, challenge-feed, bulletin, hashtag
│   ├── cheer-api/            # cheer 전체
│   ├── gamification-api/     # badge, character, today(world-summary)
│   ├── admin-api/            # 관리자 콘솔 전용 (별도 Lambda로 권한 경계 분리)
│   └── workers/              # 스케줄/비동기 (엔트리별 개별 Lambda)
│       ├── lifecycle-manager/
│       ├── cheer-scheduler/
│       ├── plaza-converter/
│       └── cheer-stats-materializer/
├── infra/                    # CDK 앱 1개 (유일한 IaC)
│   ├── bin/app.ts
│   ├── config/stages.ts      # 타입 있는 스테이지 설정 (하드코딩 리터럴 금지)
│   └── stacks/               # §3.4 참조 — 6개 스택
├── frontend/                 # 기존 유지 + 정리 (§5.4)
├── admin-frontend/           # 기존 유지 + 정리
├── scripts/
│   ├── deploy.mjs            # 크로스플랫폼 원커맨드 배포 (§4)
│   ├── gen-env.mjs           # CDK Outputs → frontend .env 자동 생성
│   └── ops/                  # 백필 등 운영 스크립트 (Node .mjs로 통일, sh/ps1 이중화 폐지)
├── docs/                     # 문서 단일 루트 (§8에서 docs2~4 통합)
└── test/                     # 도메인 단위 테스트는 packages/core로 이동, 통합 테스트만 유지
```

**설계 원칙**

1. **비즈니스 로직은 `packages/core`에, AWS는 가장자리에.** 핸들러는 "HTTP 파싱 → core 함수 호출 → 응답" 3줄 구조. 현재 122개 핸들러에 흩어진 로직 중 `backend/shared/lib`의 도메인 로직(challenge-state, day-sync, progress, badge-grant 등)이 core의 씨앗이 된다. 기존 단위 테스트(~30개 파일)는 core로 따라 이동한다.
2. **`packages/contracts`로 FE·BE 타입 단일화.** 현재 `shared/join-requirements.ts` 하나뿐인 공유를 전 API로 확대. zod 스키마로 요청 검증과 타입을 동시에 얻는다. 프론트 `any` 263곳 축소의 기반.
3. **중복 유틸 3벌+인라인 75벌 → `packages/api-kit` 1벌.** response envelope, CORS, getUserId, DynamoDB DocumentClient 싱글턴, 페이지네이션 토큰, 로거를 여기서만 정의.

### 3.2 백엔드 — 도메인별 통합 Lambda

**라우터: Hono** (경량·TS-first·API Gateway v2 어댑터 내장·esbuild 번들 친화).

- API Lambda 6개(user/challenge/social/cheer/gamification/admin) + 워커 4개 = **Lambda ~10개** (기존 122개).
- 라우팅: API Gateway에는 `ANY /u/{proxy+}` → user-api 식의 **도메인 프리픽스 프록시 라우트**만 등록.
  세부 경로는 Hono가 처리 → 엔드포인트 추가 시 CDK 변경 불필요, `addRoutes` 145회 호출 소멸.
- 인증: JWT Authorizer는 API Gateway에 유지(현행과 동일). 퍼블릭 경로(챌린지 목록, 마당 피드,
  배너)는 authorizer 없는 별도 프록시 라우트(`GET /public/{proxy+}`)로 분리해 명시적으로 관리.
- 관리자 권한: admin-api Lambda를 분리하고 미들웨어에서 Cognito 그룹(`admins` 등)을 일괄 검증.
  현재의 "핸들러마다 제각각 검사 + 이메일 allowlist" 이원 체계를 **Cognito 그룹 단일 체계**로 통일.
- 미들웨어 체인(api-kit 제공): requestId/구조화 로깅 → 인증 컨텍스트 주입 → zod 검증 → 에러→HTTP 매핑.
- 트레이드오프 인지: 함수별 최소 IAM은 도메인 단위로 완화된다(예: challenge-api는 challenge·verification·quest
  테이블 전체 권한). 도메인 경계가 곧 권한 경계가 되며, admin-api 분리로 가장 위험한 표면은 격리한다.

**API 경로 재편**: 기존 경로를 도메인 프리픽스 아래로 이동하되, 프론트 API 클라이언트에서
경로 상수를 `packages/contracts`로 옮겨 한 곳만 수정하면 되게 한다. (기존 URL 호환은 불필요 — 데이터/사용자 새 출발이므로.)

### 3.3 데이터 모델 — 테이블 35개 → 도메인별 8개

데이터를 보존하지 않으므로 키 설계를 자유롭게 재편한다. 완전한 single-table로 가지 않고
**바운디드 컨텍스트당 1테이블**(제네릭 PK/SK + 엔티티 타입 프리픽스)로 절충한다 —
학습 곡선과 디버깅 편의, 도메인 경계 유지가 이유다.

| 테이블 | 담는 엔티티 (기존 테이블) | 대표 액세스 패턴 |
|--------|---------------------------|------------------|
| `users` | users, notifications(수신함), notification-settings | 프로필 조회, 알림함 시간순 |
| `challenges` | challenges, user-challenges, verifications, payout-audit-logs | 카테고리·라이프사이클별 목록(GSI, **스캔 제거**), 참가자별 인증 day 조회 |
| `social` | plaza-posts/comments/reactions/recommendations, challenge-boards/comments/previews, bulletin-*, verification-comments/reactions, hashtags, hashtag-follows | 피드 시간순, 게시물별 댓글/리액션, 해시태그 피드 |
| `graph` | feed-follows, feed-blocks, feed-invite-links, personal-posts, saved-posts | 팔로워/팔로잉 양방향, 차단 조회 |
| `cheer` | cheers, cheer-dead-letters(TTL), cheer-stats | 수신/발신자별, 예약분(status+time), DLQ 재처리 |
| `gamification` | badges, characters, quests, quest-submissions, active-quest-submissions, personal-quest-proposals | 사용자별 뱃지/캐릭터, 퀘스트별 제출물 심사 |
| `content` | category-banners + 향후 운영 콘텐츠 | slug별 활성 배너 |
| `ops` | 감사 로그, 운영 카운터/락 | 시간순 감사 조회 |

- 모든 테이블 PAY_PER_REQUEST, prod는 PITR + RETAIN (Cognito 포함 — 현행 `DESTROY` 결함 수정).
- GSI는 액세스 패턴 표에서 도출해 명명 규칙 `gsi1`,`gsi2`…로 통일. `-v2` 식 버전 네이밍 금지.
- **풀스캔 금지 원칙**: 목록성 조회는 반드시 파티션 키 또는 GSI Query로. 챌린지 목록은
  `lifecycle#category`를 GSI PK로 두는 식으로 해결(스캔+JS 정렬 제거).
- Stream/EventBus/SNS는 **소비자가 생기는 시점에 켠다**. 초기 스택에서는 생성하지 않음
  (알림은 현행대로 DynamoDB 직접 기록 유지).

### 3.4 인프라 — CDK 앱 1개, 스택 6개

```
infra/bin/app.ts  →  스테이지(dev|prod)당:

1. StatefulStack      DynamoDB 8테이블, Cognito(UserPool+그룹 4종), S3(uploads/static/admin-static)
                      — 데이터를 갖는 리소스만. RETAIN(prod). 배포 빈도 최저.
2. CertStack          us-east-1: CloudFront용 ACM 인증서 (cross-region 참조)
3. EdgeStack          CloudFront 2개(app/admin) + Route53 레코드 + OAC + /uploads/* 비헤이비어
                      — 전부 CDK가 생성. import·custom resource 없음 → cf-uploads-behavior 커스텀 리소스 폐지.
4. ApiStack           HTTP API + JWT Authorizer + API Lambda 6개 + 프록시 라우트 + 커스텀 도메인
5. WorkersStack       스케줄 워커 4개 + EventBridge Rule + Step Functions(통계) + DLQ 알람
6. ObservabilityStack CloudWatch 대시보드·알람·SNS(ops 알림 이메일)
```

- **의존 방향 단선화**: Stateful ← Api/Workers, Cert ← Edge. 교차 참조는 props로 명시.
  CoreStack식 "모든 것을 하나에" 폐지.
- **하드코딩 제거**: 계정/리전은 `CDK_DEFAULT_ACCOUNT/REGION`(프로파일 기반), 도메인·존은
  `config/stages.ts`의 타입 있는 설정으로. CloudFront ID 같은 산출값은 코드에 쓰지 않고
  **CfnOutput → 배포 스크립트가 소비**(§4). `config: any` 금지 — `StageConfig` 인터페이스 필수.
- **synth 시 `process.env` 읽기 금지**: cheer-stack식 환경변수 분기를 전부 `stages.ts`로 이동.
  같은 커밋 = 같은 synth 결과 보장.
- 신규 리소스는 콘솔이 아닌 CDK가 처음부터 생성 → import 브리틀함과 "콘솔 체크리스트" 소멸.
  단, **Route53 호스티드 존(chum7.com)만 기존 것을 lookup**으로 참조(도메인은 계정 자산).
- CDK 테스트: 각 스택 assertion 테스트(테이블 수, RETAIN 정책, authorizer 유무, 스캔 권한 미부여 등)를
  `infra/test`에 두고 배포 전 필수 게이트로 실행.

### 3.5 관측성

- api-kit 로거로 구조화(JSON) 로그 통일 → CloudWatch Logs Insights 쿼리 가능.
- 도메인 Lambda 6개 + 워커 4개 각각 에러율/지연 알람 (기존: 122개 함수라 알람 체계 사실상 불가).
- 기존 cheer 대시보드·위젯 카탈로그 lint(`validate-cheer-widget-catalog.mjs`)는 유지·이식.

---

## 4. 배포 체계 — 로컬 원커맨드 (크로스플랫폼)

PowerShell/bash 이중화를 폐지하고 **Node 스크립트(`scripts/deploy.mjs`) 하나**로 통일한다.
Windows/macOS/Linux 어디서든 동일하게 동작한다.

```bash
npm run deploy -- --stage dev                 # 전체 (기본)
npm run deploy -- --stage dev --only api      # API Lambda만
npm run deploy -- --stage dev --only frontend # 프론트 빌드+업로드만
npm run deploy -- --stage prod                # 'DEPLOY' 타이핑 확인 후 진행
npm run deploy -- --stage dev --diff          # 배포 없이 cdk diff만
```

**파이프라인 (deploy.mjs 내부 순서)**

```
1. 검증   typecheck (전 워크스페이스) → 단위 테스트 → CDK 스택 테스트
2. 빌드   frontend/admin-frontend vite build (--only 대상에 따라 생략)
3. diff   cdk diff 요약 출력 (prod는 여기서 'DEPLOY' 확인 입력)
4. 배포   cdk deploy --all --require-approval never (frontend는 BucketDeployment 경유
          단일 경로 — 수동 s3 sync 경로 폐지, 캐시 정책·invalidation도 CDK가 소유)
5. 산출   CfnOutputs(JSON) → scripts/gen-env.mjs가 frontend/.env.{stage} 자동 생성
          (Cognito ID·API URL 수동 복사 절차 소멸 — 현행 README 체크리스트 제거)
6. 리포트  스택별 결과·소요시간·주요 Output 요약 출력
```

**안전장치**

- prod: 확인 입력 + `--diff` 결과에 Stateful 리소스 삭제/치환이 포함되면 **강제 중단**(명시 플래그로만 통과).
- 검증 실패 시 배포 진입 자체를 차단 (현행: 테스트가 배포와 무관하게 방치).
- 모든 값은 CDK Output에서 읽는다 — 배포 ID를 스크립트에 다시 적는 순간 드리프트가 재발하기 때문
  (현행 CloudFront ID 불일치 사고의 재발 방지).

**운영 스크립트**: 백필·재처리류는 전부 `.mjs`로 통일해 `scripts/ops/`로 이동,
`npm run ops:<이름>`으로 노출. sh/ps1 병행 유지 폐지.

**관리자 계정 생성**: 빈 스크립트 대신 `npm run ops:create-admin -- --email ...`
(Cognito AdminCreateUser + 그룹 배정)을 실제 구현.

---

## 5. 컴포넌트별 계획

### 5.1 packages/core — 도메인 로직 이식

`backend/shared/lib`의 검증된 로직을 도메인별로 재배치하고, 핸들러에 인라인된 로직을 끌어올린다.
이식 우선순위는 테스트가 이미 있는 모듈부터: challenge-state / day-sync / progress /
verification-normalization / media-validation / cheer 스케줄링 / badge-grant / quest-policy.

### 5.2 서비스 6+4 구성 (기존 122개 매핑)

| 신규 서비스 | 흡수하는 기존 서비스 폴더 | 비고 |
|-------------|---------------------------|------|
| user-api | auth, personal-feed, notification, **notifications(통합)**, profile 계열 | notification/notifications 이원화 해소 |
| challenge-api | challenge, verification, quest(사용자측) | give-up이 verification-stack에 있던 배치 오류 해소 |
| social-api | plaza, challenge-board, challenge-feed, bulletin, hashtag | plaza가 스택 없이 verification-stack에 얹혀있던 문제 해소 |
| cheer-api | cheer (동기 API 부분) | |
| gamification-api | badge, character, today, category-banners(읽기) | |
| admin-api | admin 전체 + quest 심사 + 배너 관리 | 권한 경계 분리 목적의 독립 Lambda |
| workers/* | lifecycle-manager, cheer/send-scheduled, plaza/convert-verifications, cheer/stats-materializer | 스케줄 트리거는 현행 주기 유지 |

### 5.3 인증·권한 단일화

- 역할 체계: Cognito 그룹 `admins / operators / leaders` 로 정리 (현행 4그룹+이메일 allowlist+role 문자열 혼재 → 그룹 단일화).
- 사용자 프론트의 `VITE_ADMIN_EMAILS` allowlist 폐지, JWT 그룹 클레임만 사용.
- 토큰 갱신 로직은 사용자 앱 것을 api-client 공통 모듈로 승격해 관리자 앱도 사용(현재 관리자 앱은 401 시 즉시 로그아웃).

### 5.4 프론트엔드 정리 (재작성 아님)

1. **admin 코드 분리**: `frontend/src/features/admin` 및 `/admin/*` 라우트를 admin-frontend로 이동 — 사용자 번들에서 관리자 표면 제거.
2. **공유 승격**: challengeLifecycle 유틸, api-client(인터셉터 포함), mediaUrl, 라이프사이클 라벨을 `packages/contracts`(타입)와 신설 `packages/web-kit`(런타임)으로 이동해 두 앱이 공유.
3. **API 경로/타입을 contracts 기준으로 교체** — `any` 축소는 이 과정에서 자연 발생하는 만큼만 (전면 타입 개보수는 비목표).
4. **죽은 라우트 정리**: `/earth` 리다이렉트, `/today/debug`, `/design-mockup/*`, `/ux-plan` 제거. `/me` vs `/my`, `/profile` vs `/assets`는 **정리 전 사용자 확인 필요**(§7 열린 질문).
5. **빌드 위생**: prod 소스맵 비활성, admin의 미사용 의존성(cognito SDK, zustand) 제거.
6. env 파일은 gen-env.mjs가 생성하므로 수동 관리 소멸.

---

## 6. 이행 전략

데이터를 보존하지 않으므로 **병행 구축 → DNS 전환 → 구환경 철거**의 그린필드 전략을 쓴다.
새 스택 프리픽스는 `chme2-${stage}-*` (구 `chme-${stage}-*`와 공존 가능, 이름 충돌 없음).

### Phase 0 — 준비·정리 (0.5주)
- 죽은 코드 즉시 삭제(§8 체크리스트): 루트 CDK 앱, proto/, CREATE_28_LAMBDAS.ps1, dynamodb-stack.ts 등 — 재구축과 무관하게 지금 해도 안전한 것들.
- docs~docs4 → docs/ 단일 루트로 통합, 스테일 문서는 docs/archive/로.
- 이 기획서 승인.

### Phase 1 — 골격 (1주)
- 모노레포 워크스페이스 전환, packages/{core,api-kit,contracts} 스캐폴드.
- 신규 infra CDK 앱: Stateful/Cert/Edge/Api 스택 + user-api "헬스체크 + auth" 만으로 dev에 수직 관통 배포 성공(G1 검증).
- deploy.mjs v1 (검증→diff→배포→gen-env).

### Phase 2 — 도메인 이전 (3~4주, 도메인당 병렬 가능)
이전 순서는 의존성 역순: ① user(auth/profile/notification) → ② challenge(+verification, quest)
→ ③ gamification(badge/character/today — 라이프사이클 워커 포함) → ④ social(plaza/board/feed/bulletin/hashtag)
→ ⑤ cheer(+워커/SFN/대시보드) → ⑥ admin.
각 도메인 완료 기준: core 단위 테스트 통과 + dev 환경에서 프론트 연동 스모크 확인.

### Phase 3 — 프론트 정리 & 전환 (1주)
- §5.4 수행, 프론트가 신규 API 경로 사용.
- prod 배포 → www/api.chum7.com DNS를 신규 Edge/Api로 전환(테스트 수준 트래픽이므로 단순 전환).

### Phase 4 — 철거 (0.5주)
- 구 `chme-${stage}-*` 스택 destroy, 콘솔 수작업 리소스(구 CloudFront/S3/Cognito) 삭제.
- 구 backend/, infra/stacks(구), scripts/*.ps1 삭제. README를 신규 체계로 재작성.

총 예상: **6~7주** (1인 기준, Claude Code 병행 시 단축 여지 큼).

---

## 7. 리스크와 열린 질문

| 리스크 | 완화 |
|--------|------|
| 기능 재현 누락 (122핸들러의 암묵 동작) | 도메인 이전 시 기존 핸들러를 1:1 대조하는 체크리스트 작성. 기존 테스트를 core로 이식해 회귀 검출 |
| 통합 Lambda 콜드스타트 비대화 | esbuild 트리셰이킹 + 도메인 분리로 번들 상한 관리. 실측 후 필요 시 프로비저닝드 컨커런시 |
| 병행 기간 이중 비용 | 전부 PAY_PER_REQUEST/서버리스라 유휴 비용 미미. Phase 4에서 즉시 철거 |
| Hono 학습 비용 | 미들웨어 3~4개 수준의 최소 사용. api-kit이 감싸서 핸들러 작성자는 라우터를 거의 인식 안 함 |
| prod 전환 실수 | Stateful 삭제 감지 시 강제 중단 가드 + prod 확인 입력 |

**열린 질문 (구현 착수 전 확인 필요)**

1. `/me` vs `/my`, `/profile` vs `/assets` 중 살릴 방향 — 제품 의도 확인 필요.
2. 리더 payout/보증금이 실결제인지 포인트인지 — 실결제라면 admin-api에서 정산 로직을 추가 격리하고 감사 로그 강화.
3. SNS/EventBus/Stream을 걷어내는데, 가까운 로드맵에 푸시 알림 등 이벤트 소비 계획이 있다면 WorkersStack에 자리만 예약.
4. Cognito 그룹 4종(admins/productowners/leaders/managers) 중 실제 사용하는 역할.

---

## 8. Phase 0 정리 체크리스트 (즉시 삭제 안전 목록)

- [ ] 루트 CDK 앱: `bin/chum7.ts`, `lib/chum7-stack.ts`, `cdk.json`(루트), `lambda/hello/`, `test/chum7.test.ts`
- [ ] `infra/bin/infra.ts`, `infra/lib/infra-stack.ts` (미참조 스캐폴드)
- [ ] `infra/stacks/dynamodb-stack.ts` (미인스턴스 — 배포 시 테이블명 충돌 위험 제거)
- [ ] `proto/` 전체 (zip 4개 + 추출본 — 히스토리는 git에 있음)
- [ ] `CREATE_28_LAMBDAS.ps1`, `gsi.json`
- [ ] `scripts/deploy-admin-dev.ps1`, `deploy-admin-prod.ps1`, `create-admin-user.ps1` (빈 껍데기)
- [ ] `infra/README.md` (cdk init 보일러플레이트) → 실제 내용으로 교체
- [ ] `docs2/ docs3/ docs4/` → `docs/`로 통합 (내용 보존, 위치만)
- [ ] README의 CloudFront ID 등 리터럴 기재 제거 (드리프트 원천 차단)
