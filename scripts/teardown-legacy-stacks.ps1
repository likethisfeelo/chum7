<#
.SYNOPSIS
  구(舊) 시스템 CloudFormation 스택 일괄 철거 — 신규 chme2-* 는 절대 건드리지 않음.

.DESCRIPTION
  레거시 스택(이름이 정확히 "chme-" 로 시작, 즉 chme2- 는 제외)을 한 번에 삭제한다.
  - 종료 보호(termination protection) 해제
  - 삭제를 막는 비어있지 않은 S3 버킷 자동 비우기(버저닝 포함)
  - export 의존성으로 첫 삭제가 실패해도 남은 스택을 반복 재시도(진전 없을 때까지)

  기본은 안전한 미리보기(대상만 출력). 실제 삭제는 -Execute 필요.

.PARAMETER Region
  대상 리전 (기본: ap-northeast-2). us-east-1 인증서/엣지 스택이 따로 있으면 한 번 더 실행.

.PARAMETER Execute
  실제 삭제 수행. 없으면 대상 목록만 출력하고 종료.

.EXAMPLE
  # 1) 먼저 무엇이 지워질지 확인 (아무것도 안 지움)
  ./scripts/teardown-legacy-stacks.ps1 -Region ap-northeast-2

  # 2) 확인됐으면 한 번에 철거
  ./scripts/teardown-legacy-stacks.ps1 -Region ap-northeast-2 -Execute

  # 3) 엣지/인증서가 us-east-1 에 있으면 한 번 더
  ./scripts/teardown-legacy-stacks.ps1 -Region us-east-1 -Execute
#>
param(
  [string]$Region = "ap-northeast-2",
  [switch]$Execute
)

$ErrorActionPreference = "Stop"

# 신규 시스템 접두어 — 절대 삭제 금지 (이중 안전장치)
$ProtectedPrefixes = @("chme2-")
# 레거시 대상: 정확히 "chme-" 로 시작 (chme2- 는 정규식상 매칭 안 됨)
$LegacyPattern = '^chme-'

function Get-LegacyStackNames {
  $names = aws cloudformation list-stacks `
    --region $Region `
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE ROLLBACK_COMPLETE IMPORT_COMPLETE UPDATE_ROLLBACK_FAILED DELETE_FAILED `
    --query "StackSummaries[].StackName" --output text
  if (-not $names) { return @() }
  $all = ($names -split "\s+") | Where-Object { $_ }
  $result = @()
  foreach ($n in $all) {
    if ($n -notmatch $LegacyPattern) { continue }
    $protected = $false
    foreach ($p in $ProtectedPrefixes) { if ($n.StartsWith($p)) { $protected = $true } }
    if ($protected) { continue }
    $result += $n
  }
  return ($result | Sort-Object -Unique)
}

function Empty-StackBuckets($stackName) {
  # 스택이 소유한 S3 버킷을 비운다(비어있지 않으면 DELETE 가 막힘). RETAIN 버킷은 어차피 삭제 안 됨.
  $buckets = aws cloudformation list-stack-resources --region $Region --stack-name $stackName `
    --query "StackResourceSummaries[?ResourceType=='AWS::S3::Bucket'].PhysicalResourceId" --output text 2>$null
  if (-not $buckets) { return }
  foreach ($b in ($buckets -split "\s+" | Where-Object { $_ })) {
    Write-Host "    - 버킷 비우기: $b" -ForegroundColor DarkGray
    # 객체 + 버전 + 삭제마커 전부 제거
    aws s3 rm "s3://$b" --recursive --region $Region 2>$null | Out-Null
    try {
      $versions = aws s3api list-object-versions --bucket $b --region $Region `
        --query "{Objects: Versions[].{Key:Key,VersionId:VersionId}, Markers: DeleteMarkers[].{Key:Key,VersionId:VersionId}}" --output json 2>$null | ConvertFrom-Json
      foreach ($grp in @($versions.Objects, $versions.Markers)) {
        foreach ($o in @($grp)) {
          if ($o -and $o.Key) {
            aws s3api delete-object --bucket $b --key $o.Key --version-id $o.VersionId --region $Region 2>$null | Out-Null
          }
        }
      }
    } catch { }
  }
}

Write-Host "리전: $Region" -ForegroundColor Cyan
$targets = Get-LegacyStackNames

if ($targets.Count -eq 0) {
  Write-Host "레거시(chme-*) 스택이 없습니다. (신규 chme2-* 는 대상 아님)" -ForegroundColor Green
  exit 0
}

Write-Host "`n철거 대상 (chme2-* 는 자동 제외됨):" -ForegroundColor Yellow
$targets | ForEach-Object { Write-Host "  - $_" }

if (-not $Execute) {
  Write-Host "`n[미리보기] 아무것도 삭제하지 않았습니다. 실제 삭제하려면 -Execute 를 붙여 다시 실행하세요." -ForegroundColor Cyan
  exit 0
}

Write-Host "`n=== 삭제 시작 ===" -ForegroundColor Red

# 1) 종료 보호 해제 + 버킷 비우기 + 삭제 트리거
foreach ($s in $targets) {
  Write-Host "[$s] 종료 보호 해제 + 버킷 정리 + 삭제 요청" -ForegroundColor White
  aws cloudformation update-termination-protection --region $Region --stack-name $s --no-enable-termination-protection 2>$null | Out-Null
  Empty-StackBuckets $s
  aws cloudformation delete-stack --region $Region --stack-name $s 2>$null | Out-Null
}

# 2) export 의존성으로 일부가 남을 수 있으므로 사라질 때까지 반복
$maxRounds = 8
for ($round = 1; $round -le $maxRounds; $round++) {
  Start-Sleep -Seconds 20
  $remaining = Get-LegacyStackNames
  if ($remaining.Count -eq 0) {
    Write-Host "`n모든 레거시 스택이 삭제되었습니다. ✅" -ForegroundColor Green
    exit 0
  }
  Write-Host "`n[라운드 $round] 남은 스택 $($remaining.Count)개 — 재시도" -ForegroundColor Yellow
  foreach ($s in $remaining) {
    aws cloudformation update-termination-protection --region $Region --stack-name $s --no-enable-termination-protection 2>$null | Out-Null
    Empty-StackBuckets $s
    aws cloudformation delete-stack --region $Region --stack-name $s 2>$null | Out-Null
    Write-Host "  - 재삭제 요청: $s"
  }
}

$left = Get-LegacyStackNames
if ($left.Count -gt 0) {
  Write-Host "`n일부가 남았습니다. DELETE_FAILED 원인을 확인하세요:" -ForegroundColor Red
  foreach ($s in $left) {
    Write-Host "  - $s" -ForegroundColor Red
    aws cloudformation describe-stack-events --region $Region --stack-name $s `
      --query "StackEvents[?ResourceStatus=='DELETE_FAILED'].[LogicalResourceId,ResourceStatusReason]" --output text 2>$null | Select-Object -First 5
  }
  Write-Host "`n대개 남는 원인: 다른 스택이 참조하는 export, RETAIN 리소스, 비우지 못한 버킷." -ForegroundColor DarkYellow
  exit 1
}
