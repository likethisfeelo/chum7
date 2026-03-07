#!/usr/bin/env bash
set -euo pipefail

# Usage examples:
#   ./scripts/cheer-stats-backfill.sh --stage dev --dry-run
#   ./scripts/cheer-stats-backfill.sh --stage prod --from 2026-03-01T00:00:00.000Z --to 2026-03-31T23:59:59.999Z --max-retries 7

STAGE=""
FROM_ISO=""
TO_ISO=""
DRY_RUN="false"
MAX_RETRIES=""
TOTAL_SEGMENTS=""
SEGMENT_INDEX=""
MAX_SCAN_PAGES=""
SCAN_PAGE_SIZE=""

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
    --max-scan-pages)
      MAX_SCAN_PAGES="${2:-}"
      shift 2
      ;;
    --scan-page-size)
      SCAN_PAGE_SIZE="${2:-}"
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

FUNCTION_NAME="chme-${STAGE}-cheer-stats-materializer"

PAYLOAD=$(python - <<PY
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
if "${SEGMENT_INDEX}":
    payload["segmentIndex"] = int("${SEGMENT_INDEX}")
if "${MAX_SCAN_PAGES}":
    payload["maxScanPages"] = int("${MAX_SCAN_PAGES}")
if "${SCAN_PAGE_SIZE}":
    payload["scanPageSize"] = int("${SCAN_PAGE_SIZE}")
print(json.dumps(payload))
PY
)

echo "Invoking ${FUNCTION_NAME} with payload: ${PAYLOAD}"
aws lambda invoke \
  --function-name "${FUNCTION_NAME}" \
  --payload "${PAYLOAD}" \
  --cli-binary-format raw-in-base64-out \
  /tmp/cheer-stats-backfill-result.json >/tmp/cheer-stats-backfill-meta.json

echo "--- Lambda metadata ---"
cat /tmp/cheer-stats-backfill-meta.json

echo "\n--- Lambda result ---"
cat /tmp/cheer-stats-backfill-result.json

echo "\nDone"
