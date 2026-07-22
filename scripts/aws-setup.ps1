<#
.SYNOPSIS
  [셋팅용 — 최초 1회] AWS 프로파일(자격증명)을 등록한다.

.DESCRIPTION
  532 계정(chum7.com Route53 존이 있는 계정)의 IAM 액세스 키를 프로파일로 저장한다.
  키는 ~/.aws/credentials 에 디스크 저장되므로 한 번만 하면 된다.
  준비물: AWS 콘솔(해당 계정 로그인) → IAM → 사용자 → 보안 자격 증명 → 액세스 키 만들기

.EXAMPLE
  .\scripts\aws-setup.ps1                 # 프로파일명 chum7 로 등록
  .\scripts\aws-setup.ps1 -Profile prod2  # 다른 이름으로 등록

.NOTES
  실행이 막히면 1회: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#>
param(
  [string]$Profile = "chum7",
  [string]$Region = "ap-northeast-2"
)
$ErrorActionPreference = "Stop"

Write-Host "== AWS 프로파일 등록: '$Profile' ==" -ForegroundColor Cyan
Write-Host "IAM 콘솔에서 발급한 Access Key ID / Secret Access Key 를 준비하세요."
Write-Host "(Default region / output 은 자동으로 채워집니다 — 그냥 Enter 쳐도 됨)`n"

# 대화식 입력 (키는 인자로 받지 않음 — 셸 히스토리 노출 방지)
aws configure --profile $Profile

# region / output 이 비어있으면 강제 설정
aws configure set region $Region --profile $Profile
aws configure set output json --profile $Profile

Write-Host "`n== 등록 확인 ==" -ForegroundColor Cyan
$env:AWS_PROFILE = $Profile
$id = aws sts get-caller-identity | ConvertFrom-Json
Write-Host ("Profile : {0}" -f $Profile)
Write-Host ("Account : {0}" -f $id.Account)
Write-Host ("ARN     : {0}" -f $id.Arn)
Write-Host "`n등록 완료. 이제 배포 전마다 아래로 세션을 전환하세요:" -ForegroundColor Green
Write-Host "  . .\scripts\aws-use.ps1 -Profile $Profile"
