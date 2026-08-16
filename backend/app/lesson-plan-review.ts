import {
  deriveDerivationReviewFlags,
  deriveParseReviewFlags,
  FormulaSchema,
  LessonPlanRevisionSchema,
  mergeReviewFlags,
  type LessonPlanRevision,
  type ReviewFlag,
} from "@ppt-digital-human/contracts";

import { AppHttpError } from "./errors.ts";

export interface ReviewableSlide {
  id: string;
  parseConfidence: number;
  parseWarnings: unknown;
  formulaJson: unknown;
  lessonPlan?: {
    currentRevision: number;
    revisions: ReadonlyArray<{
      revision: number;
      approvalStatus: string;
      payload: unknown;
    }>;
  } | null;
}

export function reviewFlagsForSlide(
  slide: Pick<ReviewableSlide, "parseConfidence" | "parseWarnings" | "formulaJson">,
  revision?: Pick<LessonPlanRevision, "derivation">,
): ReviewFlag[] {
  const parseWarnings = Array.isArray(slide.parseWarnings)
    ? slide.parseWarnings.filter((value): value is string => typeof value === "string")
    : [];
  const formulas = Array.isArray(slide.formulaJson)
    ? slide.formulaJson.flatMap((value) => {
        const parsed = FormulaSchema.safeParse(value);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  const formulaNeedsReview = Array.isArray(slide.formulaJson) && slide.formulaJson.some((value) => {
    const parsed = FormulaSchema.safeParse(value);
    return !parsed.success || parsed.data.status !== "valid";
  });
  return mergeReviewFlags(
    deriveParseReviewFlags({
      parseConfidence: slide.parseConfidence,
      parseWarnings,
      formulas,
    }),
    formulaNeedsReview ? ["FORMULA_REVIEW"] : [],
    revision ? deriveDerivationReviewFlags(revision.derivation) : [],
  );
}

export function assertCurrentApprovedRevision(
  slide: ReviewableSlide,
): { revision: LessonPlanRevision; reviewFlags: ReviewFlag[] } {
  const record = slide.lessonPlan?.revisions[0];
  if (
    !record ||
    slide.lessonPlan?.currentRevision !== record.revision
  ) {
    throw new AppHttpError(
      409,
      "LESSON_PLAN_NOT_APPROVED",
      "所有当前讲稿修订必须先批准。",
      false,
    );
  }

  let revision: LessonPlanRevision;
  try {
    revision = LessonPlanRevisionSchema.parse(record.payload);
  } catch {
    throw new AppHttpError(
      409,
      "LESSON_PLAN_INVALID",
      "当前讲稿修订无法通过结构校验。",
      false,
    );
  }
  const reviewFlags = reviewFlagsForSlide(slide, revision);
  if (record.approvalStatus !== "approved" && reviewFlags.length > 0) {
    throw new AppHttpError(
      409,
      "HUMAN_REVIEW_REQUIRED",
      "当前页面仍需人工复核，确认解析结果和数学内容后才能生成视频。",
      false,
      { slideId: slide.id, reviewFlags },
    );
  }
  if (record.approvalStatus !== "approved" || revision.approval.status !== "approved") {
    throw new AppHttpError(
      409,
      "LESSON_PLAN_NOT_APPROVED",
      "所有当前讲稿修订必须先批准。",
      false,
    );
  }
  return { revision, reviewFlags };
}
