#!/usr/bin/env pwsh

$ErrorActionPreference = "Stop"

Write-Host "🚀 CHME DEV Deployment" -ForegroundColor Cyan

# Configuration
$StaticBucket = "chme-dev"
$UploadsBucket = "chum7-dev-uploads"
$CloudFrontId = "ESKW3DSSHIUK9"
$Region = "ap-northeast-2"

# Frontend Build
Write-Host "`n📦 Building Frontend..." -ForegroundColor Green
Push-Location frontend
npm run build -- --mode development
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
npx cdk deploy chme-dev-core --context stage=dev --require-approval never
Pop-Location

Write-Host "`n✅ Deployment Complete!" -ForegroundColor Green
Write-Host "🌐 https://test.chum7.com" -ForegroundColor Yellow
Write-Host "🔌 https://dev.chum7.com" -ForegroundColor Yellow