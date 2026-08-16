import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ProviderSelectionSnapshotSchema,
  TeachingSettingsSchema,
  WorkflowRunCreateInputSchema,
  WorkflowRunRetryInputSchema,
  WorkflowRunSchema,
  type ProviderSelectionSnapshot,
  type TeachingSettings,
  type WorkflowRun,
  type WorkflowRunCreateInput,
  type WorkflowRunRetryInput,
} from "@ppt-digital-human/contracts";
import type { Prisma, PrismaClient, WorkflowRun as PrismaWorkflowRun } from "../generated/prisma/client.ts";
import { AppHttpError, isUniqueViolation } from "./errors.ts";
import { assertCurrentApprovedRevision } from "./lesson-plan-review.ts";
import { findDefaultProviderSelection } from "./lesson-plan-repository.ts";
import { stableHash } from "./lesson-plan-builder.ts";
import { normalizeSupportedTeachingSettings } from "./teaching-settings.ts";

const DEFAULT_AUDIENCE = "大学一年级学生";
const DEFAULT_STYLE = "严谨、逐页讲解";
const DEFAULT_TARGET_MINUTES = 6;

export const WorkflowInputSnapshotSchema = zWorkflowInputSnapshot();

export type WorkflowInputSnapshot = {
  presentationRevision: number;
  approvedRevisionIds: string[];
  audience: string;
  style: string;
  targetMinutes: number;
  settings: TeachingSettings;
  providerSelection: ProviderSelectionSnapshot | null;
};

export class WorkflowRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    principal: string,
    projectId: string,
    rawInput: WorkflowRunCreateInput,
  ): Promise<{ run: PrismaWorkflowRun; created: boolean }> {
    const input = WorkflowRunCreateInputSchema.parse(rawInput);
    const prepared = await this.prepareInput(principal, projectId, input.presentationId);
    const existing = await this.prisma.workflowRun.findFirst({
      where: { principal, idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.inputHash !== prepared.inputHash) {
        throw workflowIdempotencyConflict();
      }
      return { run: existing, created: false };
    }

    const id = `workflow_${randomUUID()}`;
    try {
      const run = await this.prisma.workflowRun.create({
        data: {
          id,
          principal,
          projectId,
          presentationId: input.presentationId,
          idempotencyKey: input.idempotencyKey,
          inputHash: prepared.inputHash,
          inputSnapshot: prepared.snapshot as unknown as Prisma.InputJsonValue,
          status: "QUEUED",
          currentStage: "AUDIO",
          progressCompleted: 0,
          progressTotal: 1,
          planTaskId: prepared.planTaskId,
        },
      });
      return { run, created: true };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const replay = await this.prisma.workflowRun.findFirst({
          where: { principal, idempotencyKey: input.idempotencyKey },
        });
        if (replay?.inputHash === prepared.inputHash) {
          return { run: replay, created: false };
        }
        if (replay) throw workflowIdempotencyConflict();
      }
      throw error;
    }
  }

  async get(principal: string, workflowId: string, projectId?: string) {
    return this.prisma.workflowRun.findFirst({
      where: {
        id: workflowId,
        principal,
        ...(projectId ? { projectId } : {}),
      },
    });
  }

  async getPublic(principal: string, workflowId: string, projectId?: string): Promise<WorkflowRun | null> {
    const run = await this.get(principal, workflowId, projectId);
    return run ? this.toPublic(run) : null;
  }

  async cancel(principal: string, workflowId: string): Promise<{
    outcome: "accepted" | "not_found" | "terminal";
    run?: PrismaWorkflowRun;
  }> {
    const run = await this.get(principal, workflowId);
    if (!run) return { outcome: "not_found" };
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(run.status)) {
      return { outcome: "terminal", run };
    }
    const accepted = await this.prisma.workflowRun.updateMany({
      where: {
        id: workflowId,
        principal,
        statusVersion: run.statusVersion,
        status: { in: ["QUEUED", "RUNNING"] },
      },
      data: {
        cancellationRequestedAt: new Date(),
        leaseExpiresAt: new Date(0),
        statusVersion: { increment: 1 },
      },
    });
    if (accepted.count !== 1) {
      const current = await this.get(principal, workflowId);
      if (!current || ["SUCCEEDED", "FAILED", "CANCELLED"].includes(current.status)) {
        return { outcome: "terminal", run: current ?? undefined };
      }
      return { outcome: "accepted", run: current };
    }
    return { outcome: "accepted", run: await this.get(principal, workflowId) ?? undefined };
  }

  async retry(
    principal: string,
    workflowId: string,
    rawInput: WorkflowRunRetryInput,
  ): Promise<{ run: PrismaWorkflowRun; created: boolean }> {
    const input = WorkflowRunRetryInputSchema.parse(rawInput);
    const run = await this.get(principal, workflowId);
    if (!run) throw new AppHttpError(404, "WORKFLOW_NOT_FOUND", "生成工作流不存在。", false);
    if (run.lastRetryIdempotencyKey === input.idempotencyKey) {
      return { run, created: false };
    }
    if (["QUEUED", "RUNNING"].includes(run.status)) {
      return { run, created: false };
    }
    if (run.status === "SUCCEEDED") {
      throw new AppHttpError(409, "WORKFLOW_NOT_RETRYABLE", "已成功的生成工作流不能重试。", false);
    }
    const updated = await this.prisma.workflowRun.updateMany({
      where: {
        id: workflowId,
        principal,
        statusVersion: run.statusVersion,
        status: { in: ["FAILED", "CANCELLED"] },
      },
      data: {
        status: "QUEUED",
        cancellationRequestedAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        errorCode: null,
        errorMessage: null,
        completedAt: null,
        lastRetryIdempotencyKey: input.idempotencyKey,
        pendingRetryIdempotencyKey: input.idempotencyKey,
        retryCount: { increment: 1 },
        statusVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      const current = await this.get(principal, workflowId);
      if (!current) throw new AppHttpError(404, "WORKFLOW_NOT_FOUND", "生成工作流不存在。", false);
      return { run: current, created: false };
    }
    return {
      run: await this.prisma.workflowRun.findUniqueOrThrow({ where: { id: workflowId } }),
      created: true,
    };
  }

  toPublic(run: PrismaWorkflowRun): WorkflowRun {
    const publicRun = {
      id: run.id,
      projectId: run.projectId,
      presentationId: run.presentationId,
      status: run.status,
      currentStage: run.currentStage,
      progressCompleted: run.progressCompleted,
      progressTotal: run.progressTotal,
      ...(run.currentSlideId ? { currentSlideId: run.currentSlideId } : {}),
      ...(run.planTaskId ? { planTaskId: run.planTaskId } : {}),
      ...(run.audioTaskId ? { audioTaskId: run.audioTaskId } : {}),
      ...(run.renderTaskId ? { renderTaskId: run.renderTaskId } : {}),
      ...(run.compositeTaskId ? { compositeTaskId: run.compositeTaskId } : {}),
      ...(run.compositeTaskId ? { finalTaskId: run.compositeTaskId } : {}),
      ...(run.errorCode ? { errorCode: run.errorCode } : {}),
      ...(run.errorMessage ? { errorMessage: run.errorMessage } : {}),
      retryCount: run.retryCount,
      ...(run.cancellationRequestedAt ? { cancellationRequestedAt: run.cancellationRequestedAt.toISOString() } : {}),
      ...(run.heartbeatAt ? { heartbeatAt: run.heartbeatAt.toISOString() } : {}),
      ...(run.leaseExpiresAt ? { leaseExpiresAt: run.leaseExpiresAt.toISOString() } : {}),
      statusVersion: run.statusVersion,
      ...(run.startedAt ? { startedAt: run.startedAt.toISOString() } : {}),
      ...(run.completedAt ? { completedAt: run.completedAt.toISOString() } : {}),
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };
    return WorkflowRunSchema.parse(publicRun);
  }

  private async prepareInput(principal: string, projectId: string, presentationId: string) {
    const presentation = await this.prisma.presentation.findFirst({
      where: { id: presentationId, projectId, project: { principal } },
      include: {
        project: true,
        slides: {
          orderBy: { slideNumber: "asc" },
          include: {
            lessonPlan: {
              include: { revisions: { orderBy: { revision: "desc" }, take: 1 } },
            },
          },
        },
      },
    });
    if (!presentation) {
      throw new AppHttpError(404, "PRESENTATION_NOT_FOUND", "演示文稿不存在。", false);
    }
    if (presentation.parseStatus !== "COMPLETED" || presentation.slides.length === 0) {
      throw new AppHttpError(409, "PRESENTATION_NOT_PARSED", "演示文稿尚未完成解析。", false);
    }
    const approvedRevisionIds = presentation.slides.map((slide) => {
      return assertCurrentApprovedRevision(slide).revision.id;
    });
    const parsedSettings = TeachingSettingsSchema.safeParse(presentation.project.settings);
    if (!parsedSettings.success) {
      throw new AppHttpError(500, "PROJECT_SETTINGS_INVALID", "项目授课配置无效。", false);
    }
    const settings = normalizeSupportedTeachingSettings(parsedSettings.data);
    const providerSelection = await findDefaultProviderSelection(this.prisma, principal);
    const snapshot: WorkflowInputSnapshot = {
      presentationRevision: presentation.revision,
      approvedRevisionIds,
      audience: DEFAULT_AUDIENCE,
      style: DEFAULT_STYLE,
      targetMinutes: DEFAULT_TARGET_MINUTES,
      settings,
      providerSelection: providerSelection ?? null,
    };
    const inputHash = stableHash({ presentationId, snapshot });
    const planTask = await this.prisma.generationTask.findFirst({
      where: {
        principal,
        projectId,
        presentationId,
        kind: "PLAN",
        status: "SUCCEEDED",
      },
      orderBy: { updatedAt: "desc" },
    });
    return { snapshot, inputHash, planTaskId: planTask?.id };
  }
}

export function parseWorkflowInputSnapshot(value: Prisma.JsonValue): WorkflowInputSnapshot {
  return WorkflowInputSnapshotSchema.parse(value);
}

export function activeWorkflowTaskId(run: Pick<PrismaWorkflowRun, "currentStage" | "planTaskId" | "audioTaskId" | "renderTaskId" | "compositeTaskId">): string | undefined {
  return ({
    PLAN: run.planTaskId,
    AUDIO: run.audioTaskId,
    PAGE_RENDER: run.renderTaskId,
    COMPOSITE: run.compositeTaskId,
    VALIDATE: run.compositeTaskId,
  }[run.currentStage] ?? undefined);
}

export function workflowRetryKey(workflowId: string, stage: string, retryCount: number): string {
  return `workflow_${workflowId}_${stage.toLowerCase()}_retry_${retryCount}`.slice(0, 128);
}

export function workflowIdempotencyConflict(): AppHttpError {
  return new AppHttpError(
    409,
    "IDEMPOTENCY_KEY_REUSED",
    "该工作流幂等键已用于不同的冻结输入。",
    false,
  );
}

function zWorkflowInputSnapshot() {
  return z.object({
    presentationRevision: z.number().int().min(1),
    approvedRevisionIds: z.array(z.string().min(1)).min(1),
    audience: z.string().min(1).max(200),
    style: z.string().min(1).max(200),
    targetMinutes: z.number().int().min(1).max(120),
    settings: TeachingSettingsSchema,
    providerSelection: ProviderSelectionSnapshotSchema.nullable(),
  }).strict();
}
