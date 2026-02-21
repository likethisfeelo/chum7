# Deploy PROD
#!/usr/bin/env pwsh

$ErrorActionPreference = "Stop"

Write-Host "🚀 CHME PRODUCTION Deployment" -ForegroundColor Red

# Confirmation
$confirm = Read-Host "Type 'DEPLOY' to continue"
if ($confirm -ne "DEPLOY") {
    Write-Host "❌ Cancelled" -ForegroundColor Red
    exit 0
}

# Configuration
$StaticBucket = "chum7-prod-static"
$UploadsBucket = "chum7-prod-uploads"
$CloudFrontId = "EUM1ULUXR9NQZ"
$Region = "ap-northeast-2"

# Frontend Build
Write-Host "`n📦 Building Frontend..." -ForegroundColor Green
Push-Location frontend
npm run build -- --mode production
Pop-Location

# Upload to S3
Write-Host "`n☁️  Uploading to S3..." -ForegroundColor Green
aws s3 sync frontend/dist/ s3://$StaticBucket/ `
    --delete `
    --cache-control "max-age=31536000,public,immutable" `
    --exclude "index.html" `
    --region $Region

aws s3 cp frontend/dist/index.html s3://$StaticBucket/index.html `
    --cache-control "max-age=0,no-cache" `
    --region $Region

# CloudFront Invalidation
Write-Host "`n🔄 Invalidating CloudFront..." -ForegroundColor Green
aws cloudfront create-invalidation `
    --distribution-id $CloudFrontId `
    --paths "/*" `
    --region us-east-1

# Backend Deployment
Write-Host "`n🔧 Deploying Backend..." -ForegroundColor Green
Push-Location infra
npx cdk deploy chme-prod-core --context stage=prod --require-approval never
Pop-Location

Write-Host "`n✅ Deployment Complete!" -ForegroundColor Green
Write-Host "🌐 https://www.chum7.com" -ForegroundColor Yellow
Write-Host "🔌 https://api.chum7.com" -ForegroundColor Yellow