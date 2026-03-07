param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('dev', 'prod')]
  [string]$Stage,

  [string]$FromIso,
  [string]$ToIso,

  [switch]$DryRun,

  [int]$MaxRetries,

  [int]$TotalSegments,
  [int]$SegmentIndex,
  [int]$MaxScanPages,
  [int]$ScanPageSize
)

$functionName = "chme-$Stage-cheer-stats-materializer"

$payload = @{}
if ($FromIso) { $payload.fromIso = $FromIso }
if ($ToIso) { $payload.toIso = $ToIso }
$payload.dryRun = [bool]$DryRun
if ($PSBoundParameters.ContainsKey('MaxRetries')) { $payload.maxRetries = $MaxRetries }
if ($PSBoundParameters.ContainsKey('TotalSegments')) { $payload.totalSegments = $TotalSegments }
if ($PSBoundParameters.ContainsKey('SegmentIndex')) { $payload.segmentIndex = $SegmentIndex }
if ($PSBoundParameters.ContainsKey('MaxScanPages')) { $payload.maxScanPages = $MaxScanPages }
if ($PSBoundParameters.ContainsKey('ScanPageSize')) { $payload.scanPageSize = $ScanPageSize }

$payloadJson = $payload | ConvertTo-Json -Compress
Write-Host "Invoking $functionName with payload: $payloadJson"

aws lambda invoke `
  --function-name $functionName `
  --payload $payloadJson `
  --cli-binary-format raw-in-base64-out `
  "/tmp/cheer-stats-backfill-result.json" | Out-File "/tmp/cheer-stats-backfill-meta.json"

Write-Host "--- Lambda metadata ---"
Get-Content "/tmp/cheer-stats-backfill-meta.json"

Write-Host "`n--- Lambda result ---"
Get-Content "/tmp/cheer-stats-backfill-result.json"

Write-Host "`nDone"
