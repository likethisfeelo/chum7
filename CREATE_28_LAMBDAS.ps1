# =============================================================================
# 28개 Lambda 생성 명령어 (복붙용)
# Role: chum7_lambda_first
# =============================================================================

# ------------------------------------------------------------------------------
# Auth Lambda (5개)
# ------------------------------------------------------------------------------

# 1. Register
cd C:\chum7\backend\services\auth\register
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0","@aws-sdk/client-cognito-identity-provider":"^3.478.0","uuid":"^9.0.1"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-auth-register --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,USERS_TABLE=chme-dev-users,USER_POOL_ID=ap-northeast-2_NCbbx3Ilm}" --region ap-northeast-2

# 2. Login
cd C:\chum7\backend\services\auth\login
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-cognito-identity-provider":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-auth-login --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,USER_POOL_ID=ap-northeast-2_NCbbx3Ilm,CLIENT_ID=6aalogssb8bb70rtg63a2l7jdb}" --region ap-northeast-2

# 3. Refresh Token
cd C:\chum7\backend\services\auth\refresh-token
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-cognito-identity-provider":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-auth-refresh --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,USER_POOL_ID=ap-northeast-2_NCbbx3Ilm,CLIENT_ID=6aalogssb8bb70rtg63a2l7jdb}" --region ap-northeast-2

# 4. Get Profile
cd C:\chum7\backend\services\auth\get-profile
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-auth-get-profile --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,USERS_TABLE=chme-dev-users}" --region ap-northeast-2

# 5. Update Profile
cd C:\chum7\backend\services\auth\update-profile
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-auth-update-profile --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,USERS_TABLE=chme-dev-users}" --region ap-northeast-2

# ------------------------------------------------------------------------------
# Challenge Lambda (5개)
# ------------------------------------------------------------------------------

# 6. List
cd C:\chum7\backend\services\challenge\list
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-challenge-list --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges}" --region ap-northeast-2

# 7. Detail
cd C:\chum7\backend\services\challenge\detail
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-challenge-detail --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges}" --region ap-northeast-2

# 8. Join
cd C:\chum7\backend\services\challenge\join
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0","uuid":"^9.0.1"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-challenge-join --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges,USER_CHALLENGES_TABLE=chme-dev-user-challenges}" --region ap-northeast-2

# 9. My Challenges
cd C:\chum7\backend\services\challenge\my-challenges
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-challenge-my --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,USER_CHALLENGES_TABLE=chme-dev-user-challenges,CHALLENGES_TABLE=chme-dev-challenges}" --region ap-northeast-2

# 10. Stats
cd C:\chum7\backend\services\challenge\stats
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-challenge-stats --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges,USER_CHALLENGES_TABLE=chme-dev-user-challenges}" --region ap-northeast-2

# ------------------------------------------------------------------------------
# Verification Lambda (5개)
# ------------------------------------------------------------------------------

# 11. Submit
cd C:\chum7\backend\services\verification\submit
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0","uuid":"^9.0.1"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-verification-submit --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,VERIFICATIONS_TABLE=chme-dev-verifications,USER_CHALLENGES_TABLE=chme-dev-user-challenges,USER_CHEER_TICKETS_TABLE=chme-dev-user-cheer-tickets}" --region ap-northeast-2

# 12. Get
cd C:\chum7\backend\services\verification\get
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-verification-get --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,VERIFICATIONS_TABLE=chme-dev-verifications}" --region ap-northeast-2

# 13. List
cd C:\chum7\backend\services\verification\list
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-verification-list --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,VERIFICATIONS_TABLE=chme-dev-verifications}" --region ap-northeast-2

# 14. Upload URL
cd C:\chum7\backend\services\verification\upload-url
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-s3":"^3.478.0","@aws-sdk/s3-request-presigner":"^3.478.0","uuid":"^9.0.1"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-verification-upload-url --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,UPLOADS_BUCKET=chum7-dev-uploads}" --region ap-northeast-2

# 15. Remedy
cd C:\chum7\backend\services\verification\remedy
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0","uuid":"^9.0.1"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-verification-remedy --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,VERIFICATIONS_TABLE=chme-dev-verifications,USER_CHALLENGES_TABLE=chme-dev-user-challenges,USER_CHEER_TICKETS_TABLE=chme-dev-user-cheer-tickets}" --region ap-northeast-2

# ------------------------------------------------------------------------------
# Cheer Lambda (7개)
# ------------------------------------------------------------------------------

# 16. Send Immediate
cd C:\chum7\backend\services\cheer\send-immediate
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0","uuid":"^9.0.1"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-cheer-send-immediate --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers}" --region ap-northeast-2

# 17. Use Ticket
cd C:\chum7\backend\services\cheer\use-ticket
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0","uuid":"^9.0.1"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-cheer-use-ticket --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers,USER_CHEER_TICKETS_TABLE=chme-dev-user-cheer-tickets}" --region ap-northeast-2

# 18. Send Scheduled
cd C:\chum7\backend\services\cheer\send-scheduled
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0","@aws-sdk/client-sns":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-cheer-send-scheduled --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers}" --region ap-northeast-2

# 19. Get Targets
cd C:\chum7\backend\services\cheer\get-targets
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-cheer-get-targets --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,USER_CHALLENGES_TABLE=chme-dev-user-challenges}" --region ap-northeast-2

# 20. Thank
cd C:\chum7\backend\services\cheer\thank
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-cheer-thank --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers}" --region ap-northeast-2

# 21. Get My Cheers
cd C:\chum7\backend\services\cheer\get-my-cheers
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-cheer-get-my --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers}" --region ap-northeast-2

# 22. Get Scheduled
cd C:\chum7\backend\services\cheer\get-scheduled
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-cheer-get-scheduled --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,CHEERS_TABLE=chme-dev-cheers}" --region ap-northeast-2

# ------------------------------------------------------------------------------
# Admin Lambda (6개)
# ------------------------------------------------------------------------------

# 23. Create Challenge
cd C:\chum7\backend\services\admin\challenge\create
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0","uuid":"^9.0.1"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-admin-create-challenge --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges}" --region ap-northeast-2

# 24. Update Challenge
cd C:\chum7\backend\services\admin\challenge\update
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-admin-update-challenge --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges}" --region ap-northeast-2

# 25. Delete Challenge
cd C:\chum7\backend\services\admin\challenge\delete
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-admin-delete-challenge --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges,USER_CHALLENGES_TABLE=chme-dev-user-challenges}" --region ap-northeast-2

# 26. Toggle Challenge
cd C:\chum7\backend\services\admin\challenge\toggle
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-admin-toggle-challenge --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,CHALLENGES_TABLE=chme-dev-challenges}" --region ap-northeast-2

# 27. List Users
cd C:\chum7\backend\services\admin\user\list
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-admin-list-users --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,USERS_TABLE=chme-dev-users}" --region ap-northeast-2

# 28. Stats Overview
cd C:\chum7\backend\services\admin\stats\overview
@'{"name":"lambda-function","version":"1.0.0","main":"index.js","dependencies":{"@aws-sdk/client-dynamodb":"^3.478.0","@aws-sdk/lib-dynamodb":"^3.478.0"}}'@ | Out-File package.json -Encoding utf8
npm install
Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force
aws lambda create-function --function-name chme-dev-admin-stats --runtime nodejs20.x --role arn:aws:iam::532393804562:role/chum7_lambda_first --handler index.handler --zip-file fileb://function.zip --timeout 30 --memory-size 256 --environment "Variables={STAGE=dev,USERS_TABLE=chme-dev-users,CHALLENGES_TABLE=chme-dev-challenges,USER_CHALLENGES_TABLE=chme-dev-user-challenges}" --region ap-northeast-2

# =============================================================================
# 배포 확인
# =============================================================================

# Lambda 목록 확인
aws lambda list-functions --region ap-northeast-2 --query "Functions[?starts_with(FunctionName, 'chme-dev')].FunctionName" --output table

# 개수 확인 (28개여야 함)
aws lambda list-functions --region ap-northeast-2 --query "length(Functions[?starts_with(FunctionName, 'chme-dev')])"
