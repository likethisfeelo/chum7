export type MediaValidationStatus = "valid" | "invalid";

export interface MediaValidationResult {
  status: MediaValidationStatus;
  reason?: string;
}

function parseOptionalNumber(raw?: string): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function evaluateVideoMetadata(
  metadata: Record<string, string | undefined>,
): MediaValidationResult {
  const trimStartSec = parseOptionalNumber(metadata.trimstartsec);
  const trimEndSec = parseOptionalNumber(metadata.trimendsec);
  const videoDurationSec = parseOptionalNumber(metadata.videodurationsec);

  if (videoDurationSec !== undefined && videoDurationSec > 60) {
    return { status: "invalid", reason: "VIDEO_DURATION_EXCEEDED" };
  }

  if (trimStartSec !== undefined && trimEndSec !== undefined) {
    if (trimStartSec >= trimEndSec) {
      return { status: "invalid", reason: "INVALID_TRIM_ORDER" };
    }
    if (trimEndSec - trimStartSec > 60) {
      return { status: "invalid", reason: "TRIM_RANGE_EXCEEDED" };
    }
  }

  return { status: "valid" };
}
