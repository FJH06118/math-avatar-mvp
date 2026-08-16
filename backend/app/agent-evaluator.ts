import {
  AgentEvaluationReportSchema,
  AgentModuleReviewSchema,
  createAgentPlanOutputSchema,
  type AgentEvaluationReport,
  type AgentModuleReview,
  type AgentPlanOutput,
} from "@ppt-digital-human/contracts";

const MODULES = [
  "content-understanding",
  "teaching-planning",
  "narration-generation",
  "formula-derivation",
  "visual-storyboard",
  "result-review",
] as const;

export function parseAndValidateAgentContent(content: string, slideIds: readonly string[]): {
  output: AgentPlanOutput;
  attempts: number;
  modules: AgentModuleReview[];
} {
  const candidates = repairCandidates(content);
  let lastReason = "课程规划结果不是合法 JSON。";
  for (const [index, candidate] of candidates.entries()) {
    try {
      const payload: unknown = JSON.parse(candidate);
      const parsed = createAgentPlanOutputSchema(slideIds).safeParse(payload);
      if (!parsed.success) {
        lastReason = parsed.error.issues.slice(0, 8).map((issue) => `${issue.path.join(".") || "root"}:${issue.message}`).join("；");
        continue;
      }
      const modules = reviewAgentModules(parsed.data);
      const failed = modules.find((module) => module.status === "failed");
      if (failed) throw new Error(`${failed.module}:${failed.findings.join("；")}`);
      return { output: parsed.data, attempts: index + 1, modules };
    } catch (error) {
      if (error instanceof SyntaxError) lastReason = "课程规划结果不是合法 JSON。";
      else if (error instanceof Error) lastReason = error.message;
    }
  }
  throw new Error(lastReason);
}

export function reviewAgentModules(output: AgentPlanOutput): AgentModuleReview[] {
  const reviews: AgentModuleReview[] = [];
  const add = (module: typeof MODULES[number], findings: string[]) => reviews.push(AgentModuleReviewSchema.parse({ module, status: findings.length ? "failed" : "passed", findings }));
  add("content-understanding", output.slides.flatMap((slide) => slide.teachingGoal.trim() ? [] : [`${slide.slideId}:缺少教学目标`]));
  add("teaching-planning", output.slides.flatMap((slide) => slide.scenes.length ? [] : [`${slide.slideId}:缺少场景计划`]));
  add("narration-generation", output.slides.flatMap((slide) => slide.narration.every((item) => item.displayText.trim() && item.spokenText.trim()) ? [] : [`${slide.slideId}:讲稿不完整`]));
  add("formula-derivation", output.slides.flatMap((slide) => slide.derivation.every((step) => step.explanation.trim()) ? [] : [`${slide.slideId}:推导缺少理由`]));
  add("visual-storyboard", output.slides.flatMap((slide) => slide.scenes.every((scene) => scene.durationMs >= 1_500) ? [] : [`${slide.slideId}:场景不足 1.5 秒`]));
  const priorFailures = reviews.filter((review) => review.status === "failed").map((review) => review.module);
  add("result-review", priorFailures.length ? [`上游模块失败：${priorFailures.join(",")}`] : []);
  return reviews;
}

export function evaluateAgentFixtures(fixtures: Array<{ id: string; content: string; slideIds: string[] }>): AgentEvaluationReport {
  let firstPass = 0;
  let afterRepair = 0;
  const modulePassCounts = Object.fromEntries(MODULES.map((module) => [module, 0])) as Record<typeof MODULES[number], number>;
  const failures: AgentEvaluationReport["failures"] = [];
  for (const fixture of fixtures) {
    try {
      const result = parseAndValidateAgentContent(fixture.content, fixture.slideIds);
      afterRepair += 1;
      if (result.attempts === 1) firstPass += 1;
      for (const module of result.modules) if (module.status === "passed") modulePassCounts[module.module] += 1;
    } catch (error) {
      failures.push({ sampleId: fixture.id, stage: "schema-or-module-review", reason: error instanceof Error ? error.message : "unknown" });
    }
  }
  const rate = (numerator: number) => ({ numerator, denominator: fixtures.length, percent: Number(((numerator / fixtures.length) * 100).toFixed(2)) });
  return AgentEvaluationReportSchema.parse({
    schemaVersion: "stage-11c-agent-eval-v1",
    promptVersion: "stage-tc-agent-prompt-v1",
    contractVersion: "stage-tc-agent-v1",
    modelName: "offline-fixture",
    sampleCount: fixtures.length,
    firstPassSchemaRate: rate(firstPass),
    afterRepairSchemaRate: rate(afterRepair),
    repairLimit: 2,
    modulePassCounts,
    failures,
  });
}

function repairCandidates(content: string): string[] {
  const trimmed = content.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  const extracted = start >= 0 && end > start ? withoutFence.slice(start, end + 1) : withoutFence;
  const repaired = withoutFence !== trimmed ? withoutFence : extracted;
  return [...new Set([trimmed, repaired])].slice(0, 2);
}
