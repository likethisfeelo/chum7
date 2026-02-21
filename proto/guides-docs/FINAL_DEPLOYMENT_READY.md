# 🎯 CHME 최종 배포 전 점검 완료

## ✅ S3 버킷 확인 (완벽 일치!)

### 실제 AWS S3 버킷 (5개)
```
1. cdk-hnb659fds-assets-532393804562-ap-northeast-2  (CDK 자동 생성) ✅
2. chme-dev                                          (DEV Static) ✅
3. chme-prod-static                                  (PROD Static) ✅
4. chum7-dev-uploads                                 (DEV Uploads) ✅
5. chum7-prod-uploads                                (PROD Uploads) ✅
```

### config 파일과 비교
```typescript
// DEV (dev-config-fixed.ts)
s3: {
  staticBucket: 'chme-dev',           ✅ 일치!
  uploadsBucket: 'chum7-dev-uploads', ✅ 일치!
}

// PROD (prod-config-fixed.ts)
s3: {
  staticBucket: 'chme-prod-static',   ✅ 일치!
  uploadsBucket: 'chum7-prod-uploads', ✅ 일치!
}
```

**결론: 완벽하게 일치합니다!**

---

## ✅ 전체 리소스 최종 점검

### 1. Account & Region
```
Account ID: 532393804562 ✅
Region: ap-northeast-2 ✅
```

### 2. S3 Buckets (4개 + CDK 1개)
```
✅ chme-dev (DEV Static)
✅ chme-prod-static (PROD Static)
✅ chum7-dev-uploads (DEV Uploads)
✅ chum7-prod-uploads (PROD Uploads)
✅ cdk-hnb659fds-assets-* (CDK 자동)
```

### 3. Cognito User Pools (2개)
```
DEV:
  Pool Name: chum7-dev-users ✅
  Pool ID: ap-northeast-2_NCbbx3Ilm ✅
  Client ID: 6aalogssb8bb70rtg63a2l7jdb ✅

PROD:
  Pool Name: chum7-prod-users ✅
  Pool ID: ap-northeast-2_n8ZjUpupj ✅
  Client ID: 5d62qaq228fap818m8gi8jt759 ✅
```

### 4. CloudFront Distributions (2개)
```
DEV:
  ID: ESKW3DS5HUUK9 ✅
  Domain: test.chum7.com ✅

PROD:
  ID: EUM1ULUXR9NQZ ✅
  Domains: www.chum7.com, admin.chum7.com ✅
```

### 5. Config 파일 준비 완료
```
✅ infra/config/dev.ts (dev-config-fixed.ts)
✅ infra/config/prod.ts (prod-config-fixed.ts)
✅ Account ID 하드코딩: 532393804562
✅ 모든 버킷 이름 실제와 일치
✅ 모든 ID 실제와 일치
```

### 6. Infra 파일 준비 완료
```
✅ infra/bin/chme.ts
✅ infra/cdk.json
✅ infra/package.json
✅ infra/tsconfig.json
✅ infra/stacks/core-stack.ts
✅ infra/stacks/auth-stack.ts (이름 변경 필요)
✅ infra/stacks/challenge-stack.ts (이름 변경 필요)
✅ infra/stacks/verification-stack.ts (이름 변경 필요)
✅ infra/stacks/cheer-stack.ts (이름 변경 필요)
✅ infra/stacks/admin-stack.ts (이름 변경 필요)
```

---

## ⚠️ 배포 전 필수 작업 (3가지만!)

### 1️⃣ Cognito Callback URL 설정 (5분)

**DEV - chum7-dev-users:**
```
AWS Console → Cognito → User pools → chum7-dev-users
→ App integration 탭
→ chum7-dev-users 클라이언트 클릭
→ [Edit] 버튼

Allowed callback URLs:
https://test.chum7.com/callback
http://localhost:5173/callback
http://localhost:5174/callback

Allowed sign-out URLs:
https://test.chum7.com
http://localhost:5173
http://localhost:5174

→ [Save changes]
```

**PROD - chum7-prod-users:**
```
AWS Console → Cognito → User pools → chum7-prod-users
→ App integration 탭
→ chum7-prod-users 클라이언트 클릭
→ [Edit] 버튼

Allowed callback URLs:
https://www.chum7.com/callback
https://admin.chum7.com/callback

Allowed sign-out URLs:
https://www.chum7.com
https://admin.chum7.com

→ [Save changes]
```

---

### 2️⃣ Cognito Admins 그룹 확인/생성 (2분)

```
Cognito → User pools → chum7-dev-users
→ [Groups] 탭
→ "admins" 그룹 있는지 확인

없으면:
→ [Create group]
→ Group name: admins
→ Precedence: 0
→ [Create group]

(PROD도 동일)
```

---

### 3️⃣ 관리자 사용자 생성 (PowerShell 30초!)

```powershell
# DEV 관리자 생성
aws cognito-idp admin-create-user `
  --user-pool-id ap-northeast-2_NCbbx3Ilm `
  --username admin@chum7.com `
  --user-attributes Name=email,Value=admin@chum7.com Name=email_verified,Value=true `
  --temporary-password "Temp1234!"

aws cognito-idp admin-add-user-to-group `
  --user-pool-id ap-northeast-2_NCbbx3Ilm `
  --username admin@chum7.com `
  --group-name admins

# PROD 관리자 생성
aws cognito-idp admin-create-user `
  --user-pool-id ap-northeast-2_n8ZjUpupj `
  --username admin@chum7.com `
  --user-attributes Name=email,Value=admin@chum7.com Name=email_verified,Value=true `
  --temporary-password "Temp1234!"

aws cognito-idp admin-add-user-to-group `
  --user-pool-id ap-northeast-2_n8ZjUpupj `
  --username admin@chum7.com `
  --group-name admins
```

---

## 🚀 배포 순서

### Step 1: 파일 배치
```powershell
cd C:\chum7\infra

# config 파일
# dev-config-fixed.ts → config/dev.ts
# prod-config-fixed.ts → config/prod.ts

# stacks 폴더 (이름 변경 주의!)
mkdir stacks
# core-stack.ts → stacks/core-stack.ts
# stack-auth.ts → stacks/auth-stack.ts (이름 변경!)
# stack-challenge.ts → stacks/challenge-stack.ts (이름 변경!)
# stack-verification.ts → stacks/verification-stack.ts (이름 변경!)
# stack-cheer.ts → stacks/cheer-stack.ts (이름 변경!)
# stack-admin.ts → stacks/admin-stack.ts (이름 변경!)
```

### Step 2: 의존성 설치
```powershell
npm install
```

### Step 3: TypeScript 컴파일 확인
```powershell
npm run build
```

### Step 4: CloudFormation 템플릿 생성 (테스트)
```powershell
npm run synth:dev
```

### Step 5: Bootstrap (이미 했으면 건너뛰기)
```powershell
cdk bootstrap aws://532393804562/ap-northeast-2
```

### Step 6: DEV 배포
```powershell
npm run deploy:dev

# 또는
cdk deploy --all --context stage=dev --require-approval never
```

### Step 7: 배포 완료 확인
```powershell
# API Gateway 확인
aws apigatewayv2 get-apis --region ap-northeast-2

# Lambda 함수 확인
aws lambda list-functions --region ap-northeast-2 | grep chme-dev

# DynamoDB 테이블 확인
aws dynamodb list-tables --region ap-northeast-2
```

### Step 8: PROD 배포 (DEV 테스트 후)
```powershell
npm run deploy:prod
```

---

## 📊 배포 후 생성되는 리소스

### Lambda Functions (28개)
```
Auth (5개):
✅ chme-dev-auth-register
✅ chme-dev-auth-login
✅ chme-dev-auth-refresh
✅ chme-dev-auth-get-profile
✅ chme-dev-auth-update-profile

Challenge (5개):
✅ chme-dev-challenge-list
✅ chme-dev-challenge-detail
✅ chme-dev-challenge-join
✅ chme-dev-challenge-my
✅ chme-dev-challenge-stats

Verification (5개):
✅ chme-dev-verification-submit
✅ chme-dev-verification-get
✅ chme-dev-verification-list
✅ chme-dev-verification-upload-url
✅ chme-dev-verification-remedy

Cheer (8개):
✅ chme-dev-cheer-send-immediate
✅ chme-dev-cheer-use-ticket
✅ chme-dev-cheer-send-scheduled
✅ chme-dev-cheer-get-targets
✅ chme-dev-cheer-thank
✅ chme-dev-cheer-get-my
✅ chme-dev-cheer-get-scheduled
✅ chme-dev-tickets-get-my

Admin (6개):
✅ chme-dev-admin-create-challenge
✅ chme-dev-admin-update-challenge
✅ chme-dev-admin-delete-challenge
✅ chme-dev-admin-toggle-challenge
✅ chme-dev-admin-list-users
✅ chme-dev-admin-stats

(PROD도 동일)
```

### DynamoDB Tables (6개)
```
✅ chme-dev-users (+ email-index)
✅ chme-dev-challenges (+ category-index)
✅ chme-dev-user-challenges (+ 3 GSI)
✅ chme-dev-verifications (+ 2 GSI)
✅ chme-dev-cheers (+ 3 GSI)
✅ chme-dev-user-cheer-tickets (+ 1 GSI)

(PROD도 동일)
```

### API Gateway Endpoints (25개)
```
Auth (5):
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
GET    /auth/profile
PUT    /auth/profile

Challenge (5):
GET    /challenges
GET    /challenges/{id}
POST   /challenges/{id}/join
GET    /challenges/my
GET    /challenges/{id}/stats

Verification (5):
POST   /verifications
GET    /verifications/{id}
GET    /verifications
POST   /verifications/upload-url
POST   /verifications/remedy

Cheer (7):
POST   /cheers/immediate
POST   /cheers/tickets/use
GET    /cheers/targets
POST   /cheers/{id}/thank
GET    /cheers/my
GET    /cheers/scheduled
GET    /tickets/my

Admin (6):
POST   /admin/challenges
PUT    /admin/challenges/{id}
DELETE /admin/challenges/{id}
POST   /admin/challenges/{id}/toggle
GET    /admin/users
GET    /admin/stats/overview
```

### Other Resources
```
✅ API Gateway HTTP API (chme-dev-api)
✅ SNS Topic (chme-dev-notifications)
✅ EventBridge Rule (1분마다 scheduled-cheer-sender 실행)
```

---

## ✅ 최종 체크리스트

### AWS 리소스 준비 완료
- [x] S3 버킷 5개 (DEV 2개 + PROD 2개 + CDK 1개)
- [x] Cognito User Pool 2개 (DEV + PROD)
- [x] CloudFront Distribution 2개 (DEV + PROD)
- [x] Account ID 확인: 532393804562

### Config 파일 준비 완료
- [x] dev-config-fixed.ts (모든 값 실제와 일치)
- [x] prod-config-fixed.ts (모든 값 실제와 일치)
- [x] Account ID 하드코딩
- [x] S3 버킷 이름 정확

### Infra 파일 준비 완료
- [x] bin/chme.ts
- [x] cdk.json
- [x] package.json
- [x] tsconfig.json
- [x] 6개 Stack 파일

### 배포 전 필수 작업
- [ ] Cognito Callback URL 설정 (DEV)
- [ ] Cognito Callback URL 설정 (PROD)
- [ ] Cognito Admins 그룹 확인
- [ ] 관리자 사용자 생성
- [ ] npm install
- [ ] npm run build
- [ ] cdk bootstrap (최초 1회)

### 배포
- [ ] npm run deploy:dev
- [ ] DEV 테스트
- [ ] npm run deploy:prod

---

## 🎉 준비 완료!

**S3 버킷 이름이 config 파일과 100% 일치합니다!**

이제 할 일:
1. Cognito Callback URL 설정 (5분)
2. 관리자 사용자 생성 (PowerShell 30초)
3. npm install & deploy (CDK가 자동 처리)

**배포만 하면 끝입니다!** 🚀
