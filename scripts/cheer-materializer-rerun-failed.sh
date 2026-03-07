#!/usr/bin/env bash
set -euo pipefail

# Wrapper for failed segment rerun + optional SNS alert.
# Example:
#   ./scripts/cheer-materializer-rerun-failed.sh --stage prod --total-segments 8 --failed-segments 1,3,5
#   ./scripts/cheer-materializer-rerun-failed.sh --stage prod --orchestrator-arn arn:aws:states:... --total-segments 8 --failed-segments 1,3 --notify-topic-arn arn:aws:sns:...

STAGE=""
TOTAL_SEGMENTS=""
FAILED_SEGMENTS=""
ORCHESTRATOR_ARN=""
EXECUTION_NAME=""
MAX_RETRIES=""
MAX_SCAN_PAGES=""
SCAN_PAGE_SIZE=""
NOTIFY_TOPIC_ARN=""
NOTIFY_SUBJECT="[CheerStats] Failed Segment Rerun Triggered"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage)
      STAGE="${2:-}"
      shift 2
      ;;
    --total-segments)
      TOTAL_SEGMENTS="${2:-}"
      shift 2
      ;;
    --failed-segments)
      FAILED_SEGMENTS="${2:-}"
      shift 2
      ;;
    --orchestrator-arn)
      ORCHESTRATOR_ARN="${2:-}"
      shift 2
      ;;
    --execution-name)
      EXECUTION_NAME="${2:-}"
      shift 2
      ;;
    --max-retries)
      MAX_RETRIES="${2:-}"
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
    --notify-topic-arn)
      NOTIFY_TOPIC_ARN="${2:-}"
      shift 2
      ;;
    --notify-subject)
      NOTIFY_SUBJECT="${2:-}"
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

if [[ -z "$TOTAL_SEGMENTS" ]]; then
  echo "--total-segments is required" >&2
  exit 1
fi

if [[ -z "$FAILED_SEGMENTS" ]]; then
  echo "--failed-segments is required" >&2
  exit 1
fi

if [[ "$TOTAL_SEGMENTS" =~ ^[0-9]+$ ]] && (( TOTAL_SEGMENTS < 1 )); then
  echo "--total-segments must be >= 1" >&2
  exit 1
fi

RUN_CMD=("./scripts/cheer-stats-backfill.sh" "--stage" "$STAGE" "--total-segments" "$TOTAL_SEGMENTS" "--failed-segments" "$FAILED_SEGMENTS")

if [[ -n "$ORCHESTRATOR_ARN" ]]; then
  RUN_CMD+=("--orchestrator-arn" "$ORCHESTRATOR_ARN")
fi

if [[ -n "$EXECUTION_NAME" ]]; then
  RUN_CMD+=("--execution-name" "$EXECUTION_NAME")
fi

if [[ -n "$MAX_RETRIES" ]]; then
  RUN_CMD+=("--max-retries" "$MAX_RETRIES")
fi

if [[ -n "$MAX_SCAN_PAGES" ]]; then
  RUN_CMD+=("--max-scan-pages" "$MAX_SCAN_PAGES")
fi

if [[ -n "$SCAN_PAGE_SIZE" ]]; then
  RUN_CMD+=("--scan-page-size" "$SCAN_PAGE_SIZE")
fi

echo "[cheer-materializer-rerun] running: ${RUN_CMD[*]}"
"${RUN_CMD[@]}"

if [[ -n "$NOTIFY_TOPIC_ARN" ]]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "aws cli not found; skip notification" >&2
    exit 0
  fi

  MESSAGE="stage=${STAGE}\ntotalSegments=${TOTAL_SEGMENTS}\nfailedSegments=${FAILED_SEGMENTS}\norchestratorArn=${ORCHESTRATOR_ARN:-N/A}\nexecutionName=${EXECUTION_NAME:-auto}\ntriggeredAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  aws sns publish \
    --topic-arn "$NOTIFY_TOPIC_ARN" \
    --subject "$NOTIFY_SUBJECT" \
    --message "$MESSAGE" >/dev/null

  echo "[cheer-materializer-rerun] notification published to SNS"
fi
