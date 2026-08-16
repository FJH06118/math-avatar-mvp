import { createHash, randomUUID } from "node:crypto";
import {
  LessonPlanRevisionEditRequestSchema,
  LessonPlanRevisionSchema,
  type LessonPlanRevision,
  type LessonPlanRevisionEditRequest,
  type PlanTaskCreateRequest,
  type ProviderSelectionSnapshot,
  ProviderSelectionSnapshotSchema,
} from "@ppt-digital-human/contracts";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { AppHttpError, isUniqueViolation } from "./errors.ts";
import { stableHash, stableId } from "./lesson-plan-builder.ts";

export class LessonPlanRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createPlanTask(
    principal: string,
    projectId: string,
    input: PlanTaskCreateRequest,
    providerSelectionOverride?: ProviderSelectionSnapshot,
  ) {
    const presentation = await this.prisma.presentation.findFirst({
      where: { id: input.presentationId, projectId, project: { principal } },
      include: { slides: { orderBy: { slideNumber: "asc" } } },
    });
    if (!presentation) throw new AppHttpError(404, "PRESENTATION_NOT_FOUND", "演示文稿不存在。", false);
    if (presentation.parseStatus !== "COMPLETED" || presentation.slides.length === 0) {
      throw new AppHttpError(409, "PRESENTATION_NOT_PARSED", "演示文稿尚未完成解析。", false);
    }
    const providerSelection =
      providerSelectionOverride ??
      (await findDefaultProviderSelection(this.prisma, principal));
    const inputHash = stableHash({
      presentationId: presentation.id,
      revision: presentation.revision,
      slideIds: presentation.slides.map((slide) => slide.id),
      audience: input.audience,
      style: input.style,
      targetMinutes: input.targetMinutes,
      providerSelection,
    });
    const existing = await this.prisma.generationTask.findFirst({
      where: { principal, kind: "PLAN", idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.inputHash !== inputHash) {
        throw new AppHttpError(409, "IDEMPOTENCY_KEY_REUSED", "该幂等键已用于不同的规划请求。", false);
      }
      return { task: existing, created: false };
    }
    if (await this.prisma.lessonPlan.count({ where: { presentationId: presentation.id } })) {
      throw new AppHttpError(409, "PLAN_ALREADY_EXISTS", "演示文稿已经生成讲稿，请通过修订接口继续编辑。", false);
    }
    const taskId = `task_${randomUUID()}`;
    try {
      const task = await this.prisma.$transaction(async (transaction) => {
        const task = await transaction.generationTask.create({
          data: {
            id: taskId,
            principal,
            projectId,
            presentationId: presentation.id,
            kind: "PLAN",
            idempotencyKey: input.idempotencyKey,
            inputHash,
            configHash: createHash("sha256").update("stage-tc-agent-prompt-v1").digest("hex"),
            status: "QUEUED",
            stage: "PLAN",
            progressTotal: presentation.slides.length,
            presentationRevision: presentation.revision,
          },
        });
        await transaction.taskOutbox.create({
          data: {
            id: `outbox_${randomUUID()}`,
            taskId,
            eventKey: `plan.requested:${taskId}`,
            eventType: "PLAN_REQUESTED",
            payload: {
              audience: input.audience,
              style: input.style,
              targetMinutes: input.targetMinutes,
              ...(providerSelection ? { providerSelection } : {}),
            },
          },
        });
        return task;
      });
      return { task, created: true };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const replay = await this.prisma.generationTask.findFirst({
          where: { principal, kind: "PLAN", idempotencyKey: input.idempotencyKey },
        });
        if (replay?.inputHash === inputHash) return { task: replay, created: false };
      }
      throw error;
    }
  }

  async listCurrentRevisions(principal: string, projectId: string): Promise<LessonPlanRevision[]> {
    const plans = await this.prisma.lessonPlan.findMany({
      where: { projectId, project: { principal } },
      include: { revisions: { orderBy: { revision: "desc" }, take: 1 } },
      orderBy: { slide: { slideNumber: "asc" } },
    });
    return plans.flatMap((plan) => plan.revisions.map((revision) => parsePayload(revision.payload)));
  }

  async revise(
    principal: string,
    revisionId: string,
    rawInput: unknown,
  ): Promise<LessonPlanRevision> {
    const input = LessonPlanRevisionEditRequestSchema.parse(rawInput);
    return this.prisma.$transaction(async (transaction) => {
      const current = await findRevisionForUpdate(transaction, principal, revisionId);
      if (current.lessonPlan.isLocked) {
        throw new AppHttpError(409, "REVISION_LOCKED", "该页已锁定，解锁后才能修改。", false);
      }
      if (current.lessonPlan.currentRevision !== input.expectedRevision || current.revision !== input.expectedRevision) {
        throw staleRevision();
      }
      const old = parsePayload(current.payload);
      const nextNumber = current.revision + 1;
      const nextId = `revision_${randomUUID()}`;
      const { expectedRevision: _expectedRevision, ...editable } = input;
      const payload = LessonPlanRevisionSchema.parse({
        ...old,
        ...editable,
        id: nextId,
        revision: nextNumber,
        sourceSlideCoverage: [old.slideId],
        modelProvider: "user",
        modelName: "manual-edit",
        promptVersion: old.promptVersion,
        inputHash: old.outputHash,
        outputHash: stableHash(editable),
        createdBy: "user",
        createdAt: new Date().toISOString(),
        approval: { status: "pending" },
      });
      await persistRevision(transaction, payload);
      await transaction.lessonPlan.update({ where: { id: current.lessonPlanId }, data: { currentRevision: nextNumber } });
      return payload;
    });
  }

  async approve(principal: string, revisionId: string, expectedRevision: number): Promise<LessonPlanRevision> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await findRevisionForUpdate(transaction, principal, revisionId);
      if (current.lessonPlan.currentRevision !== expectedRevision || current.revision !== expectedRevision) {
        throw staleRevision();
      }
      if (current.approvalStatus === "approved") return parsePayload(current.payload);
      const approvedAt = new Date();
      const payload = LessonPlanRevisionSchema.parse({
        ...parsePayload(current.payload),
        approval: { status: "approved", approvedBy: principal, approvedAt: approvedAt.toISOString() },
      });
      await transaction.lessonPlanRevision.update({
        where: { id: current.id },
        data: {
          payload: payload as unknown as Prisma.InputJsonValue,
          approvalStatus: "approved",
          approvedBy: principal,
          approvedAt,
        },
      });
      return payload;
    });
  }
}

export async function findDefaultProviderSelection(prisma: PrismaClient, principal: string) {
  const provider = await prisma.providerProfile.findFirst({
    where: { principal, isDefault: true },
  });
  if (!provider) return undefined;
  return ProviderSelectionSnapshotSchema.parse({
    profileId: provider.id,
    kind: provider.kind,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    model: provider.model,
    profileVersion: provider.version,
    keyVersion: provider.keyVersion,
    promptVersion: "stage-tc-agent-prompt-v1",
  });
}

export async function persistRevision(transaction: Prisma.TransactionClient, payload: LessonPlanRevision) {
  await transaction.lessonPlanRevision.create({
    data: {
      id: payload.id,
      lessonPlanId: payload.lessonPlanId,
      slideId: payload.slideId,
      revision: payload.revision,
      payload: payload as unknown as Prisma.InputJsonValue,
      inputHash: payload.inputHash,
      outputHash: payload.outputHash,
      modelProvider: payload.modelProvider,
      modelName: payload.modelName,
      promptVersion: payload.promptVersion,
      schemaVersion: payload.schemaVersion,
      createdBy: payload.createdBy,
      approvalStatus: payload.approval.status,
      approvedBy: payload.approval.status === "approved" ? payload.approval.approvedBy : null,
      approvedAt: payload.approval.status === "approved" ? new Date(payload.approval.approvedAt) : null,
    },
  });
  await transaction.plannedScene.createMany({
    data: payload.scenes.map((scene, sceneOrder) => ({
      id: stableId("planned_scene", `${payload.id}:${sceneOrder}`),
      revisionId: payload.id,
      slideId: payload.slideId,
      sceneOrder,
      payload: scene as unknown as Prisma.InputJsonValue,
    })),
  });
}

function parsePayload(value: Prisma.JsonValue): LessonPlanRevision {
  return LessonPlanRevisionSchema.parse(value as unknown);
}

async function findRevisionForUpdate(transaction: Prisma.TransactionClient, principal: string, revisionId: string) {
  const revision = await transaction.lessonPlanRevision.findFirst({
    where: { id: revisionId, lessonPlan: { project: { principal } } },
    include: { lessonPlan: true },
  });
  if (!revision) throw new AppHttpError(404, "REVISION_NOT_FOUND", "讲稿修订不存在。", false);
  return revision;
}

function staleRevision(): AppHttpError {
  return new AppHttpError(409, "STALE_REVISION", "讲稿已有更新，请刷新后重试。", false);
}
