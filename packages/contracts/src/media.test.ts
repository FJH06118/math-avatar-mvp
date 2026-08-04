import { describe, expect, it } from "vitest";
import { MediaValidationReportSchema } from "./media";

const report = { status: "passed", videoCodec: "h264", audioCodec: "aac", pixelFormat: "yuv420p", fps: 25, width: 1920, height: 1080, durationMs: 4800, expectedDurationMs: 4800, fastStart: true, fullDecode: true, nonSilent: true, maxBlackDurationMs: 0, pageCount: 3, pageCoverage: [1, 2, 3], obstructionClear: true, errors: [] } as const;

describe("stage T-F media contract", () => {
  it("accepts a complete hard-gate report", () => expect(MediaValidationReportSchema.safeParse(report).success).toBe(true));
  it("rejects a passed report with a failed hard gate", () => expect(MediaValidationReportSchema.safeParse({ ...report, fastStart: false }).success).toBe(false));
});
