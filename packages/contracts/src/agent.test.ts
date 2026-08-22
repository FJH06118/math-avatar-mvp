import { describe, expect, it } from "vitest";

import { createAgentPlanOutputSchema } from "./agent";

const candidate = {
  schemaVersion: "stage-tc-agent-v2-animation" as const,
  slides: [
    {
      slideId: "slide_alpha",
      teachingGoal: "理解导数与连续的关系",
      narration: [{ displayText: "先观察定义。", spokenText: "先观察定义。" }],
      derivation: [],
      scenes: [{ durationMs: 3_000 }],
      preservationMode: "FULL_PRESERVE" as const,
      animationUnderstanding: {
        manifestId: "animation_manifest_alpha",
        interpretations: [],
        summary: "该页没有动画效果。",
        reviewRequired: false,
        reviewNotes: [],
      },
    },
  ],
};

describe("stage T-C agent boundary", () => {
  it("accepts an exact strict slide plan", () => {
    expect(createAgentPlanOutputSchema(["slide_alpha"], [{
      slideId: "slide_alpha",
      manifestId: "animation_manifest_alpha",
      effectIds: [],
      reviewRequired: false,
    }]).parse(candidate)).toEqual(candidate);
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

  it("prevents the model from replacing, reordering, or omitting authoritative effects", () => {
    const effectIds = ["effect_authoritative_1", "effect_authoritative_2"];
    const withEffects = {
      ...candidate,
      slides: [{
        ...candidate.slides[0],
        animationUnderstanding: {
          ...candidate.slides[0].animationUnderstanding,
          interpretations: effectIds.map((effectId) => ({
            effectId,
            teachingRole: "EMPHASIS" as const,
            rationale: "用于强调当前教学对象。",
            narrationSync: {
              relation: "AT_EFFECT_START" as const,
              narrationSegmentIndex: 0,
              note: "在动画开始时朗读，不改变原始计时。",
            },
            confidence: "HIGH" as const,
            reviewRequired: false,
          })),
        },
      }],
    };
    const schema = createAgentPlanOutputSchema(["slide_alpha"], [{
      slideId: "slide_alpha",
      manifestId: "animation_manifest_alpha",
      effectIds,
      reviewRequired: false,
    }]);
    expect(schema.safeParse(withEffects).success).toBe(true);
    const reversed = structuredClone(withEffects);
    reversed.slides[0].animationUnderstanding.interpretations.reverse();
    expect(schema.safeParse(reversed).success).toBe(false);
    const replaced = structuredClone(withEffects);
    replaced.slides[0].animationUnderstanding.manifestId = "animation_manifest_replaced";
    expect(schema.safeParse(replaced).success).toBe(false);
    const timingOverride = structuredClone(withEffects) as unknown as Record<string, unknown>;
    const slide = (timingOverride.slides as Array<Record<string, unknown>>)[0];
    const understanding = slide.animationUnderstanding as Record<string, unknown>;
    const interpretations = understanding.interpretations as Array<Record<string, unknown>>;
    interpretations[0].durationSeconds = 9_999;
    expect(schema.safeParse(timingOverride).success).toBe(false);
  });
});
