import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  ApiErrorSchema,
  TracerTaskResponseSchema,
  TracerUploadMetadataSchema,
  TracerUploadResponseSchema,
  LessonPlanApprovalRequestSchema,
  LessonPlanRevisionEditRequestSchema,
  LessonPlanRevisionListResponseSchema,
  LessonPlanRevisionResponseSchema,
  PlanTaskCreateRequestSchema,
  PlanTaskResponseSchema,
  AudioTaskCreateRequestSchema,
  AudioTaskResponseSchema,
  AudioTimelineResponseSchema,
  RenderTaskCreateRequestSchema,
  RenderTaskResponseSchema,
  RenderedPageListResponseSchema,
  CompositeTaskCreateRequestSchema,
  CompositeTaskResponseSchema,
  FinalMediaResponseSchema,
  DeliveryManifestResponseSchema,
} from "@ppt-digital-human/contracts";
import { Hono } from "hono";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { AppHttpError } from "./errors.ts";
import { validatePptxStructure } from "./pptx.ts";
import { projectTask, projectUploadAggregate } from "./projections.ts";
import { idempotencyConflict, ProductRepository } from "./repository.ts";
import { LocalAssetStore } from "./storage.ts";
import { LessonPlanRepository } from "./lesson-plan-repository.ts";
import { AudioRepository } from "./audio-repository.ts";
import { RenderRepository } from "./render-repository.ts";
import { MediaRepository } from "./media-repository.ts";
import { DeliveryRepository } from "./delivery-repository.ts";

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
  const lessonPlans = new LessonPlanRepository(dependencies.prisma);
  const audio = new AudioRepository(dependencies.prisma);
  const renders = new RenderRepository(dependencies.prisma);
  const media = new MediaRepository(dependencies.prisma);
  const delivery = new DeliveryRepository(dependencies.prisma);
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

  app.post("/v1/tasks/:taskId/cancel", async (context) => {
    const requestId = `request_${randomUUID()}`;
    const principal = authenticate(
      context.req.header("x-internal-token"),
      context.req.header("x-principal"),
      dependencies.internalToken,
    );
    const result = await repository.cancelTask(principal, context.req.param("taskId"));
    if (result.outcome === "not_found") {
      throw new AppHttpError(404, "TASK_NOT_FOUND", "任务不存在。", false);
    }
    if (result.outcome === "terminal") {
      throw new AppHttpError(409, "TASK_ALREADY_TERMINAL", "任务已经进入终态。", false);
    }
    return context.json(
      TracerTaskResponseSchema.parse({ data: projectTask(result.task!), meta: apiMeta(requestId) }),
    );
  });

  app.post("/v1/projects/:projectId/plans", async (context) => {
    const requestId = `request_${randomUUID()}`;
    const principal = authenticate(context.req.header("x-internal-token"), context.req.header("x-principal"), dependencies.internalToken);
    const parsed = PlanTaskCreateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) throw invalidBody(parsed.error.issues.map((issue) => issue.path.join(".")));
    const result = await lessonPlans.createPlanTask(principal, context.req.param("projectId"), parsed.data);
    return context.json(
      PlanTaskResponseSchema.parse({ data: projectTask(result.task), meta: apiMeta(requestId) }),
      result.created ? 201 : 200,
    );
  });

  app.get("/v1/projects/:projectId/lesson-plans", async (context) => {
    const requestId = `request_${randomUUID()}`;
    const principal = authenticate(context.req.header("x-internal-token"), context.req.header("x-principal"), dependencies.internalToken);
    const revisions = await lessonPlans.listCurrentRevisions(principal, context.req.param("projectId"));
    return context.json(LessonPlanRevisionListResponseSchema.parse({ data: revisions, meta: apiMeta(requestId) }));
  });

  app.post("/v1/revisions/:revisionId/revise", async (context) => {
    const requestId = `request_${randomUUID()}`;
    const principal = authenticate(context.req.header("x-internal-token"), context.req.header("x-principal"), dependencies.internalToken);
    const parsed = LessonPlanRevisionEditRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) throw invalidBody(parsed.error.issues.map((issue) => issue.path.join(".")));
    const revision = await lessonPlans.revise(principal, context.req.param("revisionId"), parsed.data);
    return context.json(LessonPlanRevisionResponseSchema.parse({ data: revision, meta: apiMeta(requestId) }), 201);
  });

  app.post("/v1/revisions/:revisionId/approve", async (context) => {
    const requestId = `request_${randomUUID()}`;
    const principal = authenticate(context.req.header("x-internal-token"), context.req.header("x-principal"), dependencies.internalToken);
    const parsed = LessonPlanApprovalRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) throw invalidBody(parsed.error.issues.map((issue) => issue.path.join(".")));
    const revision = await lessonPlans.approve(principal, context.req.param("revisionId"), parsed.data.expectedRevision);
    return context.json(LessonPlanRevisionResponseSchema.parse({ data: revision, meta: apiMeta(requestId) }));
  });

  app.post("/v1/projects/:projectId/audio", async (context) => {
    const requestId = `request_${randomUUID()}`;
    const principal = authenticate(context.req.header("x-internal-token"), context.req.header("x-principal"), dependencies.internalToken);
    const parsed = AudioTaskCreateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) throw invalidBody(parsed.error.issues.map((issue) => issue.path.join(".")));
    const result = await audio.createTask(principal, context.req.param("projectId"), parsed.data);
    return context.json(
      AudioTaskResponseSchema.parse({ data: projectTask(result.task), meta: apiMeta(requestId) }),
      result.created ? 201 : 200,
    );
  });

  app.get("/v1/tasks/:taskId/audio", async (context) => {
    const requestId = `request_${randomUUID()}`;
    const principal = authenticate(context.req.header("x-internal-token"), context.req.header("x-principal"), dependencies.internalToken);
    const timeline = await audio.getTimeline(principal, context.req.param("taskId"));
    return context.json(AudioTimelineResponseSchema.parse({ data: timeline, meta: apiMeta(requestId) }));
  });

  app.post("/v1/projects/:projectId/renders", async (context) => {
    const requestId = `request_${randomUUID()}`;
    const principal = authenticate(context.req.header("x-internal-token"), context.req.header("x-principal"), dependencies.internalToken);
    const parsed = RenderTaskCreateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) throw invalidBody(parsed.error.issues.map((issue) => issue.path.join(".")));
    const result = await renders.createTask(principal, context.req.param("projectId"), parsed.data);
    return context.json(RenderTaskResponseSchema.parse({ data: projectTask(result.task), meta: apiMeta(requestId) }), result.created ? 201 : 200);
  });

  app.get("/v1/tasks/:taskId/pages", async (context) => {
    const requestId = `request_${randomUUID()}`;
    const principal = authenticate(context.req.header("x-internal-token"), context.req.header("x-principal"), dependencies.internalToken);
    const pages = await renders.listPages(principal, context.req.param("taskId"));
    return context.json(RenderedPageListResponseSchema.parse({ data: pages, meta: apiMeta(requestId) }));
  });

  app.post("/v1/projects/:projectId/composites", async (context) => {
    const requestId = `request_${randomUUID()}`;
    const principal = authenticate(context.req.header("x-internal-token"), context.req.header("x-principal"), dependencies.internalToken);
    const parsed = CompositeTaskCreateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) throw invalidBody(parsed.error.issues.map((issue) => issue.path.join(".")));
    const result = await media.createTask(principal, context.req.param("projectId"), parsed.data);
    return context.json(CompositeTaskResponseSchema.parse({ data: projectTask(result.task), meta: apiMeta(requestId) }), result.created ? 201 : 200);
  });

  app.get("/v1/tasks/:taskId/media", async (context) => {
    const requestId = `request_${randomUUID()}`;
    const principal = authenticate(context.req.header("x-internal-token"), context.req.header("x-principal"), dependencies.internalToken);
    const output = await media.getFinalMedia(principal, context.req.param("taskId"));
    return context.json(FinalMediaResponseSchema.parse({ data: output, meta: apiMeta(requestId) }));
  });

  app.get("/v1/tasks/:taskId/delivery", async (context) => {
    const requestId = `request_${randomUUID()}`;
    const principal = authenticate(context.req.header("x-internal-token"), context.req.header("x-principal"), dependencies.internalToken);
    const bundle = await delivery.getBundle(principal, context.req.param("taskId"));
    return context.json(DeliveryManifestResponseSchema.parse({ data: bundle.manifest, meta: apiMeta(requestId) }));
  });

  app.get("/v1/tasks/:taskId/delivery/metadata", async (context) => {
    const principal = authenticate(context.req.header("x-internal-token"), context.req.header("x-principal"), dependencies.internalToken);
    const bundle = await delivery.getBundle(principal, context.req.param("taskId"));
    return binaryResponse(bundle.metadataBytes, bundle.metadataSha, "application/json; charset=utf-8", `metadata-${context.req.param("taskId")}.json`, context.req.header("range"), context.req.header("if-none-match"));
  });

  app.get("/v1/assets/:assetId/content", async (context) => {
    const principal = authenticate(context.req.header("x-internal-token"), context.req.header("x-principal"), dependencies.internalToken);
    const asset = await delivery.getDeliverableAsset(principal, context.req.param("assetId"));
    const bytes = await readFile(assetStore.resolveForRead(asset.storageKey));
    const actualSha = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== asset.fileSize || actualSha !== asset.sha256) throw new AppHttpError(409, "ASSET_INTEGRITY_FAILED", "交付资产完整性检查失败。", false);
    const extension = asset.mimeType.startsWith("video/") ? "mp4" : "srt";
    return binaryResponse(bytes, asset.sha256, asset.mimeType, `asset-${asset.id}.${extension}`, context.req.header("range"), context.req.header("if-none-match"));
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

function invalidBody(fields: string[]): AppHttpError {
  return new AppHttpError(400, "INVALID_REQUEST", "请求不符合阶段 T-C 契约。", false, { fields });
}

function binaryResponse(bytes: Uint8Array, sha256: string, mimeType: string, fileName: string, rangeHeader?: string, ifNoneMatch?: string): Response {
  const etag = `"${sha256}"`;
  const common = { "accept-ranges": "bytes", "cache-control": "private, no-store", "content-disposition": `attachment; filename="${fileName}"`, "content-type": mimeType, etag };
  if (!rangeHeader && ifNoneMatch === etag) return new Response(null, { status: 304, headers: common });
  if (!rangeHeader) return new Response(toArrayBuffer(bytes), { status: 200, headers: { ...common, "content-length": String(bytes.byteLength) } });
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { ...common, "content-range": `bytes */${bytes.byteLength}` } });
  const suffix = !match[1];
  const start = suffix ? Math.max(0, bytes.byteLength - Number(match[2])) : Number(match[1]);
  const end = suffix || !match[2] ? bytes.byteLength - 1 : Math.min(Number(match[2]), bytes.byteLength - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= bytes.byteLength) return new Response(null, { status: 416, headers: { ...common, "content-range": `bytes */${bytes.byteLength}` } });
  const part = bytes.slice(start, end + 1);
  return new Response(toArrayBuffer(part), { status: 206, headers: { ...common, "content-length": String(part.byteLength), "content-range": `bytes ${start}-${end}/${bytes.byteLength}` } });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer { const copy = new Uint8Array(bytes.byteLength); copy.set(bytes); return copy.buffer; }
