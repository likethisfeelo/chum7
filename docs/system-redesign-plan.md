# CHUM7 시스템 재설계 기획서

- 작성일: 2026-07-21
- 목적: 학습 초기에 만들어진 현행 시스템을 전면 파악한 결과를 바탕으로, **배포가 편하고(Developer Experience), 구조가 견고하고 논리적인(Architecture)** 새 시스템으로 재구축하기 위한 계획을 정의한다.
- 범위: 인프라(CDK)·백엔드·데이터 모델·프론트엔드 2종·배포 파이프라인·문서 체계 전체.
- 이 문서의 §2(내가 이해한 것)와 §7(결정 필요 사항)은 작성자(Claude)가 코드를 읽고 파악한 내용과, 의도가 불분명해 확인이 필요한 항목을 명시한 것이다. **§7 답변에 따라 본 기획서는 수정될 수 있다.**

---

## 1. 현행 시스템 진단 (As-Is)

### 1.1 제품 개요

CHME(Challenge Earth with ME, chum7.com)는 **7일 습관 챌린지 PWA**다. 사용자는 챌린지에 참여해 매일 인증(verification)을 제출하고, 델타(Δ = 목표시간 − 실제완료시간) 기반의 **응원(cheer)/감사(thank) 경제**, 보완(remedy), 캐릭터/배지 게이미피케이션, 광장(plaza)·개인 피드 등 소셜 기능을 사용한다. 사용자 앱과 관리자 앱 두 개의 프론트엔드가 같은 API를 사용한다.

### 1.2 현행 구성 요약

| 영역 | 현황 |
|---|---|
| 인프라 | AWS 서울 리전, **dev/prod가 동일 계정(532393804562)**, CDK 앱이 저장소에 **3개** 존재(실제는 `infra/bin/chme.ts` 하나, 나머지 둘은 hello-world/빈 스캐폴드) |
| CDK 스택 | 17개 스택. Core 스택이 Cognito + **DynamoDB 테이블 35개**를 독점 정의, 나머지 스택이 in-process로 참조 → CloudFormation cross-stack export 거미줄 |
| 백엔드 | 서비스 디렉터리 17개, **핸들러(=Lambda) 122개**. 라우트 1개 = Lambda 1개 패턴. 공유 라이브러리(`backend/shared/lib`)가 있으나 대부분의 핸들러가 자체 response/DynamoDB 클라이언트를 복붙 |
| 데이터 | 테이블-퍼-엔티티 35개, GSI 전부 ProjectionType.ALL, 단일 테이블 설계 없음. 4개 테이블에 스트림이 켜져 있으나 **소비자 없음** |
| 비동기 | EventBridge 스케줄 3종(라이프사이클 1h, 응원 발송 5m, 광장 변환 1h) + cheer 통계용 **Step Functions 병렬 스캔 오케스트레이터**. SQS·이벤트 버스 라우팅 없음 |
| 프론트 | React 18 + Vite SPA 2개. axios 클라이언트가 두 앱에 복붙된 뒤 서로 다르게 진화(사용자 앱만 토큰 리프레시·타임존 헤더 보유). 1,000~1,500줄짜리 페이지 컴포넌트 다수 |
| 배포 | **CI/CD 없음.** Windows PowerShell 스크립트가 프론트는 수동 `aws s3 sync`, 백엔드는 core 스택만 CDK 배포(나머지 15개 스택은 별도 수동 `cdk deploy`). admin 배포 스크립트는 **빈 파일** |
| 도메인/CDN | CloudFront·업로드 버킷·API 커스텀 도메인이 **콘솔 수동 관리**(CDK 밖). 커스텀 리소스 Lambda가 배포 시점에 CloudFront를 직접 변조 |
| 문서 | `docs/`, `docs2/`, `docs3/`, `docs4/`, `proto/guides-docs/` 5곳에 분산. `proto/`에 초기 프로토타입 zip + 압축해제본이 통째로 커밋(1.2MB) |

### 1.3 핵심 문제 진단

**A. 배포가 불편한 근본 원인**
1. "전체를 배포하는 단일 경로"가 없다. 프론트(수동 CLI) / core 스택(CDK) / 나머지 15개 스택(별도 CDK) / admin(스크립트 없음)이 제각각이라, 코드와 인프라가 어긋난 채 배포되기 쉽다.
2. CloudFront·API 도메인 등 핵심 리소스가 콘솔 수동 관리라서 CDK만으로 환경을 재현할 수 없다. 실제로 dev CloudFront ID가 config(`ESKW3DS5HUUK9`)와 스크립트/README(`ESKW3DSSHIUK9`)에서 서로 다르게 적혀 있는 드리프트가 존재한다.
3. CheerStack 등이 **synth 시점에 배포자 셸의 `process.env`를 읽어** 라우트/권한이 조건부로 달라진다 → 머신마다 synth 결과가 다른 비결정적 배포.
4. Lambda 122개를 각각 esbuild 번들링 → `cdk deploy`가 느리고 CloudWatch 로그 그룹이 난립(대부분 만료 미설정).

**B. 구조가 덕지덕지가 된 근본 원인**
1. 스택 경계와 도메인 경계 불일치: plaza가 verification-stack에, notification 목록이 challenge-stack에, notification 설정이 personal-feed-stack에 들어있다. `notification`/`notifications` 디렉터리가 별개로 존재.
2. 공유 계층 우회: `api-response.ts` 사용 9곳 vs 자체 `response()` 정의 ~94곳, DynamoDB 클라이언트 인라인 생성 108곳. 에러 형식·CORS·페이지네이션 토큰이 핸들러마다 다르다.
3. 관리자 로직이 도메인 서비스를 호출하지 않고 `admin/` 아래 병렬 구현으로 존재 → 드리프트 위험. 관리자 권한 검사도 핸들러마다 인라인 재구현(13곳).
4. 죽은 코드가 실코드와 섞여 있음: 루트 CDK 앱, `infra/stacks/dynamodb-stack.ts`(실 테이블과 **이름이 충돌하는** 미사용 스택 — 배포 시 사고 지뢰), `gsi.json`, `CREATE_28_LAMBDAS.ps1`(하드코딩된 초기 수동 생성 스크립트), `proto/` 전체, `function.zip` 커밋본.
5. 네이밍 3중화: `chum7`(저장소·도메인·업로드 버킷) / `chme`(리소스 프리픽스) / `CHME`(문서). dev와 prod의 버킷 네이밍 체계도 서로 다름(`chme-dev` vs `chum7-prod-static`).

**C. 데이터 모델**
1. 마이그레이션 잔재: challenges 테이블에 `category-index`와 `category-index-v2`가 공존("Stage 2에서 삭제" 주석만 있고 미실행).
2. 경계 불명: `quest-submissions` / `active-quest-submissions` / `personal-quest-proposals` 3개 테이블이 하나의 라이프사이클을 나눠 갖는데 기준 문서가 없다.
3. 스트림 4개가 켜져 있으나 소비자가 없어 순수 비용.
4. cheer 도메인 하나가 테이블 4개 + Step Functions + 데드레터 서브시스템 + 문서 14편을 가진 과잉 설계(2인 응원 플로우 대비).

**D. 프론트엔드**
1. API 클라이언트·미디어 URL 유틸·타입이 두 앱에 복붙-분화. admin 앱은 토큰 리프레시가 없어 만료 시 강제 로그아웃.
2. 인증 모델 이원화: 사용자 앱(zustand + 이메일 allowlist)과 admin 앱(localStorage + 클라이언트측 JWT 그룹 파싱).
3. 페이지 컴포넌트가 데이터 페칭·비즈니스 정책·UI를 한 파일에 담음(ChallengeFeedPage 1,553줄 등).
4. 목업 페이지(`/design-mockup/*`), 디버그 페이지(`/today/debug`), 기획 페이지(`/ux-plan`)가 프로덕션 번들에 포함.
5. FE/BE 공유 코드는 루트 `shared/join-requirements.ts` 단 1개 파일이며, 프론트가 6단계 상대경로로 import하는 취약한 연결.

**E. 안전성 리스크 (재설계와 무관하게 인지 필요)**
- Cognito User Pool에 `removalPolicy: DESTROY`가 **prod 포함** 걸려 있음 → 스택 삭제 시 전 사용자 계정 소실.
- dev/prod 동일 계정이라 dev 실수가 prod 리소스를 건드릴 수 있음.

---

## 2. 내가 이해한 것 (파악 요약과 전제)

재설계 제안의 전제가 되는 이해다. 틀린 부분이 있으면 §7 답변 시 교정해 달라.

1. **제품의 심장은 challenge–verification–cheer 삼각형**이다. 챌린지 타입(`leader_only`/`personal_only`/`leader_personal`)이 완료 판정을 결정하고, Δ(델타)는 점수가 아니라 응원 시스템에만 쓰이며, 감사점수(thankScore)는 최신 설계(docs4)에서 알림 발송과 분리되어 `send-scheduled`에서 적립된다.
2. **현재 유효한 도메인 스펙**은 `docs2/01-challenge-types.md`, `docs2/03-data-models.md`, `docs/challenge-feed-domain-glossary.md`, `docs/adr-0001`, `docs4/cheer-latest.md`이고, `proto/`와 구버전 cheer 문서들은 폐기 대상이다.
3. **테스트가 지키는 행동**은 챌린지 라이프사이클/일차 동기화 수학과 cheer 서브시스템에 집중되어 있다. 이 로직들은 재설계 시 "재작성"이 아니라 **"이식"** 대상이다(동작 보존). 반면 CRUD 성격의 서비스(bulletin, personal-feed, character, board 등)는 테스트가 없어 재작성 자유도가 높다.
4. Day 경계는 **KST 고정**이 의도된 설계이고, 표시 타임존만 브라우저 기준으로 바꾸는 것이 docs3의 방향이다(사용자별 Day 경계는 명시적으로 미래 과제).
5. 배포 실태: 실제 서비스가 어떤 경로로 배포되어 왔는지는 혼합적이다 — 초기에 `CREATE_28_LAMBDAS.ps1`로 수동 생성된 Lambda와 이후 CDK가 만든 Lambda가 **이름이 미묘하게 달라**(`auth-refresh` vs `auth-refresh-token` 등) 계정에 고아 함수가 남아 있을 가능성이 있다.
6. 프론트 환경파일(`.env.dev/.env.prod`)은 git에 없으므로, 실제 Cognito ID·API URL 등 라이브 값은 로컬에만 존재한다.

---

## 3. 재설계 목표와 원칙

### 목표
1. **원커맨드 배포**: `git push` → CI가 테스트·synth·배포까지. 로컬 PowerShell 의존 제거.
2. **환경 재현성**: 계정에 있는 모든 리소스가 코드(CDK)로 정의됨. 콘솔 수동 관리 0.
3. **논리적 경계**: 도메인(bounded context) = 코드 디렉터리 = 인프라 배포 단위 = 문서 단위가 1:1로 일치.
4. **한 번만 정의**: 타입·API 계약·정책 로직은 FE/BE가 한 소스에서 공유.
5. **운영 안전**: 스테이지 격리, 데이터 리소스 RETAIN, 관측성 표준화.

### 원칙
- **Stack은 배포 단위, Construct는 도메인 단위.** 스택을 도메인마다 쪼개서 생긴 cross-stack export 지옥을 반복하지 않는다. 스택은 5~6개로 고정하고, 도메인은 스택 내부의 Construct로 조립한다.
- **stateful과 stateless 분리.** 데이터(테이블·버킷·Cognito)는 전용 스택에 격리하고 RETAIN, 컴퓨트는 자유롭게 부수고 재배포.
- **synth는 결정적으로.** `process.env` 기반 조건부 synth 금지. 스테이지 설정은 타입세이프 config 파일 + cdk context로만.
- **점진 전환(Strangler).** 빅뱅 전환 대신 새 시스템을 병행 구축하고 도메인 단위로 트래픽을 옮긴다. 검증된 라이프사이클/cheer 로직과 테스트는 이식한다.
- **네이밍 단일화.** 제품/리소스 프리픽스를 `chum7` 하나로 통일한다(`chme` 폐기). ※ §7-Q8

---

## 4. 목표 아키텍처 (To-Be)

### 4.1 저장소 구조 — 워크스페이스 모노레포

```
chum7/
├── apps/
│   ├── web/                  # 사용자 PWA (기존 frontend)
│   └── admin/                # 관리자 SPA (기존 admin-frontend)
├── packages/
│   ├── domain/               # ★ 도메인 타입·정책 로직·zod 스키마 (FE/BE 공유)
│   │                         #   join-requirements, challenge-lifecycle, cheer 정책 등
│   ├── api-contract/         # 엔드포인트별 요청/응답 스키마 (zod) → FE 클라이언트 타입 생성
│   └── api-client/           # 공용 fetch/axios 래퍼 (인증·리프레시·타임존 헤더 단일 구현)
├── services/                 # 백엔드 — bounded context당 1개
│   ├── auth/
│   ├── challenge/            # challenge + quest + verification (완료 판정의 단일 소유자)
│   ├── cheer/
│   ├── community/            # plaza + bulletin + personal-feed + hashtag + challenge-board/feed
│   ├── gamification/         # character + badge
│   ├── notification/         # notification + notifications 통합
│   └── admin/                # 도메인 서비스의 함수를 호출하는 얇은 어댑터로 재구성
├── infra/                    # 단일 CDK 앱 (유일한 cdk.json)
│   ├── bin/app.ts
│   ├── config/               # dev.ts / prod.ts — 타입세이프, synth 결정적
│   ├── stacks/               # 5~6개 고정
│   └── constructs/           # DomainApi, JobFunction 등 재사용 조립 블록
├── docs/                     # 단일 문서 루트 (adr/, spec/, runbook/)
└── .github/workflows/        # CI/CD
```

- 패키지 매니저는 pnpm workspace(또는 npm workspaces)로 통일. `@chum7/domain` 등 패키지 참조로 6단계 상대경로 import 제거.
- 삭제: 루트 CDK 앱(`bin/`, `lib/`, `lambda/`, 루트 `cdk.json`), `infra/stacks/dynamodb-stack.ts`, `infra/bin/infra.ts`, `proto/` 전체, `gsi.json`, `CREATE_28_LAMBDAS.ps1`, 빈 스크립트 스텁, `function.zip`. (git 히스토리에 남으므로 참고 가치는 보존됨)
- 문서 통합: `docs2/3/4` → `docs/spec/`으로 이동, 구버전 cheer 문서는 `docs/archive/`에 deprecated 표기.

### 4.2 CDK 구조

**스택 5~6개 고정:**

| 스택 | 내용 | 정책 |
|---|---|---|
| `chum7-{stage}-stateful` | DynamoDB 전 테이블, Cognito, S3(정적·업로드), 파라미터 | 전부 RETAIN(+prod PITR), **Cognito도 RETAIN** |
| `chum7-{stage}-network` | Route53 레코드, ACM 인증서, CloudFront 2개(web/admin), API 커스텀 도메인 | CDK가 신규 생성해 완전 소유 (기존 콘솔 리소스 import 안 함) |
| `chum7-{stage}-api` | HTTP API + JWT authorizer + 도메인별 Lambda·라우트 (도메인 = Construct) | |
| `chum7-{stage}-jobs` | EventBridge 스케줄 잡, 스트림 컨슈머 | |
| `chum7-{stage}-observability` | 대시보드, 알람, 로그 만료 정책 일괄 | |
| `chum7-{stage}-frontend` | web/admin 정적 배포(또는 CI가 sync — §4.10) | |

- **도메인은 Construct**(`DomainApiConstruct`)로: Lambda 정의 + 라우트 + 테이블 권한을 한 곳에서 선언. 스택 간 참조는 stateful → api 한 방향만 허용.
- 스테이지는 `infra/config/{dev,prod}.ts` 타입세이프 객체로. 계정 분리 시 config에 account만 달라짐. ※ §7-Q3
- CloudFront `/uploads/*` 비헤이비어는 CDK 소유 배포판에 정식 정의 → 커스텀 리소스 변조 Lambda 폐기.

### 4.3 백엔드 컴퓨트 — 122개 Lambda → 도메인당 1개 (Lambdalith)

- bounded context당 **Lambda 1개 + 경량 내부 라우터(Hono)**. 예상 함수 수: API 7개 + 잡 3~4개 ≈ **10~11개** (기존 122개).
  - 효과: `cdk deploy` 시간·로그 그룹 수·콜드스타트 관리 포인트가 1/10로, 미들웨어(인증·검증·에러·CORS) 강제 공유.
  - 트레이드오프: 함수별 IAM 최소권한이 도메인별 권한으로 넓어짐 — 도메인 단위 격리는 유지되므로 수용.
- **공통 미들웨어 계층(필수 통과)**: 인증 컨텍스트 추출, 관리자 그룹 검사(현재 13곳 인라인 → 1곳), zod 요청 검증, 표준 에러 응답(`{code, message}`), 표준 페이지네이션 토큰.
- **admin 서비스는 얇은 어댑터로**: 도메인 서비스의 usecase 함수를 import해 호출. 병렬 구현 금지.
- 스케줄 잡(라이프사이클 매니저, 응원 발송, 광장 변환)은 별도 함수로 유지하되 `jobs` 스택에 모음.

### 4.4 데이터 모델 — 35개 → 약 15개 테이블

전면 단일 테이블(single-table) 전환은 하지 않는다(학습·운영 비용 대비 이득 낮음). 대신 **bounded context 정합 + PK/SK 복합키**로 통합:

| To-Be 테이블 | 흡수 대상 |
|---|---|
| users | users (+notificationSettings 유지) |
| challenges | challenges (category-index v1 삭제, v2만) |
| user-challenges | user-challenges |
| verifications | verifications + verification-comments + verification-reactions (SK: `COMMENT#`, `REACTION#`) |
| quests | quests |
| quest-submissions | quest-submissions + active-quest-submissions + personal-quest-proposals (status GSI로 구분) ※ §7-Q6 |
| cheers | cheers + cheer-dead-letters (status 어트리뷰트) |
| cheer-stats | cheer-stats + cheer-rate-limits (TTL) |
| plaza | plaza-posts/comments/reactions/recommendations (PK: postId, SK 타입 구분) |
| bulletin | bulletin-posts/comments/likes |
| social-graph | feed-follows/blocks/invite-links (PK: userId, SK: `FOLLOWS#`/`BLOCKS#`…) |
| personal-posts | personal-posts + saved-posts |
| boards | challenge-boards/comments/previews |
| gamification | characters + badges |
| notifications / category-banners / payout-audit-logs / hashtags(+follows) | 유지 또는 소폭 통합 |

- 모든 테이블·GSI·액세스 패턴을 `docs/spec/data-model.md` 단일 카탈로그로 문서화(현재는 산문에 분산).
- GSI Projection을 ALL 일괄 → 액세스 패턴 기준으로 KEYS_ONLY/INCLUDE 검토.
- 스트림: 소비자 없는 스트림은 끄거나, §4.5의 알림 팬아웃 컨슈머로 정식 활용.

### 4.5 비동기/이벤트 단순화

- **cheer 통계 Step Functions 병렬 스캔 오케스트레이터 폐기 검토** ※ §7-Q5: 현재 규모에서는 (a) cheers 테이블 스트림 → 증분 집계 Lambda, 또는 (b) 조회 시 온디맨드 계산 + 짧은 캐시로 충분할 가능성이 높다. 데드레터도 별도 테이블 대신 status + 재시도 카운트로 단순화.
- 스케줄 잡 3종은 유지(검증된 로직 이식). 잡 실패 알람을 observability 스택에서 일괄 정의.
- SQS/EventBus는 **필요해질 때** 도입(현재 트래픽에서는 과잉).

### 4.6 API 계약과 타입 공유

- `packages/api-contract`에 엔드포인트별 zod 스키마(요청/응답) 정의 → 백엔드는 검증에, 프론트는 `z.infer` 타입과 typed client 생성에 사용. 엔드포인트 문자열이 코드 전역에 흩어지는 문제 제거.
- Breaking change는 계약 패키지의 diff로 리뷰에서 드러남.

### 4.7 프론트엔드

- 두 앱 모두 `@chum7/api-client` 사용: 토큰 주입·**리프레시 플로우(idToken aud 이슈 포함)**·타임존 헤더를 단일 구현으로. admin 강제 로그아웃 문제 해소. (api-client의 한국어 주석에 있는 idToken/accessToken `aud` 설명은 보존 가치가 있으므로 이식)
- 거대 페이지 분해: 정책 로직(`challengeLifecycle`, `flowPolicy` 등)은 `@chum7/domain`으로, 데이터 페칭은 feature별 `api/` + react-query 훅으로, UI는 컴포넌트로. 1,000줄 상한 lint 규칙.
- 목업/디버그/기획 라우트는 dev 빌드에서만 포함(`import.meta.env.DEV` 가드) 또는 삭제.
- 라우트 정리: `/me`·`/my`·`/assets`·`/profile` 중복 정비. ※ §7-Q7
- 사용자 앱 내 `features/admin`(관리 문서 페이지)과 admin 앱의 관계 정리. ※ §7-Q4

### 4.8 인증/인가

- 인증: Cognito + API Gateway JWT authorizer 유지(검증된 부분).
- **관리자 인가를 서버 측 미들웨어로 일원화**: `cognito:groups` 검사를 공통 계층에서. 프론트의 그룹 파싱·이메일 allowlist는 "UI 표시용"으로 격하.
- admin 앱에도 리프레시 플로우 적용(공용 클라이언트로 자동 해결).
- Cognito 풀 전환 전략은 §7-Q1 답변에 따라 결정(비밀번호는 export 불가 → 기존 풀 유지 또는 migration trigger 방식).

### 4.9 관측성

- 전 Lambda: 구조화 로깅(Lambda Powertools), 로그 만료 30일(prod 90일) 일괄.
- 도메인별 최소 알람 세트(에러율, 잡 실패, DLQ성 상태)를 observability 스택에서 코드로 정의.
- 현행 cheer 대시보드는 유용한 부분만 이식.

### 4.10 CI/CD — 배포 파이프라인

```
PR:        lint + test(jest) + cdk synth(diff 코멘트)
main 머지: → dev 자동 배포 (backend: cdk deploy --all, frontend: build + s3 sync + invalidation)
release:   → prod 배포 (GitHub Environments manual approval 게이트)
```

- GitHub Actions + **OIDC로 AWS role assume**(장기 액세스 키 없음).
- 프론트 배포는 CDK BucketDeployment 대신 CI 단계에서 `s3 sync`(캐시 정책 포함)로 — 인프라 배포와 프론트 배포의 주기를 분리해 빠르게.
- 로컬에서도 동일 명령이 가능하도록 `package.json` 스크립트 정비(크로스 플랫폼, PowerShell 전용 제거). ※ §7-Q9
- 운영 스크립트(backfill 등)는 `ops/` 디렉터리로 모으고 파라미터를 config에서 읽도록 정비.

---

## 5. 전환 전략 (Strangler, 5 Phase)

빅뱅 재작성 대신 **새 시스템을 병행 구축 → 도메인 단위 전환 → DNS 컷오버** 순서로 간다. 검증된 도메인 로직(라이프사이클 수학, cheer 정책)과 기존 테스트는 이식한다.

| Phase | 내용 | 완료 기준 |
|---|---|---|
| **0. 정리·확정** (준비) | §7 질문 확정, 죽은 코드 삭제(proto/, 루트 CDK 앱, dead 스택, 스텁), 문서 통합, 네이밍 확정, 계정 내 고아 리소스 실사(수동 생성 Lambda·구 GSI) | 저장소에 실코드만 남음, 리소스 인벤토리 문서 |
| **1. 골격** | 모노레포 워크스페이스 전환, 새 CDK 앱(stateful/network/api 뼈대), CI/CD 파이프라인, `@chum7/domain`·`api-contract` 패키지 신설 | PR→테스트→dev 자동 배포가 hello 도메인 1개로 동작 |
| **2. 백엔드 도메인 이전** | auth → challenge(+quest/verification) → cheer → community → gamification → notification → admin 순. 각 도메인: 계약 정의 → 핸들러 이식(usecase 추출) → 기존 테스트 이식 → 신규 테이블 생성 + 데이터 마이그레이션 스크립트 | 도메인별로 신 API가 구 API와 동일 계약으로 응답, 테스트 green |
| **3. 프론트 전환** | 공용 api-client 도입, 거대 페이지 분해(트래픽 많은 순), admin 앱 정비, 신 API 엔드포인트로 전환 | 두 앱이 신 API만 호출 |
| **4. 컷오버·폐기** | prod 데이터 마이그레이션(§7-Q2), DNS를 신 CloudFront/API로 전환, 구 스택·수동 리소스 폐기 | 구 리소스 0, 롤백 계획 문서화 |

- 순서 근거: auth가 모든 것의 전제, challenge 삼각형이 제품 심장(가장 먼저 안정화), cheer는 테스트가 많아 이식 리스크 낮음, community는 테스트가 없어 재작성 자유도가 높으므로 후순위.
- 각 Phase는 독립 PR 시리즈로, dev 환경에서 상시 동작 상태 유지.

## 6. 리스크와 완화

| 리스크 | 완화 |
|---|---|
| Cognito 비밀번호는 이관 불가 | 기존 풀을 신 CDK로 import해 계속 사용하거나, User Migration Lambda 트리거로 로그인 시점 점진 이관 (§7-Q1) |
| 데이터 마이그레이션 중 정합성 | 도메인별 마이그레이션 스크립트 + 검증 스크립트 쌍으로 작성, dev에서 리허설 후 prod 적용 |
| 구·신 시스템 병행 기간의 이중 운영 | 도메인 단위로 짧게 전환, 전환된 도메인의 구 경로는 즉시 비활성화 |
| 테스트 없는 도메인(community 등)의 동작 누락 | 이전 전 스모크 테스트를 먼저 작성해 현행 동작 스냅샷 확보 |
| 숨은 수동 리소스(고아 Lambda, 콘솔 설정) | Phase 0에서 계정 전수 실사(리소스 태깅 기준 수립) |

---

## 7. 결정 필요 사항 (질문)

각 항목에 "내 이해"와 "왜 확인이 필요한지"를 함께 적는다.

**Q1. Cognito 풀 — 어느 것이 라이브인가?**
CDK CoreStack이 만든 `chum7-{stage}-users`와, 초기 수동 스크립트·프론트 env가 가리키는 기존 풀(`ap-northeast-2_NCbbx3Ilm`)이 공존한다. 내 이해로는 후자가 실사용 풀일 가능성이 높다. **어느 풀에 실제 사용자가 있는가?** 이 답이 (a) 신 시스템이 기존 풀을 import할지, (b) 새 풀 + migration trigger로 갈지를 결정한다. (비밀번호는 export가 불가능해서 "새 풀로 복사"는 선택지가 아니다.)

**Q2. 실사용자/운영 데이터 규모 — 보존 대상인가?**
prod에 보존해야 할 실사용자·데이터가 있는가, 아니면 아직 사실상 개발 단계라 데이터를 리셋해도 되는가? 리셋 가능하면 Phase 2·4의 마이그레이션 작업이 통째로 사라져 일정이 크게 줄어든다.

**Q3. dev/prod AWS 계정 분리 의향**
현재 한 계정에 dev/prod가 공존한다. 표준적으로는 계정 분리(AWS Organizations)가 안전하지만 관리 부담이 는다. 분리 의향이 있는가? (신 CDK 구조는 어느 쪽이든 config만 바꾸면 되게 설계한다. 내 권고: 혼자 운영이라면 당장은 단일 계정 + 태깅·권한 경계로 시작하고, 실사용자가 늘면 분리.)

**Q4. 관리자 화면 이원화 정리 방향**
사용자 앱 안의 `features/admin`(관리 문서 페이지)과 별도 `admin-frontend` 앱이 공존한다. 내 이해로는 admin-frontend가 정식 관리자 도구다. **admin 앱으로 일원화하고 사용자 앱의 admin feature는 제거**해도 되는가?

**Q5. cheer 통계 인프라의 규모 근거**
Step Functions 병렬 스캔 materializer + 데드레터 테이블 + 전용 대시보드는 대규모 트래픽용 설계다. 현재/예상 사용자 규모(DAU 수준)가 어느 정도인가? 소규모라면 스트림 기반 증분 집계로 대폭 단순화하는 §4.5 안을 적용하고 싶다.

**Q6. quest 제출 3테이블의 의도**
`quest-submissions` vs `active-quest-submissions` vs `personal-quest-proposals`의 경계 의도를 아는가? 내 추정은 "진행 중 제출을 빠르게 조회하려는 파생 테이블 + 개인 퀘스트 제안 별도 보관"인데, 문서가 없다. 의도가 특별히 없다면 §4.4대로 1개 테이블 + status GSI로 통합한다.

**Q7. 라우트/페이지 중복의 최종 의도**
`/me`(MEPage) vs `/my`(MyPage) vs `/profile`·`/assets`(둘 다 ProfilePage), `TodayPage` vs `WorldPage`가 공존한다. IA(정보구조) 개편이 진행 중이던 것으로 보이는데, **최종적으로 남기고 싶은 화면 구조**가 무엇인가? (모르겠으면 재설계 시 IA 제안을 별도로 만들어 주겠다.)

**Q8. 제품/리소스 네이밍 확정**
`chum7` vs `chme(CHME)`. 도메인이 chum7.com이므로 리소스 프리픽스를 `chum7`으로 통일하는 것을 권고한다. 확정해 달라. (신규 리소스 네이밍이므로 지금이 통일 적기다.)

**Q9. 개발 환경 전제**
지금까지 스크립트가 전부 Windows PowerShell이다. 앞으로도 Windows 로컬 개발이 기본인가? CI/CD 도입으로 로컬 배포 의존은 없어지지만, 로컬 스크립트를 크로스 플랫폼(node/bash)으로 바꿔도 되는지 확인하고 싶다.

**Q10. dev CloudFront 배포판 ID 확인 (사실 확인)**
config에는 `ESKW3DS5HUUK9`, 스크립트/README에는 `ESKW3DSSHIUK9`로 서로 다르다. 콘솔에서 실제 ID 확인이 필요하다. (신 구조에서는 CDK가 새로 소유하므로 전환 후에는 무의미해지지만, 병행 기간 동안의 dev 배포에 영향.)

---

## 8. 예상 산출물 요약

- 단일 CDK 앱(스택 6개), Lambda 122 → ~11개, 테이블 35 → ~15개, CDK 앱 3 → 1개
- CI/CD: PR 검증 + dev 자동 배포 + prod 승인 배포 (PowerShell 수동 배포 폐기)
- FE/BE 공유 패키지 3종(domain, api-contract, api-client), 문서 루트 단일화
- 콘솔 수동 관리 리소스 0, 네이밍 단일화, 죽은 코드 0
