# create-lambda-role.ps1
# Lambda 실행 역할 생성 스크립트

$ErrorActionPreference = "Stop"

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  Lambda IAM Role 생성" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

# ==================== DEV Role ====================
Write-Host "📝 Creating DEV Lambda Role..." -ForegroundColor Yellow

$devTrustPolicy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
"@

try {
    aws iam create-role `
        --role-name chme-dev-lambda-role `
        --assume-role-policy-document $devTrustPolicy `
        --description "CHME DEV Lambda Execution Role"
    
    Write-Host "   ✅ DEV Role created" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  DEV Role already exists or error: $($_.Exception.Message)" -ForegroundColor Yellow
}

# AdministratorAccess 정책 연결 (개발용)
Write-Host "📝 Attaching AdministratorAccess policy to DEV Role..." -ForegroundColor Yellow
try {
    aws iam attach-role-policy `
        --role-name chme-dev-lambda-role `
        --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
    
    Write-Host "   ✅ Policy attached" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Policy already attached or error" -ForegroundColor Yellow
}

# ==================== PROD Role ====================
Write-Host "`n📝 Creating PROD Lambda Role..." -ForegroundColor Yellow

$prodTrustPolicy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
"@

try {
    aws iam create-role `
        --role-name chme-prod-lambda-role `
        --assume-role-policy-document $prodTrustPolicy `
        --description "CHME PROD Lambda Execution Role"
    
    Write-Host "   ✅ PROD Role created" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  PROD Role already exists or error: $($_.Exception.Message)" -ForegroundColor Yellow
}

# AdministratorAccess 정책 연결
Write-Host "📝 Attaching AdministratorAccess policy to PROD Role..." -ForegroundColor Yellow
try {
    aws iam attach-role-policy `
        --role-name chme-prod-lambda-role `
        --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
    
    Write-Host "   ✅ Policy attached" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Policy already attached or error" -ForegroundColor Yellow
}

# ==================== 확인 ====================
Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  ✅ IAM Roles 생성 완료!" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

Write-Host "생성된 Role ARN:" -ForegroundColor Yellow
Write-Host "DEV:  arn:aws:iam::532393804562:role/chme-dev-lambda-role" -ForegroundColor Green
Write-Host "PROD: arn:aws:iam::532393804562:role/chme-prod-lambda-role" -ForegroundColor Green

Write-Host "`n⚠️  주의: AdministratorAccess는 개발용입니다." -ForegroundColor Yellow
Write-Host "    운영 환경에서는 최소 권한 원칙을 적용하세요.`n" -ForegroundColor Yellow
