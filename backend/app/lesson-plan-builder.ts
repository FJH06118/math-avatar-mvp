import { createHash } from "node:crypto";
import {
  LessonPlanRevisionSchema,
  type AgentSlidePlan,
  type LessonPlanRevision,
} from "@ppt-digital-human/contracts";
import type { AgentAdapterResult } from "./agent-adapter.ts";

export interface PlanSourceSlide {
  id: string;
  renderAssetId: string | null;
}

export function buildAgentRevision(input: {
  taskId: string;
  taskInputHash: string;
  source: PlanSourceSlide;
  plan: AgentSlidePlan;
  result: AgentAdapterResult;
  revision: number;
  createdAt: Date;
}): LessonPlanRevision {
  if (!input.source.renderAssetId) throw new Error("Parsed slide is missing its original-page asset.");
  const lessonPlanId = stableId("lesson", input.source.id);
  const revisionId = stableId("revision", `${input.taskId}:${input.source.id}:${input.revision}`);
  const narration = input.plan.narration.map((segment, index) => ({
    id: stableId("narration", `${revisionId}:${index}`),
    ...segment,
  }));
  const derivation = input.plan.derivation.map((step, index) => ({
    id: stableId("derivation", `${revisionId}:${index}`),
    ...step,
  }));
  const scenes = input.plan.scenes.map((scene, index) => ({
    id: stableId("scene", `${revisionId}:${index}`),
    sourceSlides: [input.source.id],
    baseSlide: {
      sourceAssetId: input.source.renderAssetId!,
      preservationMode: input.plan.preservationMode,
      fit: "contain" as const,
      mustShowFullSlide: true,
      fullSlideDurationMs: scene.durationMs,
      fullRedesignAuthorizedByUser: false,
    },
    durationMs: scene.durationMs,
    overlay: scene.overlay,
    isSkipped: false,
  }));
  const businessOutput = {
    teachingGoal: input.plan.teachingGoal,
    narration,
    derivation,
    scenes,
    preservationMode: input.plan.preservationMode,
  };
  return LessonPlanRevisionSchema.parse({
    id: revisionId,
    lessonPlanId,
    slideId: input.source.id,
    revision: input.revision,
    ...businessOutput,
    sourceSlideCoverage: [input.source.id],
    estimatedDurationMs: scenes.reduce((total, scene) => total + scene.durationMs, 0),
    modelProvider: input.result.provider,
    modelName: input.result.model,
    promptVersion: input.result.promptVersion,
    schemaVersion: input.result.output.schemaVersion,
    inputHash: stableHash({ slideId: input.source.id, taskInputHash: input.taskInputHash }),
    outputHash: stableHash(businessOutput),
    createdBy: "agent",
    createdAt: input.createdAt.toISOString(),
    approval: { status: "pending" },
  });
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex")}`;
}
