# Lambda 개별 수동 배포 가이드

각 Lambda 함수를 개별적으로 수동 배포하는 방법입니다.

---

## 📋 공통 package.json

모든 Lambda 폴더에 이 package.json을 복사하세요.

```json
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0",
    "@aws-sdk/client-s3": "^3.478.0",
    "@aws-sdk/client-cognito-identity-provider": "^3.478.0",
    "@aws-sdk/client-sns": "^3.478.0",
    "@aws-sdk/s3-request-presigner": "^3.478.0",
    "uuid": "^9.0.1"
  }
}
```

---

## 🚀 배포 단계 (4단계)

### Step 1: 폴더 이동
```powershell
cd C:\chum7\backend\services\[category]\[function]
# 예: cd C:\chum7\backend\services\auth\register
```

### Step 2: package.json 생성
```powershell
# 위의 공통 package.json 내용을 복사해서 저장
```

### Step 3: 의존성 설치
```powershell
npm install
```

### Step 4: ZIP 압축
```powershell
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
```

### Step 5: Lambda 배포
```powershell
# 생성 (처음)
aws lambda create-function `
  --function-name [함수명] `
  --runtime nodejs20.x `
  --role [Role ARN] `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={...}" `
  --region ap-northeast-2

# 업데이트 (이미 존재하면)
aws lambda update-function-code `
  --function-name [함수명] `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

## 📦 Lambda 함수별 상세 명령어

### ✅ Auth Lambda (5개)

#### 1. Register
```powershell
# 경로: backend/services/auth/register/
cd C:\chum7\backend\services\auth\register

# package.json 생성 (위의 공통 템플릿 사용)

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

# DEV 배포
aws lambda create-function `
  --function-name chme-dev-auth-register `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,USERS_TABLE=chme-dev-users,USER_POOL_ID=ap-northeast-2_NCbbx3Ilm}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-auth-register `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

#### 2. Login
```powershell
# 경로: backend/services/auth/login/
cd C:\chum7\backend\services\auth\login

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

# DEV 배포
aws lambda create-function `
  --function-name chme-dev-auth-login `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,USER_POOL_ID=ap-northeast-2_NCbbx3Ilm,CLIENT_ID=6aalogssb8bb70rtg63a2l7jdb}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-auth-login `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

#### 3. Refresh Token
```powershell
# 경로: backend/services/auth/refresh-token/
cd C:\chum7\backend\services\auth\refresh-token

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

# DEV 배포
aws lambda create-function `
  --function-name chme-dev-auth-refresh `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,USER_POOL_ID=ap-northeast-2_NCbbx3Ilm,CLIENT_ID=6aalogssb8bb70rtg63a2l7jdb}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-auth-refresh `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

#### 4. Get Profile
```powershell
# 경로: backend/services/auth/get-profile/
cd C:\chum7\backend\services\auth\get-profile

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

# DEV 배포
aws lambda create-function `
  --function-name chme-dev-auth-get-profile `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,USERS_TABLE=chme-dev-users}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-auth-get-profile `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

#### 5. Update Profile
```powershell
# 경로: backend/services/auth/update-profile/
cd C:\chum7\backend\services\auth\update-profile

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

# DEV 배포
aws lambda create-function `
  --function-name chme-dev-auth-update-profile `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,USERS_TABLE=chme-dev-users}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-auth-update-profile `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 🏆 Challenge Lambda (5개)

#### 1. List
```powershell
# 경로: backend/services/challenge/list/
cd C:\chum7\backend\services\challenge\list

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-challenge-list `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges}" `
  --region ap-northeast-2
```

#### 2. Detail
```powershell
# 경로: backend/services/challenge/detail/
cd C:\chum7\backend\services\challenge\detail

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-challenge-detail `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges}" `
  --region ap-northeast-2
```

#### 3. Join
```powershell
# 경로: backend/services/challenge/join/
cd C:\chum7\backend\services\challenge\join

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-challenge-join `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges,USER_CHALLENGES_TABLE=chme-dev-user-challenges}" `
  --region ap-northeast-2
```

#### 4. My Challenges
```powershell
# 경로: backend/services/challenge/my-challenges/
cd C:\chum7\backend\services\challenge\my-challenges

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-challenge-my `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,USER_CHALLENGES_TABLE=chme-dev-user-challenges,CHALLENGES_TABLE=chme-dev-challenges}" `
  --region ap-northeast-2
```

#### 5. Stats
```powershell
# 경로: backend/services/challenge/stats/
cd C:\chum7\backend\services\challenge\stats

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-challenge-stats `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges,USER_CHALLENGES_TABLE=chme-dev-user-challenges}" `
  --region ap-northeast-2
```

---

### ✅ Verification Lambda (5개)

#### 1. Submit (핵심!)
```powershell
# 경로: backend/services/verification/submit/
cd C:\chum7\backend\services\verification\submit

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-verification-submit `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,VERIFICATIONS_TABLE=chme-dev-verifications,USER_CHALLENGES_TABLE=chme-dev-user-challenges,USER_CHEER_TICKETS_TABLE=chme-dev-user-cheer-tickets}" `
  --region ap-northeast-2
```

#### 2. Get
```powershell
# 경로: backend/services/verification/get/
cd C:\chum7\backend\services\verification\get

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-verification-get `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,VERIFICATIONS_TABLE=chme-dev-verifications}" `
  --region ap-northeast-2
```

#### 3. List
```powershell
# 경로: backend/services/verification/list/
cd C:\chum7\backend\services\verification\list

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-verification-list `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,VERIFICATIONS_TABLE=chme-dev-verifications}" `
  --region ap-northeast-2
```

#### 4. Upload URL
```powershell
# 경로: backend/services/verification/upload-url/
cd C:\chum7\backend\services\verification\upload-url

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-verification-upload-url `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,UPLOADS_BUCKET=chum7-dev-uploads}" `
  --region ap-northeast-2
```

#### 5. Remedy (Day 6)
```powershell
# 경로: backend/services/verification/remedy/
cd C:\chum7\backend\services\verification\remedy

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-verification-remedy `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,VERIFICATIONS_TABLE=chme-dev-verifications,USER_CHALLENGES_TABLE=chme-dev-user-challenges,USER_CHEER_TICKETS_TABLE=chme-dev-user-cheer-tickets}" `
  --region ap-northeast-2
```

---

### 💝 Cheer Lambda (7개)

#### 1. Send Immediate
```powershell
# 경로: backend/services/cheer/send-immediate/
cd C:\chum7\backend\services\cheer\send-immediate

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-cheer-send-immediate `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers}" `
  --region ap-northeast-2
```

#### 2. Use Ticket
```powershell
# 경로: backend/services/cheer/use-ticket/
cd C:\chum7\backend\services\cheer\use-ticket

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-cheer-use-ticket `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers,USER_CHEER_TICKETS_TABLE=chme-dev-user-cheer-tickets}" `
  --region ap-northeast-2
```

#### 3. Send Scheduled
```powershell
# 경로: backend/services/cheer/send-scheduled/
cd C:\chum7\backend\services\cheer\send-scheduled

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-cheer-send-scheduled `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers}" `
  --region ap-northeast-2
```

#### 4. Get Targets
```powershell
# 경로: backend/services/cheer/get-targets/
cd C:\chum7\backend\services\cheer\get-targets

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-cheer-get-targets `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,USER_CHALLENGES_TABLE=chme-dev-user-challenges}" `
  --region ap-northeast-2
```

#### 5. Thank
```powershell
# 경로: backend/services/cheer/thank/
cd C:\chum7\backend\services\cheer\thank

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-cheer-thank `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers}" `
  --region ap-northeast-2
```

#### 6. Get My Cheers
```powershell
# 경로: backend/services/cheer/get-my-cheers/
cd C:\chum7\backend\services\cheer\get-my-cheers

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-cheer-get-my `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers}" `
  --region ap-northeast-2
```

#### 7. Get Scheduled
```powershell
# 경로: backend/services/cheer/get-scheduled/
cd C:\chum7\backend\services\cheer\get-scheduled

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-cheer-get-scheduled `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers}" `
  --region ap-northeast-2
```

---

### 🛠️ Admin Lambda (6개)

#### 1. Create Challenge
```powershell
# 경로: backend/services/admin/challenge/create/
cd C:\chum7\backend\services\admin\challenge\create

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-admin-create-challenge `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges}" `
  --region ap-northeast-2
```

#### 2. Update Challenge
```powershell
# 경로: backend/services/admin/challenge/update/
cd C:\chum7\backend\services\admin\challenge\update

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-admin-update-challenge `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges}" `
  --region ap-northeast-2
```

#### 3. Delete Challenge
```powershell
# 경로: backend/services/admin/challenge/delete/
cd C:\chum7\backend\services\admin\challenge\delete

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-admin-delete-challenge `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges,USER_CHALLENGES_TABLE=chme-dev-user-challenges}" `
  --region ap-northeast-2
```

#### 4. Toggle Challenge
```powershell
# 경로: backend/services/admin/challenge/toggle/
cd C:\chum7\backend\services\admin\challenge\toggle

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-admin-toggle-challenge `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges}" `
  --region ap-northeast-2
```

#### 5. List Users
```powershell
# 경로: backend/services/admin/user/list/
cd C:\chum7\backend\services\admin\user\list

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-admin-list-users `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,USERS_TABLE=chme-dev-users}" `
  --region ap-northeast-2
```

#### 6. Stats Overview
```powershell
# 경로: backend/services/admin/stats/overview/
cd C:\chum7\backend\services\admin\stats\overview

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-admin-stats `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chme-dev-lambda-role `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,USERS_TABLE=chme-dev-users,CHALLENGES_TABLE=chme-dev-challenges,USER_CHALLENGES_TABLE=chme-dev-user-challenges}" `
  --region ap-northeast-2
```

---

## 🎯 완료!

**28개 Lambda 함수 전부 배포 완료!**

배포된 Lambda 확인:
```powershell
aws lambda list-functions --region ap-northeast-2 --query "Functions[?starts_with(FunctionName, 'chme-dev')].FunctionName" --output table
```
