<#
.SYNOPSIS
  [컷오버 1회] 구 CloudFront 배포에서 chum7.com CNAME(대체 도메인)을 떼어내
  신규 배포가 같은 CNAME을 가져갈 수 있게 한다.

.DESCRIPTION
  CloudFront는 같은 CNAME을 두 배포에 동시에 붙일 수 없다(409 CNAMEAlreadyExists).
  신규 chme2-prod-edge 가 www/admin.chum7.com 을 요구하는데 구 시스템 배포가 아직
  그 CNAME을 물고 있어 충돌한다. 이 스크립트가 구 배포에서 해당 alias만 제거한다.
  (구 배포 자체는 남겨두고 도메인만 해제 — 이후 신규 배포가 CNAME 확보)

  반드시 컷오버 대상 계정(532...)에서 실행하세요. 먼저:  . .\scripts\aws-use.ps1

.EXAMPLE
  .\scripts\cutover-free-cnames.ps1 -WhatIf     # 어떤 배포에서 뗄지 미리보기
  .\scripts\cutover-free-cnames.ps1             # 실제 제거

.NOTES
  실행이 막히면 1회: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  구 배포가 "다른 AWS 계정"에 있으면 여기서 안 잡힌다(그 계정에서 제거해야 함).
#>
param(
  [string[]]$Aliases = @("www.chum7.com", "admin.chum7.com"),
  [switch]$WhatIf
)
$ErrorActionPreference = "Stop"

foreach ($alias in $Aliases) {
  Write-Host "== '$alias' 를 가진 CloudFront 배포 검색 ==" -ForegroundColor Cyan
  $ids = (aws cloudfront list-distributions `
      --query "DistributionList.Items[?Aliases.Items!=null && contains(Aliases.Items, '$alias')].Id" `
      --output text) -split "\s+" | Where-Object { $_ }

  if (-not $ids) {
    Write-Host "  (해당 alias를 가진 배포 없음 — 이미 해제됨/신규가 이미 확보)" -ForegroundColor Green
    continue
  }

  foreach ($id in $ids) {
    Write-Host "  배포 $id 에서 '$alias' 제거 준비..." -ForegroundColor Yellow
    $resp = aws cloudfront get-distribution-config --id $id | ConvertFrom-Json
    $etag = $resp.ETag
    $dc = $resp.DistributionConfig

    # 대상 alias만 제거하고 나머지 alias는 보존
    $kept = @($dc.Aliases.Items | Where-Object { $_ -ne $alias })
    $dc.Aliases.Quantity = $kept.Count
    if ($kept.Count -gt 0) { $dc.Aliases.Items = $kept }
    else { $dc.Aliases.PSObject.Properties.Remove('Items') }

    if ($WhatIf) {
      Write-Host "    [WhatIf] $id 에서 '$alias' 제거 예정 (실행 안 함)"
      continue
    }

    $tmp = New-TemporaryFile
    $dc | ConvertTo-Json -Depth 100 | Out-File -Encoding ascii $tmp
    aws cloudfront update-distribution --id $id --distribution-config "file://$tmp" --if-match $etag | Out-Null
    Remove-Item $tmp
    Write-Host "    제거 완료 (배포 전파까지 수 분 소요될 수 있음)" -ForegroundColor Green
  }
}

Write-Host "`n다음 단계:" -ForegroundColor Cyan
Write-Host "  1) 실패한 edge 스택 삭제:  aws cloudformation delete-stack --stack-name chme2-prod-edge --region ap-northeast-2"
Write-Host "  2) 삭제 대기 후 재배포:    .\scripts\deploy-chum7.ps1 -Stage prod"
