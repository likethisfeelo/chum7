#!/usr/bin/env bash
set -euo pipefail

# Usage examples:
#   ./scripts/cheer-stats-backfill.sh --stage dev --dry-run
#   ./scripts/cheer-stats-backfill.sh --stage prod --from 2026-03-01T00:00:00.000Z --to 2026-03-31T23:59:59.999Z --max-retries 7
#   ./scripts/cheer-stats-backfill.sh --stage prod --total-segments 4 --failed-segments 1,3
#   ./scripts/cheer-stats-backfill.sh --stage prod --orchestrator-arn arn:aws:states:... --failed-segments 1,3

STAGE=""
FROM_ISO=""
TO_ISO=""
DRY_RUN="false"
MAX_RETRIES=""
TOTAL_SEGMENTS=""
SEGMENT_INDEX=""
FAILED_SEGMENTS=""
MAX_SCAN_PAGES=""
SCAN_PAGE_SIZE=""
ORCHESTRATOR_ARN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage)
      STAGE="${2:-}"
      shift 2
      ;;
    --from)
      FROM_ISO="${2:-}"
      shift 2
      ;;
    --to)
      TO_ISO="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --max-retries)
      MAX_RETRIES="${2:-}"
      shift 2
      ;;
    --total-segments)
      TOTAL_SEGMENTS="${2:-}"
      shift 2
      ;;
    --segment-index)
      SEGMENT_INDEX="${2:-}"
      shift 2
      ;;
    --failed-segments)
      FAILED_SEGMENTS="${2:-}"
      shift 2
      ;;
    --max-scan-pages)
      MAX_SCAN_PAGES="${2:-}"
      shift 2
      ;;
    --scan-page-size)
      SCAN_PAGE_SIZE="${2:-}"
      shift 2
      ;;
    --orchestrator-arn)
      ORCHESTRATOR_ARN="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$STAGE" ]]; then
  echo "--stage is required (dev|prod)" >&2
  exit 1
fi

if [[ -n "$FAILED_SEGMENTS" && -n "$SEGMENT_INDEX" ]]; then
  echo "--failed-segments and --segment-index cannot be used together" >&2
  exit 1
fi

if [[ -n "$ORCHESTRATOR_ARN" && -n "$SEGMENT_INDEX" ]]; then
  echo "--segment-index is not supported with --orchestrator-arn. Use --failed-segments or --total-segments instead." >&2
  exit 1
fi

if [[ -n "$TOTAL_SEGMENTS" && ! "$TOTAL_SEGMENTS" =~ ^[0-9]+$ ]]; then
  echo "--total-segments must be a positive integer" >&2
  exit 1
fi

if [[ -n "$TOTAL_SEGMENTS" && "$TOTAL_SEGMENTS" -lt 1 ]]; then
  echo "--total-segments must be >= 1" >&2
  exit 1
fi

if [[ -n "$FAILED_SEGMENTS" && -n "$TOTAL_SEGMENTS" ]]; then
  IFS=',' read -r -a _failed_segments_validated <<< "$FAILED_SEGMENTS"
  for _seg in "${_failed_segments_validated[@]}"; do
    _trimmed="$(echo "$_seg" | xargs)"
    if [[ -z "$_trimmed" ]]; then
      continue
    fi
    if ! [[ "$_trimmed" =~ ^[0-9]+$ ]]; then
      echo "--failed-segments contains non-numeric value: $_trimmed" >&2
      exit 1
    fi
    if (( _trimmed < 0 || _trimmed >= TOTAL_SEGMENTS )); then
      echo "--failed-segments value out of range: $_trimmed (total segments: $TOTAL_SEGMENTS)" >&2
      exit 1
    fi
  done
fi

FUNCTION_NAME="chme-${STAGE}-cheer-stats-materializer"

build_lambda_payload() {
  local segment_index_value="${1:-}"
  python - <<PY
import json
payload = {}
if "${FROM_ISO}":
    payload["fromIso"] = "${FROM_ISO}"
if "${TO_ISO}":
    payload["toIso"] = "${TO_ISO}"
payload["dryRun"] = ${DRY_RUN}
if "${MAX_RETRIES}":
    payload["maxRetries"] = int("${MAX_RETRIES}")
if "${TOTAL_SEGMENTS}":
    payload["totalSegments"] = int("${TOTAL_SEGMENTS}")
if "${segment_index_value}":
    payload["segmentIndex"] = int("${segment_index_value}")
elif "${SEGMENT_INDEX}":
    payload["segmentIndex"] = int("${SEGMENT_INDEX}")
if "${MAX_SCAN_PAGES}":
    payload["maxScanPages"] = int("${MAX_SCAN_PAGES}")
if "${SCAN_PAGE_SIZE}":
    payload["scanPageSize"] = int("${SCAN_PAGE_SIZE}")
print(json.dumps(payload))
PY
}

invoke_lambda_once() {
  local segment_index_value="${1:-}"
  local payload
  payload="$(build_lambda_payload "$segment_index_value")"

  echo "Invoking ${FUNCTION_NAME} with payload: ${payload}"
  aws lambda invoke \
    --function-name "${FUNCTION_NAME}" \
    --payload "${payload}" \
    --cli-binary-format raw-in-base64-out \
    /tmp/cheer-stats-backfill-result.json >/tmp/cheer-stats-backfill-meta.json

  echo "--- Lambda metadata ---"
  cat /tmp/cheer-stats-backfill-meta.json

  echo "\n--- Lambda result ---"
  cat /tmp/cheer-stats-backfill-result.json

  echo "\nDone"
}

invoke_orchestrator_once() {
  local segment_csv="${1:-}"
  local payload

  payload=$(python - <<PY
import json
segments = []
if "${segment_csv}":
    for token in "${segment_csv}".split(','):
        token = token.strip()
        if not token:
            continue
        segments.append({"segmentIndex": int(token)})
elif "${TOTAL_SEGMENTS}":
    total = int("${TOTAL_SEGMENTS}")
    segments = [{"segmentIndex": i} for i in range(total)]
else:
    segments = [{"segmentIndex": 0}]
print(json.dumps({"segments": segments}))
PY
  )

  echo "Starting orchestrator ${ORCHESTRATOR_ARN} with input: ${payload}"
  aws stepfunctions start-execution \
    --state-machine-arn "${ORCHESTRATOR_ARN}" \
    --input "${payload}" \
    >/tmp/cheer-stats-orchestrator-start.json

  echo "--- StepFunctions start-execution ---"
  cat /tmp/cheer-stats-orchestrator-start.json
  echo "\nDone"
}

if [[ -n "${ORCHESTRATOR_ARN}" ]]; then
  invoke_orchestrator_once "${FAILED_SEGMENTS}"
  exit 0
fi

if [[ -n "${FAILED_SEGMENTS}" ]]; then
  IFS=',' read -r -a segments <<< "${FAILED_SEGMENTS}"
  for seg in "${segments[@]}"; do
    trimmed="$(echo "$seg" | xargs)"
    if [[ -z "$trimmed" ]]; then
      continue
    fi

    invoke_lambda_once "$trimmed"
  done
else
  invoke_lambda_once ""
fi
