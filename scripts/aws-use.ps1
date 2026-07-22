<#
.SYNOPSIS
  [변경용 — 매 세션] 현재 PowerShell 창의 AWS 프로파일을 전환하고 계정을 검증한다.

.IMPORTANT
  반드시 "닷 소싱"으로 실행하세요 (맨 앞에 '점 + 공백'):
      . .\scripts\aws-use.ps1
  그래야 $env:AWS_PROFILE 전환이 지금 이 창에 유지됩니다.
  (그냥 .\scripts\aws-use.ps1 로 실행하면 전환이 창에 안 남을 수 있음.)

.DESCRIPTION
  $env:AWS_PROFILE 을 바꾸고 sts get-caller-identity 로 계정을 확인한다.
  기대 계정(532...)과 다르면 경고한다 — 엉뚱한 계정 배포 예방.

.EXAMPLE
  . .\scripts\aws-use.ps1                    # chum7 프로파일로 전환 + 계정 확인
  . .\scripts\aws-use.ps1 -Profile prod2
#>
param(
  [string]$Profile = "chum7",
  [string]$ExpectAccount = "532393804562"
)

# 프로파일 존재 확인
$profiles = aws configure list-profiles 2>$null
if ($profiles -notcontains $Profile) {
  Write-Warning "'$Profile' 프로파일이 없습니다. 먼저 등록하세요:  .\scripts\aws-setup.ps1 -Profile $Profile"
  return
}

$env:AWS_PROFILE = $Profile
$id = aws sts get-caller-identity | ConvertFrom-Json
Write-Host ("Profile : {0}" -f $Profile)
Write-Host ("Account : {0}" -f $id.Account)
Write-Host ("ARN     : {0}" -f $id.Arn)

if ($id.Account -ne $ExpectAccount) {
  Write-Warning "기대 계정($ExpectAccount)과 다릅니다! 배포 전 프로파일을 확인하세요."
}
else {
  Write-Host "OK - 계정 일치 ($ExpectAccount). 이제 이 창에서 배포하면 됩니다." -ForegroundColor Green
}
