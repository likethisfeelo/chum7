<#
.SYNOPSIS
  Tear down legacy CloudFormation stacks in one shot. NEVER touches new chme2-* stacks.

.DESCRIPTION
  Deletes legacy stacks whose name starts exactly with "chme-" (so "chme2-" never matches).
  - Disables termination protection
  - Empties non-empty S3 buckets that would block deletion (incl. versions/markers)
  - Retries remaining stacks (export dependencies) until none are left or no progress

  Default is a safe preview (list targets only). Real deletion requires -Execute.

.PARAMETER Region
  Target region (default ap-northeast-2). If edge/cert stacks live in us-east-1, run again there.

.PARAMETER Execute
  Perform the actual deletion. Without it, only prints the target list and exits.

.EXAMPLE
  # 1) Preview what would be deleted (deletes nothing)
  ./scripts/teardown-legacy-stacks.ps1 -Region ap-northeast-2

  # 2) Once confirmed, tear down in one shot
  ./scripts/teardown-legacy-stacks.ps1 -Region ap-northeast-2 -Execute

  # 3) If edge/cert stacks are in us-east-1, run again there
  ./scripts/teardown-legacy-stacks.ps1 -Region us-east-1 -Execute
#>
param(
  [string]$Region = "ap-northeast-2",
  [switch]$Execute
)

$ErrorActionPreference = "Stop"

# New-system prefix - NEVER delete (double safety guard)
$ProtectedPrefixes = @("chme2-")
# Legacy target: name starts with "chme-" (regex does not match "chme2-")
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

function Clear-StackBuckets($stackName) {
  # Empty S3 buckets owned by the stack (non-empty buckets block DELETE). RETAIN buckets are skipped anyway.
  $buckets = aws cloudformation list-stack-resources --region $Region --stack-name $stackName `
    --query "StackResourceSummaries[?ResourceType=='AWS::S3::Bucket'].PhysicalResourceId" --output text 2>$null
  if (-not $buckets) { return }
  foreach ($b in ($buckets -split "\s+" | Where-Object { $_ })) {
    Write-Host "    - emptying bucket: $b" -ForegroundColor DarkGray
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

Write-Host "Region: $Region" -ForegroundColor Cyan
$targets = Get-LegacyStackNames

if ($targets.Count -eq 0) {
  Write-Host "No legacy (chme-*) stacks found. (chme2-* are never targeted)" -ForegroundColor Green
  exit 0
}

Write-Host "`nTargets to delete (chme2-* auto-excluded):" -ForegroundColor Yellow
$targets | ForEach-Object { Write-Host "  - $_" }

if (-not $Execute) {
  Write-Host "`n[PREVIEW] Nothing deleted. Re-run with -Execute to actually delete." -ForegroundColor Cyan
  exit 0
}

Write-Host "`n=== Deleting ===" -ForegroundColor Red

# 1) Disable termination protection + empty buckets + trigger delete
foreach ($s in $targets) {
  Write-Host "[$s] disable protection + clear buckets + delete-stack" -ForegroundColor White
  aws cloudformation update-termination-protection --region $Region --stack-name $s --no-enable-termination-protection 2>$null | Out-Null
  Clear-StackBuckets $s
  aws cloudformation delete-stack --region $Region --stack-name $s 2>$null | Out-Null
}

# 2) Export dependencies can leave some behind - retry until gone
$maxRounds = 8
for ($round = 1; $round -le $maxRounds; $round++) {
  Start-Sleep -Seconds 20
  $remaining = Get-LegacyStackNames
  if ($remaining.Count -eq 0) {
    Write-Host "`nAll legacy stacks deleted. OK" -ForegroundColor Green
    exit 0
  }
  Write-Host "`n[round $round] $($remaining.Count) stack(s) left - retrying" -ForegroundColor Yellow
  foreach ($s in $remaining) {
    aws cloudformation update-termination-protection --region $Region --stack-name $s --no-enable-termination-protection 2>$null | Out-Null
    Clear-StackBuckets $s
    aws cloudformation delete-stack --region $Region --stack-name $s 2>$null | Out-Null
    Write-Host "  - re-delete requested: $s"
  }
}

$left = Get-LegacyStackNames
if ($left.Count -gt 0) {
  Write-Host "`nSome stacks remain. Check DELETE_FAILED reasons:" -ForegroundColor Red
  foreach ($s in $left) {
    Write-Host "  - $s" -ForegroundColor Red
    aws cloudformation describe-stack-events --region $Region --stack-name $s `
      --query "StackEvents[?ResourceStatus=='DELETE_FAILED'].[LogicalResourceId,ResourceStatusReason]" --output text 2>$null | Select-Object -First 5
  }
  Write-Host "`nCommon causes: exports still referenced by another stack, RETAIN resources, non-empty bucket." -ForegroundColor DarkYellow
  exit 1
}
