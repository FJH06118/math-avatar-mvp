import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  ApiErrorSchema,
  TracerTaskResponseSchema,
  TracerUploadMetadataSchema,
  TracerUploadResponseSchema,
} from "@ppt-digital-human/contracts";
import { Hono } from "hono";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { AppHttpError } from "./errors.ts";
import { validatePptxStructure } from "./pptx.ts";
import { projectTask, projectUploadAggregate } from "./projections.ts";
import { idempotencyConflict, ProductRepository } from "./repository.ts";
import { LocalAssetStore } from "./storage.ts";

export interface AppDependencies {
  prisma: PrismaClient;
  assetRoot: string;
  internalToken: string;
}

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const API_VERSION = "v1";

export function createApplication(dependencies: AppDependencies): Hono {
  const app = new Hono();
  const repository = new ProductRepository(dependencies.prisma);
  const assetStore = new LocalAssetStore(dependencies.assetRoot);

  app.get("/health", (context) => context.json({ status: "ok" }));

  app.post("/v1/projects", async (context) => {
    const requestId = `request_${randomUUID()}`;
    const principal = authenticate(
      context.req.header("x-internal-token"),
      context.req.header("x-principal"),
      dependencies.internalToken,
    );
    const declaredLength = Number(context.req.header("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES + 1024 * 1024) {
      throw new AppHttpError(413, "FILE_TOO_LARGE", "文件不能超过 100 MB。", false);
    }

    const form = await context.req.formData();
    const title = form.get("title");
    const file = form.get("file");
    const idempotencyKey = context.req.header("idempotency-key") ?? "";
    if (typeof title !== "string" || !(file instanceof File)) {
      throw new AppHttpError(400, "INVALID_REQUEST", "请求必须包含标题和 PPTX 文件。", false);
    }
    const metadata = TracerUploadMetadataSchema.safeParse({
      title,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      idempotencyKey,
    });
    if (!metadata.success) {
      throw new AppHttpError(400, "INVALID_REQUEST", "上传元数据不符合阶段 T 契约。", false, {
        fields: metadata.error.issues.map((issue) => issue.path.join(".")),
      });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength !== metadata.data.fileSize) {
      throw new AppHttpError(400, "FILE_SIZE_MISMATCH", "文件大小与上传元数据不一致。", false);
    }
    validatePptxStructure(bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const inputHash = createHash("sha256")
      .update(
        JSON.stringify({
          fileName: metadata.data.fileName,
          fileSize: metadata.data.fileSize,
          mimeType: metadata.data.mimeType,
          sha256,
          title: metadata.data.title,
        }),
      )
      .digest("hex");

    const existing = await repository.findUpload(principal, metadata.data.idempotencyKey);
    if (existing) {
      if (existing.inputHash !== inputHash) {
        throw idempotencyConflict();
      }
      return context.json(
        TracerUploadResponseSchema.parse({
          data: { ...projectUploadAggregate(existing), created: false },
          meta: apiMeta(requestId),
        }),
      );
    }

    const projectId = `project_${randomUUID()}`;
    const stored = await assetStore.putSource(projectId, sha256, bytes);
    const aggregate = await repository.persistUpload({
      projectId,
      principal,
      title: metadata.data.title,
      fileName: metadata.data.fileName,
      mimeType: metadata.data.mimeType,
      fileSize: metadata.data.fileSize,
      sha256,
      inputHash,
      idempotencyKey: metadata.data.idempotencyKey,
      stored,
    });
    const created = aggregate.project.id === projectId;
    return context.json(
      TracerUploadResponseSchema.parse({
        data: { ...projectUploadAggregate(aggregate), created },
        meta: apiMeta(requestId),
      }),
      created ? 201 : 200,
    );
  });

  app.get("/v1/tasks/:taskId", async (context) => {
    const requestId = `request_${randomUUID()}`;
    const principal = authenticate(
      context.req.header("x-internal-token"),
      context.req.header("x-principal"),
      dependencies.internalToken,
    );
    const task = await repository.getTask(principal, context.req.param("taskId"));
    if (!task) {
      throw new AppHttpError(404, "TASK_NOT_FOUND", "任务不存在。", false);
    }
    return context.json(
      TracerTaskResponseSchema.parse({ data: projectTask(task), meta: apiMeta(requestId) }),
    );
  });

  app.onError((error, context) => {
    const requestId = `request_${randomUUID()}`;
    const publicError =
      error instanceof AppHttpError
        ? error
        : new AppHttpError(500, "INTERNAL_ERROR", "服务暂时不可用。", true);
    const body = ApiErrorSchema.parse({
      error: {
        code: publicError.code,
        message: publicError.message,
        retryable: publicError.retryable,
        details: publicError.details,
      },
      meta: apiMeta(requestId),
    });
    return context.json(body, publicError.status);
  });

  return app;
}

function authenticate(token: string | undefined, principal: string | undefined, expected: string): string {
  if (!token || !principal || !safeEqual(token, expected)) {
    throw new AppHttpError(401, "UNAUTHORIZED", "私有服务鉴别失败。", false);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(principal)) {
    throw new AppHttpError(400, "INVALID_PRINCIPAL", "principal 不符合内部契约。", false);
  }
  return principal;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function apiMeta(requestId: string) {
  return { requestId, inputVersion: API_VERSION, outputVersion: API_VERSION };
}
