# Lambda 개별 수동 배포 명령어 (28개)
# Role: chum7_lambda_first

## 🔑 공통 정보

**Role ARN:** arn:aws:iam::532393804562:role/chum7_lambda_first
**Region:** ap-northeast-2
**Runtime:** nodejs20.x

---

## 📦 공통 package.json

모든 Lambda 폴더에 이 내용으로 `package.json`을 만드세요:

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

## 🚀 Auth Lambda (5개)

### 1. Register
```powershell
# 경로: backend/services/auth/register/
cd C:\chum7\backend\services\auth\register

# package.json 생성 (위 내용 복사)
# 또는 PowerShell로 생성:
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

# npm 설치
npm install

# ZIP 압축
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

# Lambda 생성
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

# 업데이트 (이미 존재하면)
aws lambda update-function-code `
  --function-name chme-dev-auth-register `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 2. Login
```powershell
# 경로: backend/services/auth/login/
cd C:\chum7\backend\services\auth\login

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-cognito-identity-provider": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-auth-login `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
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

---

### 3. Refresh Token
```powershell
# 경로: backend/services/auth/refresh-token/
cd C:\chum7\backend\services\auth\refresh-token

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-cognito-identity-provider": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-auth-refresh `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
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

---

### 4. Get Profile
```powershell
# 경로: backend/services/auth/get-profile/
cd C:\chum7\backend\services\auth\get-profile

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-auth-get-profile `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
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

---

### 5. Update Profile
```powershell
# 경로: backend/services/auth/update-profile/
cd C:\chum7\backend\services\auth\update-profile

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-auth-update-profile `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
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

## 🏆 Challenge Lambda (5개)

### 6. List
```powershell
# 경로: backend/services/challenge/list/
cd C:\chum7\backend\services\challenge\list

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-challenge-list `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-challenge-list `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 7. Detail
```powershell
# 경로: backend/services/challenge/detail/
cd C:\chum7\backend\services\challenge\detail

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-challenge-detail `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-challenge-detail `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 8. Join
```powershell
# 경로: backend/services/challenge/join/
cd C:\chum7\backend\services\challenge\join

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0",
    "uuid": "^9.0.1"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-challenge-join `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges,USER_CHALLENGES_TABLE=chme-dev-user-challenges}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-challenge-join `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 9. My Challenges
```powershell
# 경로: backend/services/challenge/my-challenges/
cd C:\chum7\backend\services\challenge\my-challenges

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-challenge-my `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,USER_CHALLENGES_TABLE=chme-dev-user-challenges,CHALLENGES_TABLE=chme-dev-challenges}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-challenge-my `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 10. Stats
```powershell
# 경로: backend/services/challenge/stats/
cd C:\chum7\backend\services\challenge\stats

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-challenge-stats `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges,USER_CHALLENGES_TABLE=chme-dev-user-challenges}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-challenge-stats `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

## ✅ Verification Lambda (5개)

### 11. Submit (핵심!)
```powershell
# 경로: backend/services/verification/submit/
cd C:\chum7\backend\services\verification\submit

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0",
    "uuid": "^9.0.1"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-verification-submit `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,VERIFICATIONS_TABLE=chme-dev-verifications,USER_CHALLENGES_TABLE=chme-dev-user-challenges,USER_CHEER_TICKETS_TABLE=chme-dev-user-cheer-tickets}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-verification-submit `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 12. Get
```powershell
# 경로: backend/services/verification/get/
cd C:\chum7\backend\services\verification\get

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-verification-get `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,VERIFICATIONS_TABLE=chme-dev-verifications}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-verification-get `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 13. List
```powershell
# 경로: backend/services/verification/list/
cd C:\chum7\backend\services\verification\list

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-verification-list `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,VERIFICATIONS_TABLE=chme-dev-verifications}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-verification-list `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 14. Upload URL
```powershell
# 경로: backend/services/verification/upload-url/
cd C:\chum7\backend\services\verification\upload-url

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.478.0",
    "@aws-sdk/s3-request-presigner": "^3.478.0",
    "uuid": "^9.0.1"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-verification-upload-url `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,UPLOADS_BUCKET=chum7-dev-uploads}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-verification-upload-url `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 15. Remedy (Day 6)
```powershell
# 경로: backend/services/verification/remedy/
cd C:\chum7\backend\services\verification\remedy

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0",
    "uuid": "^9.0.1"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-verification-remedy `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,VERIFICATIONS_TABLE=chme-dev-verifications,USER_CHALLENGES_TABLE=chme-dev-user-challenges,USER_CHEER_TICKETS_TABLE=chme-dev-user-cheer-tickets}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-verification-remedy `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

## 💝 Cheer Lambda (7개)

### 16. Send Immediate
```powershell
# 경로: backend/services/cheer/send-immediate/
cd C:\chum7\backend\services\cheer\send-immediate

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0",
    "uuid": "^9.0.1"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-cheer-send-immediate `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-cheer-send-immediate `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 17. Use Ticket
```powershell
# 경로: backend/services/cheer/use-ticket/
cd C:\chum7\backend\services\cheer\use-ticket

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0",
    "uuid": "^9.0.1"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-cheer-use-ticket `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers,USER_CHEER_TICKETS_TABLE=chme-dev-user-cheer-tickets}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-cheer-use-ticket `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 18. Send Scheduled
```powershell
# 경로: backend/services/cheer/send-scheduled/
cd C:\chum7\backend\services\cheer\send-scheduled

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0",
    "@aws-sdk/client-sns": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-cheer-send-scheduled `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-cheer-send-scheduled `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 19. Get Targets
```powershell
# 경로: backend/services/cheer/get-targets/
cd C:\chum7\backend\services\cheer\get-targets

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-cheer-get-targets `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,USER_CHALLENGES_TABLE=chme-dev-user-challenges}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-cheer-get-targets `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 20. Thank
```powershell
# 경로: backend/services/cheer/thank/
cd C:\chum7\backend\services\cheer\thank

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-cheer-thank `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-cheer-thank `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 21. Get My Cheers
```powershell
# 경로: backend/services/cheer/get-my-cheers/
cd C:\chum7\backend\services\cheer\get-my-cheers

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-cheer-get-my `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-cheer-get-my `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 22. Get Scheduled
```powershell
# 경로: backend/services/cheer/get-scheduled/
cd C:\chum7\backend\services\cheer\get-scheduled

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-cheer-get-scheduled `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-cheer-get-scheduled `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

## 🛠️ Admin Lambda (6개)

### 23. Create Challenge
```powershell
# 경로: backend/services/admin/challenge/create/
cd C:\chum7\backend\services\admin\challenge\create

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0",
    "uuid": "^9.0.1"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-admin-create-challenge `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-admin-create-challenge `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 24. Update Challenge
```powershell
# 경로: backend/services/admin/challenge/update/
cd C:\chum7\backend\services\admin\challenge\update

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-admin-update-challenge `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-admin-update-challenge `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 25. Delete Challenge
```powershell
# 경로: backend/services/admin/challenge/delete/
cd C:\chum7\backend\services\admin\challenge\delete

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-admin-delete-challenge `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges,USER_CHALLENGES_TABLE=chme-dev-user-challenges}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-admin-delete-challenge `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 26. Toggle Challenge
```powershell
# 경로: backend/services/admin/challenge/toggle/
cd C:\chum7\backend\services\admin\challenge\toggle

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-admin-toggle-challenge `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-admin-toggle-challenge `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 27. List Users
```powershell
# 경로: backend/services/admin/user/list/
cd C:\chum7\backend\services\admin\user\list

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-admin-list-users `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,USERS_TABLE=chme-dev-users}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-admin-list-users `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

### 28. Stats Overview
```powershell
# 경로: backend/services/admin/stats/overview/
cd C:\chum7\backend\services\admin\stats\overview

@'
{
  "name": "lambda-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

aws lambda create-function `
  --function-name chme-dev-admin-stats `
  --runtime nodejs20.x `
  --role arn:aws:iam::532393804562:role/chum7_lambda_first `
  --handler index.handler `
  --zip-file fileb://function.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={STAGE=dev,USERS_TABLE=chme-dev-users,CHALLENGES_TABLE=chme-dev-challenges,USER_CHALLENGES_TABLE=chme-dev-user-challenges}" `
  --region ap-northeast-2

# 업데이트
aws lambda update-function-code `
  --function-name chme-dev-admin-stats `
  --zip-file fileb://function.zip `
  --region ap-northeast-2
```

---

## ✅ 배포 확인

```powershell
# 전체 Lambda 목록 확인
aws lambda list-functions --region ap-northeast-2 --query "Functions[?starts_with(FunctionName, 'chme-dev')].FunctionName" --output table

# 특정 Lambda 상세 확인
aws lambda get-function --function-name chme-dev-auth-register --region ap-northeast-2
```

---

## 🎯 완료!

**28개 Lambda 함수 전부 수동 배포 완료!**

Role: `arn:aws:iam::532393804562:role/chum7_lambda_first`
