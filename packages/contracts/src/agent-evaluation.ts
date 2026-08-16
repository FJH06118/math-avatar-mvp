import { z } from "zod";

export const AgentModuleNameSchema = z.enum([
  "content-understanding",
  "teaching-planning",
  "narration-generation",
  "formula-derivation",
  "visual-storyboard",
  "result-review",
]);

export const AgentModuleReviewSchema = z.object({
  module: AgentModuleNameSchema,
  status: z.enum(["passed", "failed"]),
  findings: z.array(z.string().min(1).max(1_000)).max(100),
}).strict();

const RateSchema = z.object({
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().positive(),
  percent: z.number().min(0).max(100),
}).strict().superRefine((rate, context) => {
  if (rate.numerator > rate.denominator || rate.percent !== Number(((rate.numerator / rate.denominator) * 100).toFixed(2))) {
    context.addIssue({ code: "custom", message: "评测百分比必须由真实分子/分母计算" });
  }
});

export const AgentEvaluationReportSchema = z.object({
  schemaVersion: z.literal("stage-11c-agent-eval-v1"),
  promptVersion: z.string().min(1),
  contractVersion: z.string().min(1),
  modelName: z.string().min(1),
  sampleCount: z.number().int().positive(),
  firstPassSchemaRate: RateSchema,
  afterRepairSchemaRate: RateSchema,
  repairLimit: z.literal(2),
  modulePassCounts: z.record(AgentModuleNameSchema, z.number().int().nonnegative()),
  failures: z.array(z.object({ sampleId: z.string().min(1), stage: z.string().min(1), reason: z.string().min(1) }).strict()),
}).strict();

export type AgentModuleReview = z.infer<typeof AgentModuleReviewSchema>;
export type AgentEvaluationReport = z.infer<typeof AgentEvaluationReportSchema>;
