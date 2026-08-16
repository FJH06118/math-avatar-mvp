import type { PrismaClient, WorkflowRun as PrismaWorkflowRun, GenerationTask } from "../generated/prisma/client.ts";
import type { ProviderSelectionSnapshot, TeachingSettings } from "@ppt-digital-human/contracts";
import { AppHttpError } from "./errors.ts";
import { AudioRepository } from "./audio-repository.ts";
import { LessonPlanRepository } from "./lesson-plan-repository.ts";
import { MediaRepository } from "./media-repository.ts";
import { ProductRepository } from "./repository.ts";
import { RenderRepository } from "./render-repository.ts";
import {
  activeWorkflowTaskId,
  parseWorkflowInputSnapshot,
  workflowRetryKey,
} from "./workflow-repository.ts";

type WorkflowAdvanceResult = "WAITING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export class WorkflowOrchestrator {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly products = new ProductRepository(prisma),
    private readonly lessonPlans = new LessonPlanRepository(prisma),
    private readonly audio = new AudioRepository(prisma),
    private readonly renders = new RenderRepository(prisma),
    private readonly media = new MediaRepository(prisma),
  ) {}

  async advance(
    workflowId: string,
    workerId: string,
  ): Promise<WorkflowAdvanceResult> {
    let run = await this.prisma.workflowRun.findUnique({ where: { id: workflowId } });
    if (!run || run.leaseOwner !== workerId) return "WAITING";

    if (run.cancellationRequestedAt) {
      return this.cancelRun(run, workerId);
    }

    const snapshot = parseWorkflowInputSnapshot(run.inputSnapshot);
    const taskId = activeWorkflowTaskId(run);
    const task = taskId
      ? await this.prisma.generationTask.findUnique({ where: { id: taskId } })
      : null;

    if (!task) {
      try {
        const created = await this.createCurrentTask(run, snapshot);
        await this.persistTaskReference(run, workerId, created, {
          clearRetryKey: Boolean(run.pendingRetryIdempotencyKey),
        });
        await this.releaseLease(workflowId, workerId);
        return "WAITING";
      } catch (error) {
        return this.failRun(run, workerId, error);
      }
    }

    if (task.status === "FAILED" || task.status === "CANCELLED") {
      if (run.pendingRetryIdempotencyKey) {
        try {
          const retry = await this.products.retryTask(
            run.principal,
            task.id,
            run.projectId,
            workflowRetryKey(run.id, run.currentStage, run.retryCount),
          );
          await this.persistTaskReference(run, workerId, retry.task, {
            clearRetryKey: true,
          });
          await this.releaseLease(workflowId, workerId);
          return "WAITING";
        } catch (error) {
          return this.failRun(run, workerId, error);
        }
      }
      return this.failRun(run, workerId, {
        code: task.errorCode ?? (task.status === "CANCELLED" ? "WORKFLOW_CHILD_CANCELLED" : "WORKFLOW_CHILD_FAILED"),
        message: task.errorMessage ?? (task.status === "CANCELLED" ? "生成子任务已取消。" : "生成子任务失败。"),
      });
    }

    if (task.status !== "SUCCEEDED") {
      await this.syncProgress(run, workerId, task);
      await this.releaseLease(workflowId, workerId);
      return "WAITING";
    }

    if (task.stage === "VALIDATE") {
      const completedAt = new Date();
      await this.prisma.workflowRun.updateMany({
        where: { id: workflowId, leaseOwner: workerId },
        data: {
          status: "SUCCEEDED",
          currentStage: "VALIDATE",
          progressCompleted: task.progressTotal,
          progressTotal: task.progressTotal,
          currentSlideId: null,
          completedAt,
          heartbeatAt: completedAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          statusVersion: { increment: 1 },
          errorCode: null,
          errorMessage: null,
        },
      });
      return "SUCCEEDED";
    }

    const nextStage = nextWorkflowStage(task.stage);
    if (!nextStage) {
      return this.failRun(run, workerId, {
        code: "WORKFLOW_STAGE_UNSUPPORTED",
        message: "服务端无法推进当前生成阶段。",
      });
    }
    if (task.stage === "COMPOSITE" && nextStage === "VALIDATE") {
      return this.failRun(run, workerId, {
        code: "WORKFLOW_VALIDATION_NOT_QUEUED",
        message: "合成任务未创建最终验证步骤。",
      });
    }
    run = await this.moveToStage(run, workerId, nextStage);
    if (!run) return "WAITING";
    return this.advance(run.id, workerId);
  }

  private async createCurrentTask(
    run: PrismaWorkflowRun,
    snapshot: ReturnType<typeof parseWorkflowInputSnapshot>,
  ): Promise<GenerationTask> {
    switch (run.currentStage) {
      case "PLAN": {
        const result = await this.lessonPlans.createPlanTask(
          run.principal,
          run.projectId,
          {
            presentationId: run.presentationId,
            idempotencyKey: `workflow_${run.id}_plan_initial`,
            audience: snapshot.audience,
            style: snapshot.style,
            targetMinutes: snapshot.targetMinutes,
          },
          snapshot.providerSelection ?? undefined,
        );
        return result.task;
      }
      case "AUDIO": {
        const result = await this.audio.createTask(run.principal, run.projectId, {
          presentationId: run.presentationId,
          idempotencyKey: `workflow_${run.id}_audio_initial`,
          voice: edgeVoiceFor(snapshot.settings.voiceId),
          rate: edgeRateFor(snapshot.settings.speechRate),
          pitch: edgePitchFor(snapshot.settings.voiceId),
        });
        return result.task;
      }
      case "PAGE_RENDER": {
        if (!run.audioTaskId) throw new WorkflowInputError("AUDIO_TASK_MISSING", "缺少已完成的音频任务。");
        const result = await this.renders.createTask(run.principal, run.projectId, {
          presentationId: run.presentationId,
          audioTaskId: run.audioTaskId,
          idempotencyKey: `workflow_${run.id}_pages_initial`,
          fps: 25,
        });
        return result.task;
      }
      case "COMPOSITE": {
        if (!run.audioTaskId || !run.renderTaskId) {
          throw new WorkflowInputError("WORKFLOW_TASKS_MISSING", "缺少合成所需的音频或分页任务。");
        }
        const result = await this.media.createTask(run.principal, run.projectId, {
          presentationId: run.presentationId,
          audioTaskId: run.audioTaskId,
          renderTaskId: run.renderTaskId,
          idempotencyKey: `workflow_${run.id}_media_initial`,
        });
        return result.task;
      }
      case "VALIDATE":
        throw new WorkflowInputError("WORKFLOW_STAGE_INVALID", "验证阶段缺少合成任务。");
      default:
        throw new WorkflowInputError("WORKFLOW_STAGE_UNSUPPORTED", "服务端无法识别生成阶段。");
    }
  }

  private async persistTaskReference(
    run: PrismaWorkflowRun,
    workerId: string,
    task: GenerationTask,
    options: { clearRetryKey?: boolean } = {},
  ) {
    const field = task.stage === "PLAN"
      ? "planTaskId"
      : task.stage === "AUDIO"
        ? "audioTaskId"
        : task.stage === "PAGE_RENDER"
          ? "renderTaskId"
          : "compositeTaskId";
    const now = new Date();
    await this.prisma.workflowRun.updateMany({
      where: { id: run.id, leaseOwner: workerId },
      data: {
        [field]: task.id,
        currentStage: task.stage,
        status: "RUNNING",
        progressCompleted: task.progressCompleted,
        progressTotal: task.progressTotal,
        currentSlideId: null,
        startedAt: run.startedAt ?? now,
        heartbeatAt: now,
        statusVersion: { increment: 1 },
        ...(options.clearRetryKey ? { lastRetryIdempotencyKey: null } : {}),
      },
    });
  }

  private async syncProgress(run: PrismaWorkflowRun, workerId: string, task: GenerationTask) {
    const activeStep = await this.prisma.generationTaskStep.findFirst({
      where: { taskId: task.id, status: "RUNNING" },
      orderBy: { updatedAt: "desc" },
    });
    const now = new Date();
    await this.prisma.workflowRun.updateMany({
      where: { id: run.id, leaseOwner: workerId },
      data: {
        status: task.status === "RUNNING" ? "RUNNING" : "QUEUED",
        currentStage: task.stage,
        progressCompleted: task.progressCompleted,
        progressTotal: Math.max(1, task.progressTotal),
        currentSlideId: activeStep?.slideId ?? null,
        heartbeatAt: now,
        statusVersion: { increment: 1 },
      },
    });
  }

  private async moveToStage(
    run: PrismaWorkflowRun,
    workerId: string,
    stage: "PLAN" | "AUDIO" | "PAGE_RENDER" | "COMPOSITE" | "VALIDATE",
  ) {
    const now = new Date();
    const updated = await this.prisma.workflowRun.updateMany({
      where: { id: run.id, leaseOwner: workerId },
      data: {
        currentStage: stage,
        status: "RUNNING",
        progressCompleted: 0,
        progressTotal: 1,
        currentSlideId: null,
        heartbeatAt: now,
        statusVersion: { increment: 1 },
      },
    });
    return updated.count === 1
      ? this.prisma.workflowRun.findUnique({ where: { id: run.id } })
      : null;
  }

  private async cancelRun(run: PrismaWorkflowRun, workerId: string): Promise<"CANCELLED"> {
    const taskId = activeWorkflowTaskId(run);
    if (taskId) {
      await this.products.cancelTask(run.principal, taskId);
    }
    const now = new Date();
    await this.prisma.workflowRun.updateMany({
      where: { id: run.id, leaseOwner: workerId },
      data: {
        status: "CANCELLED",
        cancellationRequestedAt: run.cancellationRequestedAt ?? now,
        completedAt: now,
        heartbeatAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        statusVersion: { increment: 1 },
      },
    });
    return "CANCELLED";
  }

  private async failRun(
    run: PrismaWorkflowRun,
    workerId: string,
    error: unknown,
  ): Promise<"FAILED"> {
    const publicError = error instanceof AppHttpError
      ? { code: error.code, message: error.message }
      : error instanceof WorkflowInputError
        ? { code: error.code, message: error.message }
        : isWorkflowError(error)
          ? { code: error.code, message: error.message }
        : { code: "WORKFLOW_ADVANCE_FAILED", message: "生成工作流推进失败。" };
    const now = new Date();
    await this.prisma.workflowRun.updateMany({
      where: { id: run.id, leaseOwner: workerId },
      data: {
        status: "FAILED",
        errorCode: publicError.code,
        errorMessage: publicError.message,
        completedAt: now,
        heartbeatAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        statusVersion: { increment: 1 },
      },
    });
    return "FAILED";
  }

  private async releaseLease(workflowId: string, workerId: string) {
    await this.prisma.workflowRun.updateMany({
      where: { id: workflowId, leaseOwner: workerId },
      data: { leaseOwner: null, leaseExpiresAt: null },
    });
  }
}

function isWorkflowError(value: unknown): value is { code: string; message: string } {
  return Boolean(
    value &&
    typeof value === "object" &&
    "code" in value &&
    "message" in value &&
    typeof value.code === "string" &&
    typeof value.message === "string",
  );
}

class WorkflowInputError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "WorkflowInputError";
  }
}

function nextWorkflowStage(stage: string): "PLAN" | "AUDIO" | "PAGE_RENDER" | "COMPOSITE" | "VALIDATE" | null {
  switch (stage) {
    case "PLAN": return "AUDIO";
    case "AUDIO": return "PAGE_RENDER";
    case "PAGE_RENDER": return "COMPOSITE";
    case "COMPOSITE": return "VALIDATE";
    default: return null;
  }
}

function edgeVoiceFor(voiceId: string): string {
  return {
    "voice-qinghe": "zh-CN-XiaoxiaoNeural",
    "voice-zhiyuan": "zh-CN-YunyangNeural",
    "voice-mingxi": "zh-CN-XiaoyiNeural",
  }[voiceId] ?? "zh-CN-XiaoxiaoNeural";
}

function edgeRateFor(speechRate: number): string {
  const percentage = Math.round((speechRate - 1) * 100);
  return `${percentage >= 0 ? "+" : ""}${percentage}%`;
}

function edgePitchFor(voiceId: string): string {
  return {
    "voice-qinghe": "+0Hz",
    "voice-zhiyuan": "-2Hz",
    "voice-mingxi": "+2Hz",
  }[voiceId] ?? "+0Hz";
}
