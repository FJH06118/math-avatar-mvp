import { FormulaSchema, ParseSnapshotSchema } from "@ppt-digital-human/contracts";
import type { PrismaClient } from "../generated/prisma/client.ts";

import { AppHttpError } from "./errors.ts";
import { projectTask } from "./projections.ts";

export class ParseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSnapshot(principal: string, taskId: string) {
    const task = await this.prisma.generationTask.findFirst({
      where: { id: taskId, principal, kind: "PARSE" },
    });
    if (!task) {
      throw new AppHttpError(404, "PARSE_TASK_NOT_FOUND", "解析任务不存在。", false);
    }
    const slides = await this.prisma.slide.findMany({
      where: { presentationId: task.presentationId, projectId: task.projectId },
      orderBy: { slideNumber: "asc" },
    });
    if (slides.some((slide) => !slide.renderAssetId)) {
      throw new AppHttpError(
        409,
        "ORIGINAL_PAGE_NOT_FOUND",
        "解析结果缺少原页资产。",
        false,
      );
    }
    return ParseSnapshotSchema.parse({
      task: projectTask(task),
      slides: slides.map((slide) => ({
        id: slide.id,
        projectId: slide.projectId,
        presentationId: slide.presentationId,
        slideNumber: slide.slideNumber,
        title: slide.title,
        slideType: slide.slideType,
        extractedText: slide.extractedText,
        formulaCount: Array.isArray(slide.formulaJson) ? slide.formulaJson.length : 0,
        formulas: Array.isArray(slide.formulaJson)
          ? slide.formulaJson.flatMap((value) => {
              const parsed = FormulaSchema.safeParse(value);
              return parsed.success ? [parsed.data] : [];
            })
          : [],
        parseConfidence: slide.parseConfidence,
        parseWarnings: Array.isArray(slide.parseWarnings)
          ? slide.parseWarnings.filter((value): value is string => typeof value === "string")
          : [],
        originalPage: {
          assetId: slide.renderAssetId!,
          url: `/api/t/assets/${slide.renderAssetId}/preview`,
        },
      })),
    });
  }

  async getOriginalPage(principal: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        kind: "SLIDE_RENDER",
        lifecycle: "AVAILABLE",
        project: { principal },
        renderedSlides: { some: {} },
      },
    });
    if (!asset) {
      throw new AppHttpError(404, "ORIGINAL_PAGE_NOT_FOUND", "原页资产不存在。", false);
    }
    return asset;
  }
}
