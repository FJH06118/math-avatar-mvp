import { describe, expect, it } from "vitest";

import { RuntimeDiagnosticSchema, RuntimeHealthSchema } from "./runtime-health";

const checkedAt = "2026-08-17T00:00:00.000Z";

describe("runtime health contracts", () => {
  it("accepts a sanitized not-configured health projection", () => {
    const parsed = RuntimeHealthSchema.safeParse({
      mode: "production",
      status: "NOT_CONFIGURED",
      checkedAt,
      components: [
        {
          id: "provider",
          status: "NOT_CONFIGURED",
          message: "尚未配置默认 Provider。",
          action: "打开设置页配置并测试 Provider。",
          version: null,
          latencyMs: 4,
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects secrets, paths, and unknown fields at the diagnostic boundary", () => {
    expect(
      RuntimeDiagnosticSchema.safeParse({
        schemaVersion: "runtime-diagnostic-v1",
        generatedAt: checkedAt,
        health: {
          mode: "production",
          status: "READY",
          checkedAt,
          components: [],
        },
        databaseUrl: "postgresql://user:password@127.0.0.1:5432/app",
        runtimeRoot: "C:\\path\\to\\runtime",
      }).success,
    ).toBe(false);
  });
});
