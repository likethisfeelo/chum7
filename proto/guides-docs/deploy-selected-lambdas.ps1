# deploy-selected-lambdas.ps1
# 필요한 Lambda만 선택해서 생성하는 스크립트

$ErrorActionPreference = "Stop"

# =============================================================================
# 선택할 Lambda 목록 (필요한 것만 주석 해제)
# =============================================================================

$lambdas = @(
    # Auth (5개) - 인증 필수!
    @{name="chme-dev-auth-register"; path="C:\chum7\backend\services\auth\register"; env=@{STAGE="dev";USERS_TABLE="chme-dev-users";USER_POOL_ID="ap-northeast-2_NCbbx3Ilm"}},
    @{name="chme-dev-auth-login"; path="C:\chum7\backend\services\auth\login"; env=@{STAGE="dev";USER_POOL_ID="ap-northeast-2_NCbbx3Ilm";CLIENT_ID="6aalogssb8bb70rtg63a2l7jdb"}},
    @{name="chme-dev-auth-refresh"; path="C:\chum7\backend\services\auth\refresh-token"; env=@{STAGE="dev";USER_POOL_ID="ap-northeast-2_NCbbx3Ilm";CLIENT_ID="6aalogssb8bb70rtg63a2l7jdb"}},
    @{name="chme-dev-auth-get-profile"; path="C:\chum7\backend\services\auth\get-profile"; env=@{STAGE="dev";USERS_TABLE="chme-dev-users"}},
    @{name="chme-dev-auth-update-profile"; path="C:\chum7\backend\services\auth\update-profile"; env=@{STAGE="dev";USERS_TABLE="chme-dev-users"}},

    # Challenge (5개) - 챌린지 기본 기능
    @{name="chme-dev-challenge-list"; path="C:\chum7\backend\services\challenge\list"; env=@{STAGE="dev";CHALLENGES_TABLE="chme-dev-challenges"}},
    @{name="chme-dev-challenge-detail"; path="C:\chum7\backend\services\challenge\detail"; env=@{STAGE="dev";CHALLENGES_TABLE="chme-dev-challenges"}},
    @{name="chme-dev-challenge-join"; path="C:\chum7\backend\services\challenge\join"; env=@{STAGE="dev";CHALLENGES_TABLE="chme-dev-challenges";USER_CHALLENGES_TABLE="chme-dev-user-challenges"}},
    @{name="chme-dev-challenge-my"; path="C:\chum7\backend\services\challenge\my-challenges"; env=@{STAGE="dev";USER_CHALLENGES_TABLE="chme-dev-user-challenges";CHALLENGES_TABLE="chme-dev-challenges"}},
    @{name="chme-dev-challenge-stats"; path="C:\chum7\backend\services\challenge\stats"; env=@{STAGE="dev";CHALLENGES_TABLE="chme-dev-challenges";USER_CHALLENGES_TABLE="chme-dev-user-challenges"}}

    # Verification (5개) - 인증 시스템
    # @{name="chme-dev-verification-submit"; path="C:\chum7\backend\services\verification\submit"; env=@{STAGE="dev";VERIFICATIONS_TABLE="chme-dev-verifications";USER_CHALLENGES_TABLE="chme-dev-user-challenges";USER_CHEER_TICKETS_TABLE="chme-dev-user-cheer-tickets"}},
    # @{name="chme-dev-verification-get"; path="C:\chum7\backend\services\verification\get"; env=@{STAGE="dev";VERIFICATIONS_TABLE="chme-dev-verifications"}},
    # @{name="chme-dev-verification-list"; path="C:\chum7\backend\services\verification\list"; env=@{STAGE="dev";VERIFICATIONS_TABLE="chme-dev-verifications"}},
    # @{name="chme-dev-verification-upload-url"; path="C:\chum7\backend\services\verification\upload-url"; env=@{STAGE="dev";UPLOADS_BUCKET="chum7-dev-uploads"}},
    # @{name="chme-dev-verification-remedy"; path="C:\chum7\backend\services\verification\remedy"; env=@{STAGE="dev";VERIFICATIONS_TABLE="chme-dev-verifications";USER_CHALLENGES_TABLE="chme-dev-user-challenges";USER_CHEER_TICKETS_TABLE="chme-dev-user-cheer-tickets"}},

    # Cheer (7개) - 응원 시스템
    # @{name="chme-dev-cheer-send-immediate"; path="C:\chum7\backend\services\cheer\send-immediate"; env=@{STAGE="dev";CHEERS_TABLE="chme-dev-cheers"}},
    # @{name="chme-dev-cheer-use-ticket"; path="C:\chum7\backend\services\cheer\use-ticket"; env=@{STAGE="dev";CHEERS_TABLE="chme-dev-cheers";USER_CHEER_TICKETS_TABLE="chme-dev-user-cheer-tickets"}},
    # @{name="chme-dev-cheer-send-scheduled"; path="C:\chum7\backend\services\cheer\send-scheduled"; env=@{STAGE="dev";CHEERS_TABLE="chme-dev-cheers"}},
    # @{name="chme-dev-cheer-get-targets"; path="C:\chum7\backend\services\cheer\get-targets"; env=@{STAGE="dev";USER_CHALLENGES_TABLE="chme-dev-user-challenges"}},
    # @{name="chme-dev-cheer-thank"; path="C:\chum7\backend\services\cheer\thank"; env=@{STAGE="dev";CHEERS_TABLE="chme-dev-cheers"}},
    # @{name="chme-dev-cheer-get-my"; path="C:\chum7\backend\services\cheer\get-my-cheers"; env=@{STAGE="dev";CHEERS_TABLE="chme-dev-cheers"}},
    # @{name="chme-dev-cheer-get-scheduled"; path="C:\chum7\backend\services\cheer\get-scheduled"; env=@{STAGE="dev";CHEERS_TABLE="chme-dev-cheers"}},

    # Admin (6개) - 관리자 기능 (나중에 필요)
    # @{name="chme-dev-admin-create-challenge"; path="C:\chum7\backend\services\admin\challenge\create"; env=@{STAGE="dev";CHALLENGES_TABLE="chme-dev-challenges"}},
    # @{name="chme-dev-admin-update-challenge"; path="C:\chum7\backend\services\admin\challenge\update"; env=@{STAGE="dev";CHALLENGES_TABLE="chme-dev-challenges"}},
    # @{name="chme-dev-admin-delete-challenge"; path="C:\chum7\backend\services\admin\challenge\delete"; env=@{STAGE="dev";CHALLENGES_TABLE="chme-dev-challenges";USER_CHALLENGES_TABLE="chme-dev-user-challenges"}},
    # @{name="chme-dev-admin-toggle-challenge"; path="C:\chum7\backend\services\admin\challenge\toggle"; env=@{STAGE="dev";CHALLENGES_TABLE="chme-dev-challenges"}},
    # @{name="chme-dev-admin-list-users"; path="C:\chum7\backend\services\admin\user\list"; env=@{STAGE="dev";USERS_TABLE="chme-dev-users"}},
    # @{name="chme-dev-admin-stats"; path="C:\chum7\backend\services\admin\stats\overview"; env=@{STAGE="dev";USERS_TABLE="chme-dev-users";CHALLENGES_TABLE="chme-dev-challenges";USER_CHALLENGES_TABLE="chme-dev-user-challenges"}}
)

# =============================================================================
# 공통 설정
# =============================================================================

$roleArn = "arn:aws:iam::532393804562:role/chum7_lambda_first"
$region = "ap-northeast-2"
$runtime = "nodejs20.x"

$packageJson = @'
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
'@

# =============================================================================
# Lambda 생성 함수
# =============================================================================

function Deploy-Lambda {
    param($Lambda)

    $name = $Lambda.name
    $path = $Lambda.path
    
    Write-Host "`n📦 Processing: $name" -ForegroundColor Yellow
    Write-Host "   Path: $path"

    if (-not (Test-Path $path)) {
        Write-Host "   ❌ 경로가 없습니다!" -ForegroundColor Red
        return
    }

    Push-Location $path

    try {
        # 1. package.json 생성
        if (-not (Test-Path "package.json")) {
            Write-Host "   📝 Creating package.json..." -ForegroundColor Gray
            $packageJson | Out-File -FilePath "package.json" -Encoding utf8
        }

        # 2. 의존성 설치
        if (-not (Test-Path "node_modules")) {
            Write-Host "   📥 Installing dependencies..." -ForegroundColor Gray
            npm install --silent
        }

        # 3. ZIP 압축
        Write-Host "   📦 Creating ZIP..." -ForegroundColor Gray
        if (Test-Path "function.zip") {
            Remove-Item "function.zip" -Force
        }
        Compress-Archive -Path index.js,node_modules -DestinationPath function.zip -Force

        # 4. 환경 변수 문자열 생성
        $envVars = $Lambda.env.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
        $envString = "Variables={" + ($envVars -join ',') + "}"

        # 5. Lambda 함수 존재 확인
        $exists = $false
        try {
            aws lambda get-function --function-name $name --region $region 2>$null
            $exists = $true
        } catch {}

        if ($exists) {
            # 업데이트
            Write-Host "   ♻️  Updating function..." -ForegroundColor Cyan
            aws lambda update-function-code `
                --function-name $name `
                --zip-file fileb://function.zip `
                --region $region | Out-Null

            aws lambda update-function-configuration `
                --function-name $name `
                --environment $envString `
                --region $region | Out-Null
        } else {
            # 생성
            Write-Host "   ✨ Creating function..." -ForegroundColor Green
            aws lambda create-function `
                --function-name $name `
                --runtime $runtime `
                --role $roleArn `
                --handler index.handler `
                --zip-file fileb://function.zip `
                --timeout 30 `
                --memory-size 256 `
                --environment $envString `
                --region $region | Out-Null
        }

        Write-Host "   ✅ Success!" -ForegroundColor Green

    } catch {
        Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    } finally {
        Pop-Location
    }
}

# =============================================================================
# 메인 실행
# =============================================================================

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  선택된 Lambda 배포" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

$total = $lambdas.Count
$current = 0

foreach ($lambda in $lambdas) {
    $current++
    Write-Host "`n[$current/$total]" -ForegroundColor Magenta
    Deploy-Lambda -Lambda $lambda
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  ✅ 배포 완료! 총 $total 개 Lambda" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

# 배포된 Lambda 확인
Write-Host "배포된 Lambda 함수 목록:" -ForegroundColor Yellow
aws lambda list-functions --region $region --query "Functions[?starts_with(FunctionName, 'chme-dev')].FunctionName" --output table
