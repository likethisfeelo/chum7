<#
.SYNOPSIS
  Windows 편의 배포 래퍼 — AWS 프로파일 전환 + 계정 확인 + (선택)캐시 초기화 + 배포.

.DESCRIPTION
  `$env:AWS_PROFILE` 전환은 셸 환경 작업이라 Node(deploy.mjs)로는 못 한다.
  이 스크립트는 그 preflight만 담당하고, 실제 배포는 npm run deploy(=deploy.mjs)에 위임한다.
  잘못된 계정으로의 배포를 막기 위해 배포 전 계정 ID를 검증한다.

.EXAMPLE
  .\scripts\deploy-chum7.ps1 -Stage prod -ClearContext -DiffOnly   # 미리보기
  .\scripts\deploy-chum7.ps1 -Stage prod -ClearContext             # 실제 배포

.NOTES
  실행이 막히면 1회: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#>
param(
  [ValidateSet("dev", "prod")][string]$Stage = "dev",
  [string]$Profile = "chum7",
  # chum7.com Route53 존이 있는 계정. 다른 값으로 배포하려면 명시적으로 넘겨야 함.
  [string]$ExpectAccount = "532393804562",
  [switch]$ClearContext,
  [switch]$DiffOnly
)
$ErrorActionPreference = "Stop"
$env:AWS_PROFILE = $Profile

Write-Host "== AWS 계정 확인 ==" -ForegroundColor Cyan
$id = aws sts get-caller-identity | ConvertFrom-Json
Write-Host ("Profile : {0}" -f $Profile)
Write-Host ("Account : {0}" -f $id.Account)
Write-Host ("ARN     : {0}" -f $id.Arn)

if ($id.Account -ne $ExpectAccount) {
  Write-Warning "계정이 기대값($ExpectAccount)과 다릅니다! 엉뚱한 계정에 배포될 수 있습니다."
  $ans = Read-Host "그래도 계속하려면 yes 입력"
  if ($ans -ne "yes") { exit 1 }
}
else {
  Write-Host "OK - 계정 일치" -ForegroundColor Green
}

if ($ClearContext) {
  Write-Host "== CDK 컨텍스트 캐시 초기화 ==" -ForegroundColor Cyan
  Push-Location infra2
  try { npx cdk context --clear } finally { Pop-Location }
}

if ($DiffOnly) {
  npm run deploy -- --stage $Stage --diff
}
else {
  npm run deploy -- --stage $Stage
}
