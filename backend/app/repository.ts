import { createHash, randomUUID } from "node:crypto";
import type { GenerationTask, Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { AppHttpError, isUniqueViolation } from "./errors.ts";
import type { StoredCandidate } from "./storage.ts";
import type { TeachingSettings } from "@ppt-digital-human/contracts";

const aggregateInclude = {
  project: true,
  presentation: { include: { sourceAsset: true } },
} satisfies Prisma.GenerationTaskInclude;

const projectInclude = {
  presentations: {
    orderBy: { updatedAt: "desc" as const },
    take: 1,
  },
  tasks: {
    orderBy: { updatedAt: "desc" as const },
    take: 1,
  },
} satisfies Prisma.ProjectInclude;

export type UploadAggregate = Prisma.GenerationTaskGetPayload<{
  include: typeof aggregateInclude;
}>;

export type ProjectRecord = Prisma.ProjectGetPayload<{
  include: typeof projectInclude;
}>;

export interface PersistUploadInput {
  projectId: string;
  principal: string;
  title: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  inputHash: string;
  idempotencyKey: string;
  stored: StoredCandidate;
}

export class ProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findUpload(principal: string, idempotencyKey: string): Promise<UploadAggregate | null> {
    return this.prisma.generationTask.findFirst({
      where: { principal, kind: "PARSE", idempotencyKey },
      include: aggregateInclude,
    });
  }

  async listProjects(
    principal: string,
    input: { search: string; includeArchived: boolean },
  ): Promise<ProjectRecord[]> {
    return this.prisma.project.findMany({
      where: {
        principal,
        ...(input.includeArchived ? {} : { status: { not: "ARCHIVED" } }),
        ...(input.search
          ? { title: { contains: input.search, mode: "insensitive" } }
          : {}),
      },
      include: projectInclude,
      orderBy: { updatedAt: "desc" },
    });
  }

  async getProject(principal: string, projectId: string): Promise<ProjectRecord | null> {
    return this.prisma.project.findFirst({
      where: { id: projectId, principal },
      include: projectInclude,
    });
  }

  async updateTeachingSettings(
    principal: string,
    projectId: string,
    expectedVersion: number,
    settings: TeachingSettings,
  ): Promise<ProjectRecord> {
    const updated = await this.prisma.project.updateMany({
      where: { id: projectId, principal, version: expectedVersion },
      data: { settings, version: { increment: 1 } },
    });
    if (updated.count !== 1) {
      const exists = await this.prisma.project.count({ where: { id: projectId, principal } });
      if (!exists) throw new AppHttpError(404, "PROJECT_NOT_FOUND", "项目不存在。", false);
      throw new AppHttpError(409, "STALE_PROJECT", "项目设置已有更新，请刷新后重试。", false);
    }
    const record = await this.getProject(principal, projectId);
    if (!record) throw new AppHttpError(404, "PROJECT_NOT_FOUND", "项目不存在。", false);
    return record;
  }

  async getCopySource(principal: string, projectId: string) {
    return this.prisma.project.findFirst({
      where: { id: projectId, principal, status: { not: "ARCHIVED" } },
      include: {
        presentations: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          include: { sourceAsset: true },
        },
      },
    });
  }

  async archiveProject(
    principal: string,
    projectId: string,
    expectedVersion: number,
  ): Promise<ProjectRecord> {
    await this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.findFirst({
        where: { id: projectId, principal },
      });
      if (!project) {
        throw new AppHttpError(404, "PROJECT_NOT_FOUND", "项目不存在。", false);
      }
      if (project.version !== expectedVersion) {
        throw new AppHttpError(409, "PROJECT_VERSION_CONFLICT", "项目已更新，请刷新后重试。", false);
      }
      const activeTasks = await transaction.generationTask.count({
        where: {
          projectId,
          status: { in: ["CREATED", "QUEUED", "RUNNING"] },
        },
      });
      if (activeTasks > 0) {
        throw new AppHttpError(409, "PROJECT_HAS_ACTIVE_TASKS", "项目仍有运行中的任务，暂时不能归档。", false);
      }
      const updated = await transaction.project.updateMany({
        where: { id: projectId, principal, version: expectedVersion },
        data: { status: "ARCHIVED", version: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new AppHttpError(409, "PROJECT_VERSION_CONFLICT", "项目已更新，请刷新后重试。", false);
      }
    });
    return this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: projectInclude,
    });
  }

  async deleteProject(
    principal: string,
    projectId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.findFirst({
        where: { id: projectId, principal },
      });
      if (!project) {
        throw new AppHttpError(404, "PROJECT_NOT_FOUND", "项目不存在。", false);
      }
      if (project.version !== expectedVersion) {
        throw new AppHttpError(409, "PROJECT_VERSION_CONFLICT", "项目已更新，请刷新后重试。", false);
      }
      const activeTasks = await transaction.generationTask.count({
        where: {
          projectId,
          status: { in: ["CREATED", "QUEUED", "RUNNING"] },
        },
      });
      if (activeTasks > 0) {
        throw new AppHttpError(409, "PROJECT_HAS_ACTIVE_TASKS", "项目仍有运行中的任务，暂时不能删除。", false);
      }
      const deleted = await transaction.project.deleteMany({
        where: { id: projectId, principal, version: expectedVersion },
      });
      if (deleted.count !== 1) {
        throw new AppHttpError(409, "PROJECT_VERSION_CONFLICT", "项目已更新，请刷新后重试。", false);
      }
    });
  }

  async persistUpload(input: PersistUploadInput): Promise<UploadAggregate> {
    const projectId = input.projectId;
    const assetId = `asset_${randomUUID()}`;
    const presentationId = `presentation_${randomUUID()}`;
    const taskId = `task_${randomUUID()}`;
    const outboxId = `outbox_${randomUUID()}`;

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.project.create({
          data: {
            id: projectId,
            principal: input.principal,
            title: input.title,
            status: "PARSING",
          },
        });
        await transaction.asset.create({
          data: {
            id: assetId,
            projectId,
            kind: "SOURCE_PPT",
            storageKey: input.stored.storageKey,
            sha256: input.sha256,
            mimeType: input.mimeType,
            fileSize: input.fileSize,
          },
        });
        await transaction.presentation.create({
          data: {
            id: presentationId,
            projectId,
            sourceAssetId: assetId,
            originalFileName: input.fileName,
            sha256: input.sha256,
            fileSize: input.fileSize,
            mimeType: input.mimeType,
            parseStatus: "PENDING",
            parserVersion: "python-pptx-v0.1",
          },
        });
        await transaction.generationTask.create({
          data: {
            id: taskId,
            principal: input.principal,
            projectId,
            presentationId,
            kind: "PARSE",
            idempotencyKey: input.idempotencyKey,
            inputHash: input.inputHash,
            configHash: createHash("sha256").update("stage-ta-parse-v1").digest("hex"),
            status: "QUEUED",
            stage: "PARSE",
          },
        });
        await transaction.taskOutbox.create({
          data: {
            id: outboxId,
            taskId,
            eventKey: `task.created:${taskId}`,
            eventType: "PARSE_REQUESTED",
            payload: { projectId, presentationId, taskId },
          },
        });
      });
    } catch (error) {
      await input.stored.remove();
      if (isUniqueViolation(error)) {
        const existing = await this.findUpload(input.principal, input.idempotencyKey);
        if (existing && existing.inputHash === input.inputHash) {
          return existing;
        }
        if (existing) {
          throw idempotencyConflict();
        }
      }
      throw error;
    }

    return this.prisma.generationTask.findUniqueOrThrow({
      where: { id: taskId },
      include: aggregateInclude,
    });
  }

  async getTask(principal: string, taskId: string) {
    return this.prisma.generationTask.findFirst({
      where: { id: taskId, principal },
      include: { steps: { where: { status: "RUNNING" }, orderBy: { updatedAt: "desc" }, take: 1 } },
    });
  }

  async cancelTask(
    principal: string,
    taskId: string,
  ): Promise<{ outcome: "cancelled" | "not_found" | "terminal"; task?: GenerationTask | null }> {
    return this.prisma.$transaction(async (transaction) => {
      const task = await transaction.generationTask.findFirst({ where: { id: taskId, principal } });
      if (!task) {
        return { outcome: "not_found" as const };
      }
      if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(task.status)) {
        return { outcome: "terminal" as const, task };
      }
      const accepted = await transaction.generationTask.updateMany({
        where: {
          id: task.id,
          statusVersion: task.statusVersion,
          status: { in: ["CREATED", "QUEUED", "RUNNING"] },
        },
        data: {
          status: "CANCELLED",
          cancellationRequestedAt: new Date(),
          statusVersion: { increment: 1 },
        },
      });
      if (accepted.count !== 1) {
        const terminal = await transaction.generationTask.findUniqueOrThrow({ where: { id: task.id } });
        return { outcome: "terminal" as const, task: terminal };
      }
      const steps = await transaction.generationTaskStep.findMany({
        where: { taskId: task.id, status: { in: ["QUEUED", "RUNNING"] } },
        select: { id: true },
      });
      const stepIds = steps.map((step) => step.id);
      await transaction.generationTaskStep.updateMany({
        where: { id: { in: stepIds } },
        data: { status: "CANCELLED", workerId: null, leaseExpiresAt: null },
      });
      await transaction.taskStepAttempt.updateMany({
        where: { taskStepId: { in: stepIds }, status: "RUNNING" },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
      return {
        outcome: "cancelled" as const,
        task: await transaction.generationTask.findUniqueOrThrow({ where: { id: task.id } }),
      };
    });
  }
}

export function idempotencyConflict(): AppHttpError {
  return new AppHttpError(
    409,
    "IDEMPOTENCY_KEY_REUSED",
    "该幂等键已用于不同的上传请求。",
    false,
  );
}
