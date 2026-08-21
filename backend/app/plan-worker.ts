import { ProviderSelectionSnapshotSchema } from "@ppt-digital-human/contracts";
import { z } from "zod";
import type { Pool } from "pg";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import type { AgentAdapter } from "./agent-adapter.ts";
import { buildAgentRevision, stableId } from "./lesson-plan-builder.ts";
import { persistRevision } from "./lesson-plan-repository.ts";
import { failProductStep, heartbeatProductLease, type ProductClaim } from "./product-lease.ts";
import { LocalAssetStore } from "./storage.ts";
import { prepareVisionInputs } from "./vision-input.ts";
import { toWorkerError, WorkerError } from "./worker-error.ts";

const PlanConfigSchema = z
  .object({
    audience: z.string().min(1).max(200),
    style: z.string().min(1).max(500),
    targetMinutes: z.number().int().min(1).max(180),
    providerSelection: ProviderSelectionSnapshotSchema.optional(),
  })
  .strict();

export async function runClaimedPlanStep(
  dependencies: {
    prisma: PrismaClient;
    pool: Pool;
    assets: LocalAssetStore;
    adapter: AgentAdapter;
    leaseMs: number;
    maxAttempts?: number;
    maxExternalAttempts?: number;
  },
  claim: ProductClaim,
  workerId: string,
): Promise<"SUCCEEDED" | "QUEUED" | "FAILED" | "CANCELLED"> {
  const task = await dependencies.prisma.generationTask.findUniqueOrThrow({
    where: { id: claim.taskId },
    include: {
      presentation: {
        include: {
          slides: {
            include: { renderAsset: true },
            orderBy: { slideNumber: "asc" },
          },
        },
      },
      outbox: { where: { eventType: "PLAN_REQUESTED" }, take: 1 },
    },
  });
  if (task.kind !== "PLAN" || task.stage !== "PLAN") {
    return failProductStep(dependencies.pool, claim, workerId, "UNSUPPORTED_TASK", "Worker 收到了不支持的任务类型。", false, dependencies.maxAttempts);
  }
  if (
    dependencies.maxExternalAttempts !== undefined &&
    claim.attempt > dependencies.maxExternalAttempts
  ) {
    return failProductStep(
      dependencies.pool,
      claim,
      workerId,
      "PLAN_RETRY_REQUIRES_USER",
      "上次规划在结果确认前中断；为避免重复调用 Provider，请显式重试规划。",
      false,
      dependencies.maxAttempts,
    );
  }
  if (task.presentation.revision !== task.presentationRevision) {
    return failProductStep(dependencies.pool, claim, workerId, "STALE_PRESENTATION", "课件解析修订已变化。", false, dependencies.maxAttempts);
  }
  const configResult = PlanConfigSchema.safeParse(task.outbox[0]?.payload);
  if (!configResult.success) {
    return failProductStep(dependencies.pool, claim, workerId, "PLAN_CONFIG_INVALID", "规划任务配置无效。", false, dependencies.maxAttempts);
  }
  const slides = task.presentation.slides;
  if (!slides.length || slides.some((slide) => !slide.renderAssetId)) {
    return failProductStep(dependencies.pool, claim, workerId, "PARSE_OUTPUT_INCOMPLETE", "课件解析结果不完整。", false, dependencies.maxAttempts);
  }

  const controller = new AbortController();
  let heartbeatRunning = false;
  const timer = setInterval(() => {
    if (heartbeatRunning || controller.signal.aborted) return;
    heartbeatRunning = true;
    void heartbeatProductLease(dependencies.pool, claim, workerId, dependencies.leaseMs)
      .then((owned) => { if (!owned) controller.abort(); })
      .catch(() => controller.abort())
      .finally(() => { heartbeatRunning = false; });
  }, Math.max(50, Math.floor(dependencies.leaseMs / 3)));

  try {
    const visionInputs = await prepareVisionInputs(slides, dependencies.assets, controller.signal);
    const result = await dependencies.adapter.run({
      slides: slides.map((slide) => ({
        id: slide.id,
        title: slide.title,
        slideType: slide.slideType,
        extractedText: slide.extractedText,
        notes: slide.notes,
        formulas: slide.formulaJson,
        image: visionInputs.get(slide.id),
      })),
      principal: task.principal,
      ...configResult.data,
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      const current = await dependencies.prisma.generationTask.findUniqueOrThrow({ where: { id: task.id } });
      return current.status === "CANCELLED" ? "CANCELLED" : "QUEUED";
    }
    const plansBySlide = new Map(result.output.slides.map((plan) => [plan.slideId, plan]));
    const createdAt = new Date();
    const revisions = slides.map((slide) => buildAgentRevision({
      taskId: task.id,
      taskInputHash: task.inputHash,
      source: slide,
      plan: plansBySlide.get(slide.id)!,
      result,
      revision: 1,
      createdAt,
    }));
    await dependencies.prisma.$transaction(async (transaction) => {
      const owned = await transaction.generationTaskStep.updateMany({
        where: { id: claim.taskStepId, workerId, currentAttempt: claim.attempt, status: "RUNNING" },
        data: {
          status: "SUCCEEDED",
          progressCompleted: slides.length,
          progressTotal: slides.length,
          workerId: null,
          leaseExpiresAt: null,
          completedAt: createdAt,
          outputHash: stableId("output", JSON.stringify(result.output)),
          errorCode: null,
          errorMessage: null,
        },
      });
      if (owned.count !== 1) throw new WorkerError("LEASE_LOST", "Worker 已失去规划步骤租约。", true);
      for (const [index, revision] of revisions.entries()) {
        await transaction.lessonPlan.create({
          data: {
            id: revision.lessonPlanId,
            projectId: task.projectId,
            presentationId: task.presentationId,
            slideId: revision.slideId,
            currentRevision: 1,
          },
        });
        await persistRevision(transaction, revision);
        await transaction.generationTask.update({ where: { id: task.id }, data: { progressCompleted: index + 1 } });
      }
      await transaction.taskStepAttempt.update({
        where: { taskStepId_attempt: { taskStepId: claim.taskStepId, attempt: claim.attempt } },
        data: { status: "SUCCEEDED", completedAt: createdAt },
      });
      await transaction.generationTask.update({
        where: { id: task.id },
        data: {
          status: "SUCCEEDED",
          progressCompleted: slides.length,
          progressTotal: slides.length,
          completedAt: createdAt,
          heartbeatAt: createdAt,
          statusVersion: { increment: 1 },
          errorCode: null,
          errorMessage: null,
        },
      });
    });
    return "SUCCEEDED";
  } catch (error) {
    const current = await dependencies.prisma.generationTask.findUnique({ where: { id: task.id } });
    if (current?.status === "CANCELLED") return "CANCELLED";
    const publicError = toWorkerError(error);
    return failProductStep(dependencies.pool, claim, workerId, publicError.code, publicError.message, publicError.retryable, dependencies.maxAttempts);
  } finally {
    clearInterval(timer);
    controller.abort();
  }
}
