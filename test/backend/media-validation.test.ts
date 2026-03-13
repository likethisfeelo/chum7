import { evaluateVideoMetadata } from "../../backend/shared/lib/media-validation";

describe("media validation evaluateVideoMetadata", () => {
  test("returns valid for sane metadata", () => {
    expect(
      evaluateVideoMetadata({
        trimstartsec: "0",
        trimendsec: "59.9",
        videodurationsec: "59.9",
      }),
    ).toEqual({ status: "valid" });
  });

  test("rejects duration over 60s", () => {
    expect(evaluateVideoMetadata({ videodurationsec: "60.1" })).toEqual({
      status: "invalid",
      reason: "VIDEO_DURATION_EXCEEDED",
    });
  });

  test("rejects invalid trim ordering", () => {
    expect(
      evaluateVideoMetadata({ trimstartsec: "40", trimendsec: "20" }),
    ).toEqual({ status: "invalid", reason: "INVALID_TRIM_ORDER" });
  });

  test("rejects trim range over 60s", () => {
    expect(
      evaluateVideoMetadata({ trimstartsec: "0", trimendsec: "60.5" }),
    ).toEqual({ status: "invalid", reason: "TRIM_RANGE_EXCEEDED" });
  });
});
