import { describe, expect, it } from "vitest";

import { createAgentPlanOutputSchema } from "./agent";

const candidate = {
  schemaVersion: "stage-tc-agent-v1" as const,
  slides: [
    {
      slideId: "slide_alpha",
      teachingGoal: "理解导数与连续的关系",
      narration: [{ displayText: "先观察定义。", spokenText: "先观察定义。" }],
      derivation: [],
      scenes: [{ durationMs: 3_000 }],
      preservationMode: "FULL_PRESERVE" as const,
    },
  ],
};

describe("stage T-C agent boundary", () => {
  it("accepts an exact strict slide plan", () => {
    expect(createAgentPlanOutputSchema(["slide_alpha"]).parse(candidate)).toEqual(candidate);
  });

  it("rejects missing, duplicate and unknown slide plans", () => {
    expect(createAgentPlanOutputSchema(["slide_alpha", "slide_beta"]).safeParse(candidate).success).toBe(false);
    expect(
      createAgentPlanOutputSchema(["slide_alpha"]).safeParse({
        ...candidate,
        slides: [...candidate.slides, candidate.slides[0]],
      }).success,
    ).toBe(false);
    expect(
      createAgentPlanOutputSchema(["slide_alpha"]).safeParse({ ...candidate, ignored: true }).success,
    ).toBe(false);
  });
});
