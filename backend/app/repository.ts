import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { AppHttpError, isUniqueViolation } from "./errors.ts";
import type { StoredCandidate } from "./storage.ts";

const aggregateInclude = {
  project: true,
  presentation: { include: { sourceAsset: true } },
} satisfies Prisma.GenerationTaskInclude;

export type UploadAggregate = Prisma.GenerationTaskGetPayload<{
  include: typeof aggregateInclude;
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
    return this.prisma.generationTask.findFirst({ where: { id: taskId, principal } });
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
