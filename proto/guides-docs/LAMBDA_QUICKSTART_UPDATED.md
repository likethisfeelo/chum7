# Lambda 배포 빠른 시작 가이드 🚀

## 🔑 기존 Role 사용

**Role 이름:** `chum7_lambda_first`
**Role ARN:** `arn:aws:iam::532393804562:role/chum7_lambda_first`

---

## ⚡ 빠른 배포 (2가지 방법)

### 방법 1: 자동 배포 (추천!) ⭐
```powershell
# 전체 Lambda 자동 배포
.\deploy-all-lambdas.ps1 -Stage dev
```

**자동으로 처리:**
- ✅ package.json 생성
- ✅ npm install 실행
- ✅ ZIP 압축
- ✅ Lambda 생성/업데이트
- ✅ 환경 변수 설정

---

### 방법 2: 수동 배포 (개별)
각 Lambda를 하나씩 수동으로 배포하려면:

**`LAMBDA_MANUAL_COMMANDS_28.md` 파일 참고**

각 Lambda별로:
1. 폴더 이동
2. package.json 생성
3. npm install
4. ZIP 압축
5. Lambda 생성/업데이트

---

## 📦 제공된 파일 (2개)

### 1. **deploy-all-lambdas.ps1** (자동 배포)
- 28개 Lambda 자동 배포
- Role: `chum7_lambda_first` 사용
- 환경 변수 자동 설정

### 2. **LAMBDA_MANUAL_COMMANDS_28.md** (수동 배포)
- 28개 Lambda 개별 명령어
- 각 폴더별 상세 가이드
- 복붙 가능한 PowerShell 명령어

---

## 🚀 자동 배포 사용법

### Step 1: 스크립트 실행
```powershell
cd C:\chum7
.\deploy-all-lambdas.ps1 -Stage dev
```

### Step 2: 진행 상황 확인
```
[1/28] 📦 Processing: chme-dev-auth-register
   Path: C:\chum7\backend\services\auth\register
   📝 Creating package.json...
   📥 Installing dependencies...
   📦 Creating ZIP...
   ✨ Creating function...
   ✅ Success!

[2/28] 📦 Processing: chme-dev-auth-login
   ...
```

### Step 3: 완료 확인
```powershell
aws lambda list-functions --region ap-northeast-2 --query "Functions[?starts_with(FunctionName, 'chme-dev')].FunctionName" --output table
```

---

## 📋 배포되는 Lambda 함수 (28개)

### Auth (5개)
```
✅ chme-dev-auth-register
✅ chme-dev-auth-login
✅ chme-dev-auth-refresh
✅ chme-dev-auth-get-profile
✅ chme-dev-auth-update-profile
```

### Challenge (5개)
```
✅ chme-dev-challenge-list
✅ chme-dev-challenge-detail
✅ chme-dev-challenge-join
✅ chme-dev-challenge-my
✅ chme-dev-challenge-stats
```

### Verification (5개)
```
✅ chme-dev-verification-submit
✅ chme-dev-verification-get
✅ chme-dev-verification-list
✅ chme-dev-verification-upload-url
✅ chme-dev-verification-remedy
```

### Cheer (7개)
```
✅ chme-dev-cheer-send-immediate
✅ chme-dev-cheer-use-ticket
✅ chme-dev-cheer-send-scheduled
✅ chme-dev-cheer-get-targets
✅ chme-dev-cheer-thank
✅ chme-dev-cheer-get-my
✅ chme-dev-cheer-get-scheduled
```

### Admin (6개)
```
✅ chme-dev-admin-create-challenge
✅ chme-dev-admin-update-challenge
✅ chme-dev-admin-delete-challenge
✅ chme-dev-admin-toggle-challenge
✅ chme-dev-admin-list-users
✅ chme-dev-admin-stats
```

---

## 🔧 수동 배포 예시

특정 Lambda 하나만 수동으로 배포하려면:

```powershell
# 1. 폴더 이동
cd C:\chum7\backend\services\auth\register

# 2. package.json 생성
@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0",
    "@aws-sdk/client-cognito-identity-provider": "^3.478.0",
    "uuid": "^9.0.1"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

# 3. npm install
npm install

# 4. ZIP 압축
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

# 5. Lambda 생성
aws lambda create-function `
  --function-name chme-dev-auth-register `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,USERS_TABLE=chme-dev-users,USER_POOL_ID=ap-northeast-2_NCbbx3Ilm}" `
  --region ap-northeast-2

# 6. Lambda 업데이트 (이미 존재하면)
aws lambda update-function-code `
  --function-name chme-dev-auth-register `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

**전체 28개 명령어:** `LAMBDA_MANUAL_COMMANDS_28.md` 참고

---

## 📁 폴더 구조

```
C:\chum7\
├── backend/
│   └── services/
│       ├── auth/
│       │   ├── register/
│       │   │   ├── index.js          ← Lambda 코드
│       │   │   ├── package.json      ← 생성 필요
│       │   │   ├── node_modules/     ← npm install
│       │   │   └── function.zip      ← 압축
│       │   ├── login/
│       │   ├── refresh-token/
│       │   ├── get-profile/
│       │   └── update-profile/
│       ├── challenge/
│       ├── verification/
│       ├── cheer/
│       └── admin/
│
└── deploy-all-lambdas.ps1       ← 자동 배포 스크립트
```

---

## 🎯 배포 체크리스트

### 최초 배포
- [ ] AWS CLI 설치 확인 (`aws --version`)
- [ ] Node.js 설치 확인 (`node --version`)
- [ ] AWS 자격증명 설정 (`aws configure`)
- [ ] Lambda Role 확인 (`chum7_lambda_first` 존재 확인)
- [ ] 전체 Lambda 배포 (`.\deploy-all-lambdas.ps1 -Stage dev`)
- [ ] 배포 확인 (`aws lambda list-functions`)

### 업데이트 배포
- [ ] 코드 수정
- [ ] 전체 재배포 (`.\deploy-all-lambdas.ps1 -Stage dev`)
- 또는
- [ ] 개별 Lambda ZIP 재생성 및 업데이트

---

## ⚠️ 주의사항

### 1. Role이 이미 존재해야 합니다
```powershell
# Role 확인
aws iam get-role --role-name chum7_lambda_first
```

### 2. index.js 파일이 각 폴더에 있어야 합니다
```
backend/services/auth/register/index.js  ✅
backend/services/auth/login/index.js     ✅
...
```

### 3. package.json은 스크립트가 자동 생성합니다
자동 배포 스크립트 사용 시 직접 만들 필요 없습니다.

### 4. 환경 변수는 자동 설정됩니다
테이블명, User Pool ID 등 모두 자동으로 설정됩니다.

---

## 🐛 트러블슈팅

### 문제 1: Role 권한 오류
```
An error occurred (AccessDeniedException)
```

**해결:**
```powershell
# Role이 존재하는지 확인
aws iam get-role --role-name chum7_lambda_first

# Role에 필요한 정책이 연결되어 있는지 확인
aws iam list-attached-role-policies --role-name chum7_lambda_first
```

### 문제 2: ZIP 압축 실패
```
Compress-Archive : 파일을 찾을 수 없습니다
```

**해결:**
```powershell
# 현재 경로 확인
pwd

# index.js 파일 존재 확인
ls index.js

# node_modules 존재 확인
ls node_modules
```

### 문제 3: Lambda 생성 실패 (이미 존재)
```
ResourceConflictException: Function already exist
```

**해결:**
```powershell
# 업데이트 명령어 사용
aws lambda update-function-code `
  --function-name [함수명] `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

## 🚀 다음 단계

Lambda 배포 후:

1. **API Gateway 연결**
   - CDK 배포 시 자동 연결됨
   - 수동 연결 시 콘솔에서 설정

2. **DynamoDB 테이블 확인**
   - 6개 테이블 존재 확인
   - GSI 설정 확인

3. **테스트**
   - Postman으로 API 호출
   - Lambda 콘솔에서 직접 테스트

---

## 📚 참고 문서

- **전체 자동 배포:** `deploy-all-lambdas.ps1` 실행
- **개별 수동 배포:** `LAMBDA_MANUAL_COMMANDS_28.md` 참고
- **Role ARN:** `arn:aws:iam::532393804562:role/chum7_lambda_first`

---

## ✅ 완료!

**자동 배포 스크립트 1개 실행으로 28개 Lambda 함수 배포 완료!**

또는 수동으로 각각 배포하려면 `LAMBDA_MANUAL_COMMANDS_28.md` 참고!

---

## 💡 추천 방법

### 처음 배포할 때:
```powershell
.\deploy-all-lambdas.ps1 -Stage dev
```
→ 28개 전부 자동 배포!

### 특정 Lambda만 수정했을 때:
```powershell
cd C:\chum7\backend\services\auth\register
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda update-function-code --function-name chme-dev-auth-register --zip-file fileb://function.zip --region ap-northeast-2
```
→ 해당 Lambda만 빠르게 업데이트!

### 여러 개 수정했을 때:
```powershell
.\deploy-all-lambdas.ps1 -Stage dev
```
→ 전체 재배포! (기존 Lambda는 자동으로 업데이트됨)
