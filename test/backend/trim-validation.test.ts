import { isValidTrimRange } from "../../backend/shared/lib/trim-validation";

describe("trim validation", () => {
  test("allows undefined partial ranges for backward compatibility", () => {
    expect(isValidTrimRange(undefined, undefined)).toBe(true);
    expect(isValidTrimRange(0, undefined)).toBe(true);
    expect(isValidTrimRange(undefined, 10)).toBe(true);
  });

  test("accepts valid range within 60 seconds", () => {
    expect(isValidTrimRange(0, 60)).toBe(true);
    expect(isValidTrimRange(10.5, 20.5)).toBe(true);
  });

  test("rejects invalid order or over 60 seconds", () => {
    expect(isValidTrimRange(20, 20)).toBe(false);
    expect(isValidTrimRange(20, 10)).toBe(false);
    expect(isValidTrimRange(0, 60.1)).toBe(false);
  });
});
