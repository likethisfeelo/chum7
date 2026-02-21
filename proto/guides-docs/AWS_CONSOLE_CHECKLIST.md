# AWS 콘솔에서 확인/설정해야 할 사항

## ✅ 이미 확인된 값들 (수동 입력 완료)

### DEV
- ✅ Account ID: 532393804562
- ✅ User Pool ID: ap-northeast-2_NCbbx3Ilm
- ✅ Client ID: 6aalogssb8bb70rtg63a2l7jdb
- ✅ S3 Static: chme-dev
- ✅ S3 Uploads: chum7-dev-uploads
- ✅ CloudFront: ESKW3DS5HUUK9

### PROD
- ✅ Account ID: 532393804562
- ✅ User Pool ID: ap-northeast-2_n8ZjUpupj
- ✅ Client ID: 5d62qaq228fap818m8gi8jt759
- ✅ S3 Static: chme-prod-static
- ✅ S3 Uploads: chum7-prod-uploads
- ✅ CloudFront: EUM1ULUXR9NQZ

---

## ⚠️ 콘솔에서 반드시 확인/설정해야 할 것들

### 1️⃣ Cognito Callback URL 설정 (필수!)

**DEV (chum7-dev-users)**
```
AWS Console → Cognito → User pools → chum7-dev-users
→ App integration 탭
→ chum7-dev-users 클라이언트 클릭
→ Edit 버튼
→ "Allowed callback URLs" 입력:

https://test.chum7.com/callback
http://localhost:5173/callback
http://localhost:5174/callback

→ "Allowed sign-out URLs" 입력:

https://test.chum7.com
http://localhost:5173
http://localhost:5174

→ Save changes
```

**PROD (chum7-prod-users)**
```
AWS Console → Cognito → User pools → chum7-prod-users
→ App integration 탭
→ chum7-prod-users 클라이언트 클릭
→ Edit 버튼
→ "Allowed callback URLs" 입력:

https://www.chum7.com/callback
https://admin.chum7.com/callback

→ "Allowed sign-out URLs" 입력:

https://www.chum7.com
https://admin.chum7.com

→ Save changes
```

---

### 2️⃣ Cognito User Pool 설정 확인

```
Cognito → User pools → chum7-dev-users (또는 chum7-prod-users)
→ Sign-in experience 탭
```

**확인 사항:**
- ✅ Email 로그인 활성화
- ✅ Self-sign up 활성화
- ✅ Email verification 활성화

**만약 설정이 다르면:**
→ Edit 버튼 클릭 → 수정 → Save changes

---

### 3️⃣ Cognito Admins 그룹 확인

```
Cognito → User pools → chum7-dev-users (또는 chum7-prod-users)
→ Groups 탭
→ "admins" 그룹 있는지 확인
```

**없으면 생성:**
```
→ Create group 버튼
→ Group name: admins
→ Precedence: 0
→ Description: CHME 관리자 그룹
→ Create group
```

---

### 4️⃣ 관리자 사용자 생성 (어드민 앱 사용 위해 필수!)

```
Cognito → User pools → chum7-dev-users (또는 chum7-prod-users)
→ Users 탭
→ Create user 버튼

Username: admin@chum7.com (또는 본인 이메일)
Email: admin@chum7.com
Temporary password: Temp1234! (임시 비밀번호)
→ Create user

→ 생성된 사용자 클릭
→ "Group memberships" 섹션
→ "Add user to group" 버튼
→ admins 선택
→ Add
```

**또는 PowerShell로:**
```powershell
# DEV
aws cognito-idp admin-create-user `
  --user-pool-id ap-northeast-2_NCbbx3Ilm `
  --username admin@chum7.com `
  --user-attributes Name=email,Value=admin@chum7.com Name=email_verified,Value=true `
  --temporary-password "Temp1234!"

aws cognito-idp admin-add-user-to-group `
  --user-pool-id ap-northeast-2_NCbbx3Ilm `
  --username admin@chum7.com `
  --group-name admins

# PROD
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

### 5️⃣ S3 버킷 확인 (이미 존재해야 함)

```
S3 → Buckets
```

**확인:**
- ✅ chme-dev (DEV Static)
- ✅ chum7-dev-uploads (DEV Uploads)
- ✅ chme-prod-static (PROD Static)
- ✅ chum7-prod-uploads (PROD Uploads)

**CORS 설정 확인 (Uploads 버킷):**
```
S3 → chum7-dev-uploads → Permissions 탭 → CORS 섹션

[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": [
      "https://test.chum7.com",
      "http://localhost:5173"
    ],
    "ExposeHeaders": ["ETag"]
  }
]
```

**PROD:**
```
S3 → chum7-prod-uploads → Permissions 탭 → CORS 섹션

[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": [
      "https://www.chum7.com",
      "https://admin.chum7.com"
    ],
    "ExposeHeaders": ["ETag"]
  }
]
```

---

### 6️⃣ CloudFront 확인

```
CloudFront → Distributions
```

**DEV (ESKW3DS5HUUK9):**
- ✅ Domain: test.chum7.com
- ✅ Origins: S3 Static + S3 Uploads
- ✅ Behaviors: /uploads/* → Uploads, 나머지 → Static
- ✅ SSL Certificate: *.chum7.com

**PROD (EUM1ULUXR9NQZ):**
- ✅ Domain: www.chum7.com, admin.chum7.com
- ✅ Origins: S3 Static + S3 Uploads
- ✅ Behaviors: /uploads/* → Uploads, 나머지 → Static
- ✅ SSL Certificate: *.chum7.com

---

### 7️⃣ API Gateway 확인 (CDK가 새로 만듭니다!)

⚠️ **중요: 기존 API Gateway ID는 사용 안 함!**

CDK Core Stack이 새로운 API Gateway를 생성합니다:
- DEV: `chme-dev-api` (새로 생성)
- PROD: `chme-prod-api` (새로 생성)

**기존 API Gateway가 있다면:**
- 그대로 두거나 삭제해도 무방
- CDK가 새로운 API를 만듦

**배포 후 확인:**
```
API Gateway → APIs → chme-dev-api (또는 chme-prod-api)
→ Routes 확인
→ 25개 엔드포인트 생성되었는지 확인
```

---

### 8️⃣ Route 53 확인

```
Route 53 → Hosted zones → chum7.com
```

**확인할 레코드:**
- ✅ test.chum7.com → CloudFront (ESKW3DS5HUUK9)
- ✅ dev.chum7.com → API Gateway (새로 생성될 예정)
- ✅ admin-dev.chum7.com → CloudFront
- ✅ www.chum7.com → CloudFront (EUM1ULUXR9NQZ)
- ✅ api.chum7.com → API Gateway (새로 생성될 예정)
- ✅ admin.chum7.com → CloudFront

**API Gateway 도메인은 배포 후 생성:**
CDK 배포 후 API Gateway Custom Domain을 Route 53에 연결해야 합니다.

---

## 📋 배포 전 최종 체크리스트

### 필수 설정
- [ ] Cognito Callback URL 설정 (DEV)
- [ ] Cognito Callback URL 설정 (PROD)
- [ ] Cognito Admins 그룹 존재 확인
- [ ] 관리자 사용자 생성 + admins 그룹 추가
- [ ] S3 Uploads CORS 설정 확인

### 확인만 하면 되는 것들
- [ ] S3 버킷 4개 존재 확인
- [ ] CloudFront 2개 Distribution 작동 확인
- [ ] Cognito User Pool 2개 존재 확인
- [ ] Route 53 레코드 확인

---

## 🚀 배포 후 확인할 것들

### 1. API Gateway Endpoints
```powershell
# DEV
aws apigateway get-rest-apis --region ap-northeast-2 | grep chme-dev-api

# PROD  
aws apigateway get-rest-apis --region ap-northeast-2 | grep chme-prod-api
```

### 2. DynamoDB Tables (6개)
```
DynamoDB → Tables

✅ chme-dev-users
✅ chme-dev-challenges
✅ chme-dev-user-challenges
✅ chme-dev-verifications
✅ chme-dev-cheers
✅ chme-dev-user-cheer-tickets

(PROD도 동일)
```

### 3. Lambda Functions (28개)
```
Lambda → Functions

DEV (14개):
✅ chme-dev-auth-register
✅ chme-dev-auth-login
... (총 14개)

PROD (14개):
✅ chme-prod-auth-register
... (총 14개)
```

### 4. EventBridge Rule
```
EventBridge → Rules

✅ chme-dev-scheduled-cheer-sender (1분마다)
✅ chme-prod-scheduled-cheer-sender (1분마다)
```

---

## ⚡ 빠른 설정 스크립트

**Cognito Callback URL만 콘솔에서 수동 설정하면 되고,**
**관리자 사용자는 PowerShell로 빠르게:**

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

## ✅ 최종 정리

**배포 전 콘솔 작업 (5분):**
1. Cognito Callback URL 설정 (DEV + PROD)
2. S3 CORS 설정 확인 (Uploads 버킷)
3. 관리자 사용자 생성 (PowerShell 또는 콘솔)

**나머지는 CDK가 자동 생성:**
- API Gateway
- Lambda 28개
- DynamoDB 6개
- EventBridge Rule
- SNS Topic

**배포만 하면 끝입니다!** 🚀
