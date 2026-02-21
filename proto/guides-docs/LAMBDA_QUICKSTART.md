# Lambda 배포 빠른 시작 가이드 🚀

## 📦 제공된 파일 3개

1. **create-lambda-role.ps1** - IAM Role 생성 (최초 1회)
2. **deploy-all-lambdas.ps1** - 28개 Lambda 자동 배포 ⭐
3. **LAMBDA_MANUAL_DEPLOY_GUIDE.md** - 개별 수동 배포 가이드

---

## ⚡ 빠른 배포 (3단계)

### Step 1: IAM Role 생성 (최초 1회)
```powershell
cd C:\chum7
.\create-lambda-role.ps1
```

**생성되는 Role:**
- `chme-dev-lambda-role` (DEV용)
- `chme-prod-lambda-role` (PROD용)

---

### Step 2: 전체 Lambda 배포 (자동)
```powershell
# DEV 배포 (28개 Lambda)
.\deploy-all-lambdas.ps1 -Stage dev

# PROD 배포 (28개 Lambda)
.\deploy-all-lambdas.ps1 -Stage prod
```

**자동으로 처리:**
- ✅ package.json 생성
- ✅ npm install 실행
- ✅ ZIP 압축
- ✅ Lambda 생성/업데이트
- ✅ 환경 변수 설정

---

### Step 3: 배포 확인
```powershell
# DEV Lambda 목록
aws lambda list-functions --region ap-northeast-2 --query "Functions[?starts_with(FunctionName, 'chme-dev')].FunctionName" --output table

# PROD Lambda 목록
aws lambda list-functions --region ap-northeast-2 --query "Functions[?starts_with(FunctionName, 'chme-prod')].FunctionName" --output table
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

## 🔧 개별 Lambda 수동 배포

특정 Lambda만 업데이트하려면:

### 예시: Auth Register 업데이트
```powershell
cd C:\chum7\backend\services\auth\register

# 이미 package.json과 node_modules가 있으면
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda update-function-code `
  --function-name chme-dev-auth-register `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

**자세한 내용:** `LAMBDA_MANUAL_DEPLOY_GUIDE.md` 참고

---

## 📁 폴더 구조

```
C:\chum7\
├── backend/
│   └── services/
│       ├── auth/
│       │   ├── register/
│       │   │   ├── index.js          ← Lambda 코드
│       │   │   ├── package.json      ← 자동 생성
│       │   │   ├── node_modules/     ← 자동 설치
│       │   │   └── function.zip      ← 자동 압축
│       │   ├── login/
│       │   ├── refresh-token/
│       │   ├── get-profile/
│       │   └── update-profile/
│       │
│       ├── challenge/
│       │   ├── list/
│       │   ├── detail/
│       │   ├── join/
│       │   ├── my-challenges/
│       │   └── stats/
│       │
│       ├── verification/
│       │   ├── submit/
│       │   ├── get/
│       │   ├── list/
│       │   ├── upload-url/
│       │   └── remedy/
│       │
│       ├── cheer/
│       │   ├── send-immediate/
│       │   ├── use-ticket/
│       │   ├── send-scheduled/
│       │   ├── get-targets/
│       │   ├── thank/
│       │   ├── get-my-cheers/
│       │   └── get-scheduled/
│       │
│       └── admin/
│           ├── challenge/
│           │   ├── create/
│           │   ├── update/
│           │   ├── delete/
│           │   └── toggle/
│           ├── user/
│           │   └── list/
│           └── stats/
│               └── overview/
│
├── create-lambda-role.ps1       ← IAM Role 생성
└── deploy-all-lambdas.ps1       ← 전체 배포
```

---

## 🎯 배포 체크리스트

### 최초 배포
- [ ] AWS CLI 설치 확인 (`aws --version`)
- [ ] Node.js 설치 확인 (`node --version`)
- [ ] AWS 자격증명 설정 (`aws configure`)
- [ ] IAM Role 생성 (`.\create-lambda-role.ps1`)
- [ ] 전체 Lambda 배포 (`.\deploy-all-lambdas.ps1 -Stage dev`)
- [ ] 배포 확인 (`aws lambda list-functions`)

### 업데이트 배포
- [ ] 코드 수정
- [ ] 전체 재배포 (`.\deploy-all-lambdas.ps1 -Stage dev`)
- 또는
- [ ] 개별 Lambda ZIP 재생성 및 업데이트

---

## ⚠️ 주의사항

### 1. package.json은 자동 생성됩니다
`deploy-all-lambdas.ps1` 스크립트가 각 폴더에 자동으로 생성합니다.

### 2. node_modules는 압축에 포함됩니다
Lambda에 업로드하는 ZIP에는 `index.js` + `node_modules`가 포함됩니다.

### 3. 환경 변수는 자동 설정됩니다
스크립트가 각 Lambda에 필요한 환경 변수를 자동으로 설정합니다.

### 4. 기존 Lambda가 있으면 업데이트됩니다
`create-function` 실패 시 자동으로 `update-function-code` 실행합니다.

---

## 🐛 트러블슈팅

### 문제 1: IAM Role 권한 오류
```
An error occurred (AccessDeniedException)
```

**해결:**
```powershell
# Role이 제대로 생성되었는지 확인
aws iam get-role --role-name chme-dev-lambda-role
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

### 문제 3: npm install 실패
```
npm ERR! code ENOENT
```

**해결:**
```powershell
# Node.js 설치 확인
node --version

# package.json 존재 확인
ls package.json
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
- **개별 수동 배포:** `LAMBDA_MANUAL_DEPLOY_GUIDE.md` 참고
- **IAM Role 생성:** `create-lambda-role.ps1` 실행

---

## ✅ 완료!

**28개 Lambda 함수가 배포되었습니다!**

다음 작업:
- API Gateway 엔드포인트 확인
- Postman으로 테스트
- 프론트엔드 연동
