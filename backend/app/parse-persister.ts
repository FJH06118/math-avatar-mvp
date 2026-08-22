import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import sharp from "sharp";
import type { ParseAdapterResult } from "./parse-adapter.ts";
import type { ProductClaim } from "./product-lease.ts";
import { LocalAssetStore } from "./storage.ts";
import { WorkerError } from "./worker-error.ts";

interface PageCandidate {
  slideNumber: number;
  bytes: Buffer;
  sha256: string;
  width: number;
  height: number;
}

export class ParseResultPersister {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly assets: LocalAssetStore,
  ) {}

  async persist(
    claim: ProductClaim,
    workerId: string,
    result: ParseAdapterResult,
  ): Promise<void> {
    const task = await this.prisma.generationTask.findUniqueOrThrow({
      where: { id: claim.taskId },
      include: { presentation: true },
    });
    const pages = await validatePages(result);
    await this.prisma.$transaction(async (transaction) => {
      const owned = await transaction.generationTaskStep.updateMany({
        where: {
          id: claim.taskStepId,
          workerId,
          currentAttempt: claim.attempt,
          status: "RUNNING",
        },
        data: { progressTotal: pages.length },
      });
      if (owned.count !== 1) {
        throw new WorkerError("LEASE_LOST", "Worker 已失去解析步骤租约。", true);
      }
      await transaction.generationTask.update({
        where: { id: task.id },
        data: { progressCompleted: 0, progressTotal: pages.length },
      });
    });

    for (const [index, page] of pages.entries()) {
      const source = result.deck.slides[index];
      const storageKey = await this.assets.putSlideRender(
        task.projectId,
        page.sha256,
        page.bytes,
      );
      const assetId = stableId("asset", `${task.projectId}:SLIDE_RENDER:${page.sha256}`);
      const slideId = stableId("slide", `${task.presentationId}:${page.slideNumber}`);
      await this.prisma.$transaction(async (transaction) => {
        const owned = await transaction.generationTaskStep.updateMany({
          where: {
            id: claim.taskStepId,
            workerId,
            currentAttempt: claim.attempt,
            status: "RUNNING",
          },
          data: { progressCompleted: index + 1 },
        });
        if (owned.count !== 1) {
          throw new WorkerError("LEASE_LOST", "Worker 已失去解析步骤租约。", true);
        }
        const asset = await transaction.asset.upsert({
          where: {
            projectId_kind_sha256: {
              projectId: task.projectId,
              kind: "SLIDE_RENDER",
              sha256: page.sha256,
            },
          },
          update: {},
          create: {
            id: assetId,
            projectId: task.projectId,
            taskId: task.id,
            kind: "SLIDE_RENDER",
            storageKey,
            sha256: page.sha256,
            mimeType: "image/png",
            fileSize: page.bytes.byteLength,
          },
        });
        await transaction.slide.upsert({
          where: {
            presentationId_slideNumber: {
              presentationId: task.presentationId,
              slideNumber: page.slideNumber,
            },
          },
          update: {
            title: source.title,
            slideType: source.type,
            extractedText: source.extractedText,
            notes: source.notes,
            formulaJson: source.formulas as Prisma.InputJsonValue,
            parseWarnings: source.warnings as Prisma.InputJsonValue,
            renderAssetId: asset.id,
          },
          create: {
            id: slideId,
            projectId: task.projectId,
            presentationId: task.presentationId,
            slideNumber: page.slideNumber,
            title: source.title,
            slideType: source.type,
            extractedText: source.extractedText,
            notes: source.notes,
            formulaJson: source.formulas as Prisma.InputJsonValue,
            renderAssetId: asset.id,
            parseWarnings: source.warnings as Prisma.InputJsonValue,
          },
        });
        await transaction.generationTask.update({
          where: { id: task.id },
          data: { progressCompleted: index + 1 },
        });
      });
    }

    const first = pages[0];
    await this.prisma.$transaction(async (transaction) => {
      const completed = await transaction.generationTaskStep.updateMany({
        where: {
          id: claim.taskStepId,
          workerId,
          currentAttempt: claim.attempt,
          status: "RUNNING",
        },
        data: {
          status: "SUCCEEDED",
          workerId: null,
          leaseExpiresAt: null,
          completedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
      if (completed.count !== 1) {
        throw new WorkerError("LEASE_LOST", "Worker 已失去解析步骤租约。", true);
      }
      await transaction.taskStepAttempt.update({
        where: {
          taskStepId_attempt: { taskStepId: claim.taskStepId, attempt: claim.attempt },
        },
        data: { status: "SUCCEEDED", completedAt: new Date() },
      });
      await transaction.presentation.update({
        where: { id: task.presentationId },
        data: {
          slideCount: pages.length,
          width: first.width,
          height: first.height,
          aspectRatio: first.width / first.height,
          animationManifestJson: result.deck.animationManifest as Prisma.InputJsonValue,
          parseStatus: "COMPLETED",
        },
      });
      await transaction.project.update({
        where: { id: task.projectId },
        data: { status: "READY" },
      });
      await transaction.generationTask.update({
        where: { id: task.id },
        data: {
          status: "SUCCEEDED",
          progressCompleted: pages.length,
          progressTotal: pages.length,
          completedAt: new Date(),
          heartbeatAt: new Date(),
          statusVersion: { increment: 1 },
          errorCode: null,
          errorMessage: null,
        },
      });
    });
  }
}

async function validatePages(result: ParseAdapterResult): Promise<PageCandidate[]> {
  const entries = await readdir(join(result.attemptDir, "slides"));
  const pngEntries = entries.filter((entry) => entry.toLowerCase().endsWith(".png"));
  if (pngEntries.length !== result.deck.slideCount) {
    throw new WorkerError(
      "ORIGINAL_PAGE_COUNT_MISMATCH",
      "原页 PNG 数量与课件页数不一致。",
      false,
    );
  }
  const pages: PageCandidate[] = [];
  for (const slide of result.deck.slides) {
    const bytes = await readFile(join(result.attemptDir, slide.thumbnail));
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== "png" || metadata.width !== 1920 || metadata.height !== 1080) {
      throw new WorkerError(
        "ORIGINAL_PAGE_INVALID",
        `第 ${slide.index} 页原图不是 1920×1080 PNG。`,
        false,
      );
    }
    pages.push({
      slideNumber: slide.index,
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      width: metadata.width,
      height: metadata.height,
    });
  }
  return pages;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex")}`;
}
