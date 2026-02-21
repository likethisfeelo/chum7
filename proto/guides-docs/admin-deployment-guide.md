# CloudFront Admin 도메인 설정 가이드

## admin.chum7.com 설정

### 1. S3 버킷 설정 (기존 버킷 재사용)
어드민 프론트엔드도 같은 S3 버킷을 사용하되, `/admin` 경로로 분리

```bash
# 빌드
cd admin-frontend
npm run build

# S3에 업로드 (/admin 경로)
aws s3 sync dist/ s3://chum7-prod-static/admin/ \
  --delete \
  --cache-control "max-age=31536000,public,immutable" \
  --exclude "index.html"

aws s3 cp dist/index.html s3://chum7-prod-static/admin/index.html \
  --cache-control "max-age=0,no-cache,no-store,must-revalidate"
```

### 2. CloudFront 추가 Origin 설정

기존 CloudFront Distribution에 admin.chum7.com을 Alternate Domain Name으로 추가

**ACM 인증서 (US-EAST-1):**
- *.chum7.com (이미 있음)

**Alternate Domain Names (CNAMEs):**
- www.chum7.com
- admin.chum7.com (추가)

**Origins:**
- Origin 1: S3 (chum7-prod-static) - 기존
- Origin 2: API Gateway (api.chum7.com) - 기존

**Behaviors:**
```
1. Path: /admin/*
   Origin: S3
   Viewer Protocol: Redirect HTTP to HTTPS
   
2. Path: /api/*
   Origin: API Gateway
   Viewer Protocol: HTTPS Only
   
3. Path: Default (*)
   Origin: S3
   Viewer Protocol: Redirect HTTP to HTTPS
```

### 3. Route53 설정

```bash
# admin.chum7.com A 레코드 생성 (CloudFront Alias)
aws route53 change-resource-record-sets \
  --hosted-zone-id YOUR_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "admin.chum7.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "YOUR_CLOUDFRONT_DOMAIN.cloudfront.net",
          "EvaluateTargetHealth": false
        }
      }
    }]
  }'
```

### 4. CloudFront Invalidation

```bash
# Admin 경로만 무효화
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/admin/*"
```

## 배포 스크립트

### scripts/deploy-admin-dev.ps1
```powershell
#!/usr/bin/env pwsh
Write-Host "🚀 Deploying Admin to DEV..." -ForegroundColor Green

$ErrorActionPreference = "Stop"

# 1. Admin Frontend 빌드
Write-Host "📦 Building Admin Frontend..." -ForegroundColor Cyan
cd admin-frontend
npm run build:dev

# 2. S3 업로드
Write-Host "☁️ Uploading to S3..." -ForegroundColor Cyan
aws s3 sync dist/ s3://chum7-dev-static/admin/ `
  --delete `
  --cache-control "max-age=31536000,public,immutable" `
  --exclude "index.html"

aws s3 cp dist/index.html s3://chum7-dev-static/admin/index.html `
  --cache-control "max-age=0,no-cache,no-store,must-revalidate"

# 3. CloudFront 무효화
Write-Host "🔄 Invalidating CloudFront..." -ForegroundColor Cyan
aws cloudfront create-invalidation `
  --distribution-id E1234567890ABC `
  --paths "/admin/*"

# 4. Admin Lambda 배포 (변경사항 있을 때만)
Write-Host "🔧 Deploying Admin Stack..." -ForegroundColor Cyan
cd ../infra
npx cdk deploy chme-dev-admin `
  --context stage=dev `
  --require-approval never

Write-Host "✅ Admin DEV Deployment Complete!" -ForegroundColor Green
Write-Host "🌐 Admin URL: https://admin-dev.chum7.com" -ForegroundColor Yellow
```

### scripts/deploy-admin-prod.ps1
```powershell
#!/usr/bin/env pwsh
Write-Host "🚀 Deploying Admin to PROD..." -ForegroundColor Green
Write-Host "⚠️ This will deploy to production. Continue? (y/N)" -ForegroundColor Red

$confirm = Read-Host
if ($confirm -ne "y") {
    Write-Host "❌ Deployment cancelled" -ForegroundColor Red
    exit 1
}

$ErrorActionPreference = "Stop"

# 1. Admin Frontend 빌드
Write-Host "📦 Building Admin Frontend..." -ForegroundColor Cyan
cd admin-frontend
npm run build:prod

# 2. S3 업로드
Write-Host "☁️ Uploading to S3..." -ForegroundColor Cyan
aws s3 sync dist/ s3://chum7-prod-static/admin/ `
  --delete `
  --cache-control "max-age=31536000,public,immutable" `
  --exclude "index.html"

aws s3 cp dist/index.html s3://chum7-prod-static/admin/index.html `
  --cache-control "max-age=0,no-cache,no-store,must-revalidate"

# 3. CloudFront 무효화
Write-Host "🔄 Invalidating CloudFront..." -ForegroundColor Cyan
aws cloudfront create-invalidation `
  --distribution-id EUM1ULUXR9NQZ `
  --paths "/admin/*"

# 4. Admin Lambda 배포
Write-Host "🔧 Deploying Admin Stack..." -ForegroundColor Cyan
cd ../infra
npx cdk deploy chme-prod-admin `
  --context stage=prod `
  --require-approval never

Write-Host "✅ Admin PROD Deployment Complete!" -ForegroundColor Green
Write-Host "🌐 Admin URL: https://admin.chum7.com" -ForegroundColor Yellow
```

## API 엔드포인트 (같은 API 사용)

어드민 API는 기존 API Gateway를 그대로 사용:
- DEV: https://dev.chum7.com/admin/*
- PROD: https://api.chum7.com/admin/*

### 어드민 전용 엔드포인트:
```
POST   /admin/challenges              # 챌린지 생성
PUT    /admin/challenges/:id          # 챌린지 수정
DELETE /admin/challenges/:id          # 챌린지 삭제
POST   /admin/challenges/:id/toggle   # 활성화/비활성화
GET    /admin/users                   # 사용자 목록
GET    /admin/stats/overview          # 통계
```

### 권한 확인:
모든 `/admin/*` 엔드포인트는 Lambda에서 Cognito `admins` 그룹 체크

## 초기 설정 순서

1. **CDK 배포 (Admin Stack 포함)**
```bash
cd infra
cdk deploy chme-dev-core chme-dev-admin --context stage=dev
```

2. **관리자 사용자 생성**
```powershell
.\scripts\create-admin-user.ps1 -Stage dev -Email admin@chme.app -TempPassword TempPass123!
```

3. **Admin 프론트엔드 빌드 & 배포**
```powershell
.\scripts\deploy-admin-dev.ps1
```

4. **CloudFront 설정** (AWS Console)
- Alternate Domain: admin-dev.chum7.com 추가
- Route53 A 레코드 생성

5. **관리자 로그인**
- https://admin-dev.chum7.com
- 임시 비밀번호로 로그인 → 비밀번호 변경

## 디렉토리 구조

```
chme/
├── frontend/              # 사용자 앱
│   └── dist/ → s3://chum7-prod-static/
│
├── admin-frontend/        # 관리자 앱
│   └── dist/ → s3://chum7-prod-static/admin/
│
├── backend/
│   ├── services/
│   │   ├── auth/
│   │   ├── challenge/
│   │   ├── verification/
│   │   ├── cheer/
│   │   └── admin/        # 어드민 Lambda
│   │       ├── challenge/
│   │       │   ├── create/
│   │       │   ├── update/
│   │       │   ├── delete/
│   │       │   └── toggle/
│   │       ├── user/
│   │       │   └── list/
│   │       └── stats/
│   │           └── overview/
│
└── infra/
    └── stacks/
        └── admin-stack.ts
```

## 보안 체크리스트

✅ Cognito `admins` 그룹으로 권한 제어
✅ Lambda에서 그룹 체크 (각 핸들러마다)
✅ API Gateway Cognito Authorizer 사용
✅ HTTPS 강제
✅ CORS 설정 (admin.chum7.com)
✅ 참여자 있는 챌린지 삭제 방지

## 테스트

1. **로그인 테스트**
   - admin.chum7.com 접속
   - 관리자 계정으로 로그인
   - `admins` 그룹 확인

2. **챌린지 생성**
   - 새 챌린지 생성
   - DynamoDB에 저장 확인
   - 사용자 앱에서 보이는지 확인

3. **챌린지 수정/삭제**
   - 수정 기능 테스트
   - 활성화/비활성화 테스트
   - 참여자 있는 경우 삭제 방지 확인

4. **사용자 목록**
   - 전체 사용자 조회
   - 페이지네이션 테스트

## 모니터링

CloudWatch Logs:
- `/aws/lambda/chme-prod-admin-create-challenge`
- `/aws/lambda/chme-prod-admin-update-challenge`
- `/aws/lambda/chme-prod-admin-delete-challenge`
- `/aws/lambda/chme-prod-admin-toggle-challenge`
- `/aws/lambda/chme-prod-admin-list-users`
- `/aws/lambda/chme-prod-admin-stats`
