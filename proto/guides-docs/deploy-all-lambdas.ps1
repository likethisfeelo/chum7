# deploy-all-lambdas.ps1
# CHME 전체 Lambda 함수 일괄 배포 스크립트
# 사용법: .\deploy-all-lambdas.ps1 -Stage dev

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('dev', 'prod')]
    [string]$Stage
)

$ErrorActionPreference = "Stop"

# ==================== 환경 설정 ====================
$config = @{
    dev = @{
        Account = "532393804562"
        Region = "ap-northeast-2"
        RoleArn = "arn:aws:iam::532393804562:role/chum7_lambda_first"
        UserPoolId = "ap-northeast-2_NCbbx3Ilm"
        ClientId = "6aalogssb8bb70rtg63a2l7jdb"
        UploadsBucket = "chum7-dev-uploads"
        Tables = @{
            Users = "chme-dev-users"
            Challenges = "chme-dev-challenges"
            UserChallenges = "chme-dev-user-challenges"
            Verifications = "chme-dev-verifications"
            Cheers = "chme-dev-cheers"
            UserCheerTickets = "chme-dev-user-cheer-tickets"
        }
    }
    prod = @{
        Account = "532393804562"
        Region = "ap-northeast-2"
        RoleArn = "arn:aws:iam::532393804562:role/chum7_lambda_first"
        UserPoolId = "ap-northeast-2_n8ZjUpupj"
        ClientId = "5d62qaq228fap818m8gi8jt759"
        UploadsBucket = "chum7-prod-uploads"
        Tables = @{
            Users = "chme-prod-users"
            Challenges = "chme-prod-challenges"
            UserChallenges = "chme-prod-user-challenges"
            Verifications = "chme-prod-verifications"
            Cheers = "chme-prod-cheers"
            UserCheerTickets = "chme-prod-user-cheer-tickets"
        }
    }
}

$env = $config[$Stage]
$baseDir = "C:\chum7\backend\services"

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  CHME Lambda 전체 배포 - $($Stage.ToUpper())" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

# ==================== Lambda 함수 정의 ====================
$lambdas = @(
    # Auth (5개)
    @{
        Path = "$baseDir\auth\register"
        Name = "chme-$Stage-auth-register"
        Env = @{
            STAGE = $Stage
            USERS_TABLE = $env.Tables.Users
            USER_POOL_ID = $env.UserPoolId
        }
    },
    @{
        Path = "$baseDir\auth\login"
        Name = "chme-$Stage-auth-login"
        Env = @{
            STAGE = $Stage
            USER_POOL_ID = $env.UserPoolId
            CLIENT_ID = $env.ClientId
        }
    },
    @{
        Path = "$baseDir\auth\refresh-token"
        Name = "chme-$Stage-auth-refresh"
        Env = @{
            STAGE = $Stage
            USER_POOL_ID = $env.UserPoolId
            CLIENT_ID = $env.ClientId
        }
    },
    @{
        Path = "$baseDir\auth\get-profile"
        Name = "chme-$Stage-auth-get-profile"
        Env = @{
            STAGE = $Stage
            USERS_TABLE = $env.Tables.Users
        }
    },
    @{
        Path = "$baseDir\auth\update-profile"
        Name = "chme-$Stage-auth-update-profile"
        Env = @{
            STAGE = $Stage
            USERS_TABLE = $env.Tables.Users
        }
    },

    # Challenge (5개)
    @{
        Path = "$baseDir\challenge\list"
        Name = "chme-$Stage-challenge-list"
        Env = @{
            STAGE = $Stage
            CHALLENGES_TABLE = $env.Tables.Challenges
        }
    },
    @{
        Path = "$baseDir\challenge\detail"
        Name = "chme-$Stage-challenge-detail"
        Env = @{
            STAGE = $Stage
            CHALLENGES_TABLE = $env.Tables.Challenges
        }
    },
    @{
        Path = "$baseDir\challenge\join"
        Name = "chme-$Stage-challenge-join"
        Env = @{
            STAGE = $Stage
            CHALLENGES_TABLE = $env.Tables.Challenges
            USER_CHALLENGES_TABLE = $env.Tables.UserChallenges
        }
    },
    @{
        Path = "$baseDir\challenge\my-challenges"
        Name = "chme-$Stage-challenge-my"
        Env = @{
            STAGE = $Stage
            USER_CHALLENGES_TABLE = $env.Tables.UserChallenges
            CHALLENGES_TABLE = $env.Tables.Challenges
        }
    },
    @{
        Path = "$baseDir\challenge\stats"
        Name = "chme-$Stage-challenge-stats"
        Env = @{
            STAGE = $Stage
            CHALLENGES_TABLE = $env.Tables.Challenges
            USER_CHALLENGES_TABLE = $env.Tables.UserChallenges
        }
    },

    # Verification (5개)
    @{
        Path = "$baseDir\verification\submit"
        Name = "chme-$Stage-verification-submit"
        Env = @{
            STAGE = $Stage
            VERIFICATIONS_TABLE = $env.Tables.Verifications
            USER_CHALLENGES_TABLE = $env.Tables.UserChallenges
            USER_CHEER_TICKETS_TABLE = $env.Tables.UserCheerTickets
        }
    },
    @{
        Path = "$baseDir\verification\get"
        Name = "chme-$Stage-verification-get"
        Env = @{
            STAGE = $Stage
            VERIFICATIONS_TABLE = $env.Tables.Verifications
        }
    },
    @{
        Path = "$baseDir\verification\list"
        Name = "chme-$Stage-verification-list"
        Env = @{
            STAGE = $Stage
            VERIFICATIONS_TABLE = $env.Tables.Verifications
        }
    },
    @{
        Path = "$baseDir\verification\upload-url"
        Name = "chme-$Stage-verification-upload-url"
        Env = @{
            STAGE = $Stage
            UPLOADS_BUCKET = $env.UploadsBucket
        }
    },
    @{
        Path = "$baseDir\verification\remedy"
        Name = "chme-$Stage-verification-remedy"
        Env = @{
            STAGE = $Stage
            VERIFICATIONS_TABLE = $env.Tables.Verifications
            USER_CHALLENGES_TABLE = $env.Tables.UserChallenges
            USER_CHEER_TICKETS_TABLE = $env.Tables.UserCheerTickets
        }
    },

    # Cheer (7개)
    @{
        Path = "$baseDir\cheer\send-immediate"
        Name = "chme-$Stage-cheer-send-immediate"
        Env = @{
            STAGE = $Stage
            CHEERS_TABLE = $env.Tables.Cheers
        }
    },
    @{
        Path = "$baseDir\cheer\use-ticket"
        Name = "chme-$Stage-cheer-use-ticket"
        Env = @{
            STAGE = $Stage
            CHEERS_TABLE = $env.Tables.Cheers
            USER_CHEER_TICKETS_TABLE = $env.Tables.UserCheerTickets
        }
    },
    @{
        Path = "$baseDir\cheer\send-scheduled"
        Name = "chme-$Stage-cheer-send-scheduled"
        Env = @{
            STAGE = $Stage
            CHEERS_TABLE = $env.Tables.Cheers
        }
    },
    @{
        Path = "$baseDir\cheer\get-targets"
        Name = "chme-$Stage-cheer-get-targets"
        Env = @{
            STAGE = $Stage
            USER_CHALLENGES_TABLE = $env.Tables.UserChallenges
        }
    },
    @{
        Path = "$baseDir\cheer\thank"
        Name = "chme-$Stage-cheer-thank"
        Env = @{
            STAGE = $Stage
            CHEERS_TABLE = $env.Tables.Cheers
        }
    },
    @{
        Path = "$baseDir\cheer\get-my-cheers"
        Name = "chme-$Stage-cheer-get-my"
        Env = @{
            STAGE = $Stage
            CHEERS_TABLE = $env.Tables.Cheers
        }
    },
    @{
        Path = "$baseDir\cheer\get-scheduled"
        Name = "chme-$Stage-cheer-get-scheduled"
        Env = @{
            STAGE = $Stage
            CHEERS_TABLE = $env.Tables.Cheers
        }
    },

    # Admin (6개)
    @{
        Path = "$baseDir\admin\challenge\create"
        Name = "chme-$Stage-admin-create-challenge"
        Env = @{
            STAGE = $Stage
            CHALLENGES_TABLE = $env.Tables.Challenges
        }
    },
    @{
        Path = "$baseDir\admin\challenge\update"
        Name = "chme-$Stage-admin-update-challenge"
        Env = @{
            STAGE = $Stage
            CHALLENGES_TABLE = $env.Tables.Challenges
        }
    },
    @{
        Path = "$baseDir\admin\challenge\delete"
        Name = "chme-$Stage-admin-delete-challenge"
        Env = @{
            STAGE = $Stage
            CHALLENGES_TABLE = $env.Tables.Challenges
            USER_CHALLENGES_TABLE = $env.Tables.UserChallenges
        }
    },
    @{
        Path = "$baseDir\admin\challenge\toggle"
        Name = "chme-$Stage-admin-toggle-challenge"
        Env = @{
            STAGE = $Stage
            CHALLENGES_TABLE = $env.Tables.Challenges
        }
    },
    @{
        Path = "$baseDir\admin\user\list"
        Name = "chme-$Stage-admin-list-users"
        Env = @{
            STAGE = $Stage
            USERS_TABLE = $env.Tables.Users
        }
    },
    @{
        Path = "$baseDir\admin\stats\overview"
        Name = "chme-$Stage-admin-stats"
        Env = @{
            STAGE = $Stage
            USERS_TABLE = $env.Tables.Users
            CHALLENGES_TABLE = $env.Tables.Challenges
            USER_CHALLENGES_TABLE = $env.Tables.UserChallenges
        }
    }
)

# ==================== 공통 package.json ====================
$packageJson = @"
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
"@

# ==================== 배포 함수 ====================
function Deploy-Lambda {
    param($Lambda)

    $name = $Lambda.Name
    $path = $Lambda.Path
    
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
        $envVars = $Lambda.Env.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
        $envString = "Variables={" + ($envVars -join ',') + "}"

        # 5. Lambda 함수 존재 확인
        $exists = $false
        try {
            aws lambda get-function --function-name $name --region $env.Region 2>$null
            $exists = $true
        } catch {}

        if ($exists) {
            # 업데이트
            Write-Host "   ♻️  Updating function..." -ForegroundColor Cyan
            aws lambda update-function-code `
                --function-name $name `
                --zip-file fileb://function.zip `
                --region $env.Region | Out-Null

            # 환경 변수도 업데이트
            aws lambda update-function-configuration `
                --function-name $name `
                --environment $envString `
                --region $env.Region | Out-Null
        } else {
            # 생성
            Write-Host "   ✨ Creating function..." -ForegroundColor Green
            aws lambda create-function `
                --function-name $name `
                --runtime nodejs20.x `
                --role $env.RoleArn `
                --handler index.handler `
                --zip-file fileb://function.zip `
                --timeout 30 `
                --memory-size 256 `
                --environment $envString `
                --region $env.Region | Out-Null
        }

        Write-Host "   ✅ Success!" -ForegroundColor Green

    } catch {
        Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    } finally {
        Pop-Location
    }
}

# ==================== 메인 실행 ====================
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

# ==================== 확인 ====================
Write-Host "배포된 Lambda 함수 목록:" -ForegroundColor Yellow
aws lambda list-functions --region $env.Region --query "Functions[?starts_with(FunctionName, 'chme-$Stage')].FunctionName" --output table
