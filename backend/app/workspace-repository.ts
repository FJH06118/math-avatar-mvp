import {
  FormulaSchema,
  LessonPlanRevisionSchema,
  WorkspaceSnapshotSchema,
  type WorkspaceLockInput,
} from "@ppt-digital-human/contracts";
import type { PrismaClient } from "../generated/prisma/client.ts";

import { AppHttpError } from "./errors.ts";
import { reviewFlagsForSlide } from "./lesson-plan-review.ts";

export class WorkspaceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSnapshot(principal: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, principal },
      include: {
        presentations: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            slides: {
              orderBy: { slideNumber: "asc" },
              include: {
                lessonPlan: {
                  include: {
                    revisions: { orderBy: { revision: "desc" }, take: 1 },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!project) {
      throw new AppHttpError(404, "PROJECT_NOT_FOUND", "项目不存在。", false);
    }
    const slides = project.presentations[0]?.slides ?? [];
    if (slides.some((slide) => !slide.renderAssetId)) {
      throw new AppHttpError(409, "ORIGINAL_PAGE_NOT_FOUND", "工作台缺少原页资产。", false);
    }
    return WorkspaceSnapshotSchema.parse({
      slides: slides.map((slide) => {
        const formulas = Array.isArray(slide.formulaJson)
          ? slide.formulaJson.flatMap((value) => {
              const parsed = FormulaSchema.safeParse(value);
              return parsed.success ? [parsed.data] : [];
            })
          : [];
        const parseWarnings = Array.isArray(slide.parseWarnings)
          ? slide.parseWarnings.filter((value): value is string => typeof value === "string")
          : [];
        const currentRevision = slide.lessonPlan?.revisions[0]
          ? LessonPlanRevisionSchema.parse(slide.lessonPlan.revisions[0].payload)
          : undefined;
        return {
          parsed: {
          id: slide.id,
          projectId: slide.projectId,
          presentationId: slide.presentationId,
          slideNumber: slide.slideNumber,
          title: slide.title,
          slideType: slide.slideType,
          extractedText: slide.extractedText,
          formulaCount: Array.isArray(slide.formulaJson) ? slide.formulaJson.length : 0,
          formulas,
          parseConfidence: slide.parseConfidence,
          parseWarnings,
          reviewFlags: reviewFlagsForSlide(slide, currentRevision),
          originalPage: {
            assetId: slide.renderAssetId!,
            url: `/api/t/assets/${slide.renderAssetId}/preview`,
          },
          },
          currentRevision,
          isLocked: slide.lessonPlan?.isLocked ?? false,
        };
      }),
    });
  }

  async setLocked(
    principal: string,
    revisionId: string,
    input: WorkspaceLockInput,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const revision = await transaction.lessonPlanRevision.findFirst({
        where: { id: revisionId, lessonPlan: { project: { principal } } },
        include: { lessonPlan: true },
      });
      if (!revision) {
        throw new AppHttpError(404, "REVISION_NOT_FOUND", "讲稿修订不存在。", false);
      }
      if (
        revision.revision !== input.expectedRevision ||
        revision.lessonPlan.currentRevision !== input.expectedRevision
      ) {
        throw new AppHttpError(409, "STALE_REVISION", "讲稿已有更新，请刷新后重试。", false);
      }
      await transaction.lessonPlan.update({
        where: { id: revision.lessonPlanId },
        data: { isLocked: input.locked },
      });
      return { revisionId, revision: revision.revision, locked: input.locked };
    });
  }
}
