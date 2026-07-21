# 신규 시스템(chme2) 배포 가이드 — PowerShell 기준

신규 인프라(`infra2/`, 스택 프리픽스 `chme2-*`)의 배포 절차.
구 시스템(`chme-*`, `scripts/deploy-dev.ps1`)과 **완전히 별개로 병행 동작**한다.
모든 명령은 Windows PowerShell / macOS / Linux 동일 (`deploy.mjs`는 Node 크로스플랫폼).

---

## 0. 사전 준비 (최초 1회)

```powershell
# 필수 도구 확인
node -v        # 20+
npm -v
aws --version  # AWS CLI v2

# 의존성 설치 (리포 루트)
cd C:\chum7    # 리포 위치 기준
npm install
```

### AWS 계정 확인 (배포 전 반드시)

```powershell
# 지금 어느 계정/역할로 붙어 있는지 확인 — Account가 의도한 계정인지 볼 것
aws sts get-caller-identity

# 사용 중인 프로파일/리전 확인
aws configure list

# 다른 프로파일을 쓰려면 (해당 PowerShell 세션에만 적용)
$env:AWS_PROFILE = "chum7"
aws sts get-caller-identity   # 전환 확인
```

> 신규 CDK 앱은 계정/리전을 **하드코딩하지 않는다**. `CDK_DEFAULT_ACCOUNT`는 위
> 프로파일에서 자동으로 잡히고, 리전은 프로파일 리전(미설정 시 `ap-northeast-2`)이다.

### CDK 부트스트랩 (계정+리전당 1회 — 기존에 CDK를 쓰던 계정이면 이미 되어 있음)

```powershell
cd infra2
npx cdk bootstrap
cd ..
```

---

## 1. 배포 명령어 (리포 루트에서)

### DEV

```powershell
npm run deploy -- --stage dev --diff       # ① 배포 없이 변경 내용만 미리보기
npm run deploy -- --stage dev              # ② 전체 배포 (검증→빌드→diff→배포→env 생성)
npm run deploy -- --stage dev --only api        # 백엔드(Lambda·워커)만 — 코드 수정 후 일상 배포
npm run deploy -- --stage dev --only frontend   # 프론트 2종 빌드+업로드만
```

### PROD

```powershell
npm run deploy -- --stage prod --diff      # 반드시 diff 먼저
npm run deploy -- --stage prod             # 'DEPLOY' 타이핑 확인 후 진행
```

**PROD 안전장치**
- 배포 직전 `DEPLOY` 입력을 요구한다.
- diff에서 **Stateful 리소스(테이블·Cognito·uploads 버킷) 삭제/치환이 감지되면 강제 중단**된다.
  의도된 변경일 때만 `--allow-stateful-replace`를 붙여 통과시킨다.
- 테스트/타입체크 실패 시 배포 진입 자체가 차단된다 (`--skip-tests`는 비상시에만).

### 파이프라인이 하는 일 (전체 배포 기준)

```
1. 검증    typecheck(전 워크스페이스) + 신규 아키텍처 테스트 + CDK 스택 테스트
2. 빌드    frontend / admin-frontend (vite, stage별 mode)
3. diff    cdk diff 요약 출력 (prod는 여기서 확인 입력)
4. 배포    cdk deploy --all  →  스택 5개: chme2-<stage>-{stateful, edge, workers, api, observability}
           (도메인 설정 시 cert 포함 6개. 프론트 업로드는 edge 스택의 BucketDeployment가 수행)
5. 산출    CfnOutputs → frontend/.env.development|production 자동 생성
           (Cognito ID·API URL 수동 복사 절차 없음)
6. 리포트  스택별 결과 + 주요 Output(ApiUrl, AppUrl, UserPoolId 등) 출력
```

### dev vs prod 차이 (infra2/config/stages.ts가 유일한 진실)

| 항목 | dev | prod |
|------|-----|------|
| 스택 프리픽스 | `chme2-dev-*` | `chme2-prod-*` |
| DynamoDB/Cognito/S3 보존 | DESTROY (재생성 자유) | **RETAIN + PITR** |
| CORS | `*` | www/admin.chum7.com만 |
| 배포 확인 | 없음 | `DEPLOY` 입력 + Stateful 가드 |
| Lambda 소스맵 | 포함 | 미포함 |
| 커스텀 도메인 | 미설정 (CloudFront/API 기본 URL) | 미설정 — Phase 5 전환 때 `stages.ts`의 `domain` 주석 해제 |

---

## 2. 배포 후 확인 절차 (스모크 테스트)

```powershell
# 배포 리포트의 ApiUrl 사용 (또는 infra2/cdk.out/outputs-dev.json 참조)
$api = "https://xxxx.execute-api.ap-northeast-2.amazonaws.com"

# ① 헬스체크
curl "$api/health"          # {"success":true,"data":{"service":"user-api",...}}

# ② 회원가입 → 로그인 왕복
curl -Method POST "$api/auth/register" -ContentType "application/json" `
  -Body '{"email":"test@test.com","password":"Test1234","name":"테스터"}'
# (이메일 인증 코드 확인 후) confirm → login

# ③ 프론트 접속 — 배포 리포트의 AppUrl (CloudFront 기본 도메인)
```

### 어드민 계정 만들기 (Cognito 그룹 배정)

```powershell
# UserPoolId는 배포 Output에 있음
$pool = "ap-northeast-2_XXXXXXX"
aws cognito-idp admin-add-user-to-group --user-pool-id $pool `
  --username "admin@chum7.com" --group-name admins
# 그룹: admins(슈퍼) / operators(운영) / creators(크리에이터)
```

### 시크릿 주입 (Phase 3/4에서 필요해질 때 1회 — PG·본인확인·VAPID 키)

```powershell
aws secretsmanager put-secret-value --secret-id "chme2-dev/pg" --secret-string '{"apiKey":"..."}'
aws secretsmanager put-secret-value --secret-id "chme2-dev/vapid" --secret-string '{"publicKey":"...","privateKey":"..."}'
# 커머스 v0(쿠폰·수동입금)는 시크릿 없이 동작한다
```

---

## 3. Lambda 프로세스 이해 (무엇이 어떻게 배포되나)

- **패키징**: `cdk deploy`가 esbuild로 `services/*/src/index.ts`를 직접 번들한다.
  별도 zip/빌드 단계 없음 — 소스 수정 → `--only api` 배포가 전부.
- **API Lambda 7개** (`chme2-<stage>-…`): `user-api`(/u,/auth,/public/users) ·
  `challenge-api`(/c,/public/challenges) · `social-api`(/s,/public/plaza·board·hashtags) ·
  `cheer-api`(/ch) · `gamification-api`(/g,/public/today·banners) ·
  `commerce-api`(/pay) · `admin-api`(/adm)
  — API Gateway에는 프리픽스 프록시 라우트만 있어 **엔드포인트 추가 시 인프라 배포 불필요**
  (해당 Lambda만 재배포).
- **워커 4개**: `notification-worker`(이벤트버스 구독→인앱 알림) ·
  `cheer-scheduler`(5분) · `lifecycle-manager`(1시간) · `plaza-converter`(1시간)
- **로그 확인**:
  ```powershell
  aws logs tail /aws/lambda/chme2-dev-user-api --follow
  ```
- **알람/대시보드**: CloudWatch → `chme2-<stage>-ops` 대시보드, 함수별 에러 알람
  (`stages.ts`에 `opsAlertEmail` 설정 시 이메일 수신).

## 4. 자주 겪는 문제

| 증상 | 조치 |
|------|------|
| `Unable to resolve AWS account` | 프로파일 미설정 — `aws sts get-caller-identity`로 확인 후 `$env:AWS_PROFILE` 지정 |
| bootstrap 에러 (`SSM parameter /cdk-bootstrap/...`) | `cd infra2; npx cdk bootstrap` 1회 실행 |
| prod에서 Stateful 삭제 감지로 중단 | diff를 읽고 의도된 변경인지 확인 → 맞으면 `--allow-stateful-replace` |
| 프론트가 옛 API를 봄 | `.env.*`는 배포가 자동 생성 — 배포 후 프론트를 다시 빌드·배포(`--only frontend`) |
| 구 시스템과 혼동 | 구: `chme-*` 스택 + `scripts/deploy-*.ps1` / 신: `chme2-*` + `npm run deploy`. 전환(Phase 5) 전까지 서로 영향 없음 |
