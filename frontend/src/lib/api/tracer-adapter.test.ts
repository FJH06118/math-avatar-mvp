import { describe, expect, it } from "vitest";
import { getEnabledTracerApiAdapter, tracerApiAdapter } from "./tracer-adapter";

describe("stage T adapter flag", () => {
  it("keeps Mock as the default and requires an explicit stage-t flag", () => {
    expect(getEnabledTracerApiAdapter(undefined)).toBeNull();
    expect(getEnabledTracerApiAdapter("mock")).toBeNull();
    expect(getEnabledTracerApiAdapter("stage-t")).toBe(tracerApiAdapter);
  });
});
