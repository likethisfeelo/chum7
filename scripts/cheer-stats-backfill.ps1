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
  [int[]]$FailedSegments,
  [int]$MaxScanPages,
  [int]$ScanPageSize,
  [string]$OrchestratorArn
)

$functionName = "chme-$Stage-cheer-stats-materializer"

if ($script:PSBoundParameters.ContainsKey('FailedSegments') -and $script:PSBoundParameters.ContainsKey('SegmentIndex')) {
  throw '-FailedSegments and -SegmentIndex cannot be used together.'
}

if ($OrchestratorArn -and $script:PSBoundParameters.ContainsKey('SegmentIndex')) {
  throw '-SegmentIndex is not supported with -OrchestratorArn. Use -FailedSegments or -TotalSegments.'
}

if ($script:PSBoundParameters.ContainsKey('TotalSegments') -and $TotalSegments -lt 1) {
  throw '-TotalSegments must be >= 1.'
}

if ($script:PSBoundParameters.ContainsKey('SegmentIndex') -and $SegmentIndex -lt 0) {
  throw '-SegmentIndex must be >= 0.'
}

if ($script:PSBoundParameters.ContainsKey('TotalSegments') -and $script:PSBoundParameters.ContainsKey('SegmentIndex') -and $SegmentIndex -ge $TotalSegments) {
  throw '-SegmentIndex must be less than -TotalSegments.'
}

if ($script:PSBoundParameters.ContainsKey('FailedSegments') -and $script:PSBoundParameters.ContainsKey('TotalSegments')) {
  foreach ($seg in $FailedSegments) {
    if ($seg -lt 0 -or $seg -ge $TotalSegments) {
      throw "-FailedSegments value out of range: $seg (total segments: $TotalSegments)"
    }
  }
}

function Invoke-BackfillSegment {
  param(
    [Nullable[int]]$OverrideSegmentIndex
  )

  $payload = @{}
  if ($FromIso) { $payload.fromIso = $FromIso }
  if ($ToIso) { $payload.toIso = $ToIso }
  $payload.dryRun = [bool]$DryRun

  if ($script:PSBoundParameters.ContainsKey('MaxRetries')) { $payload.maxRetries = $MaxRetries }
  if ($script:PSBoundParameters.ContainsKey('TotalSegments')) { $payload.totalSegments = $TotalSegments }

  if ($null -ne $OverrideSegmentIndex) {
    $payload.segmentIndex = [int]$OverrideSegmentIndex
  }
  elseif ($script:PSBoundParameters.ContainsKey('SegmentIndex')) {
    $payload.segmentIndex = $SegmentIndex
  }

  if ($script:PSBoundParameters.ContainsKey('MaxScanPages')) { $payload.maxScanPages = $MaxScanPages }
  if ($script:PSBoundParameters.ContainsKey('ScanPageSize')) { $payload.scanPageSize = $ScanPageSize }

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
}

function Invoke-Orchestrator {
  $segments = @()

  if ($script:PSBoundParameters.ContainsKey('FailedSegments') -and $FailedSegments.Count -gt 0) {
    foreach ($seg in $FailedSegments) {
      $segments += @{ segmentIndex = [int]$seg }
    }
  }
  elseif ($script:PSBoundParameters.ContainsKey('TotalSegments') -and $TotalSegments -gt 0) {
    for ($i = 0; $i -lt $TotalSegments; $i++) {
      $segments += @{ segmentIndex = $i }
    }
  }
  else {
    $segments += @{ segmentIndex = 0 }
  }

  $input = @{ segments = $segments } | ConvertTo-Json -Compress
  Write-Host "Starting orchestrator $OrchestratorArn with input: $input"

  aws stepfunctions start-execution `
    --state-machine-arn $OrchestratorArn `
    --input $input | Out-File "/tmp/cheer-stats-orchestrator-start.json"

  Write-Host "--- StepFunctions start-execution ---"
  Get-Content "/tmp/cheer-stats-orchestrator-start.json"
  Write-Host "`nDone"
}

if ($OrchestratorArn) {
  Invoke-Orchestrator
  exit 0
}

if ($script:PSBoundParameters.ContainsKey('FailedSegments') -and $FailedSegments.Count -gt 0) {
  foreach ($seg in $FailedSegments) {
    Invoke-BackfillSegment -OverrideSegmentIndex $seg
  }
} else {
  Invoke-BackfillSegment
}
