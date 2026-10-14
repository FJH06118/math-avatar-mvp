/**
 * M1 动画处置门（AnimationDisposition）：计算、校验与报告动画处置。
 *
 * 设计原则（对齐 docs/planning/CURRENT_RESULTS_CAPABILITY_ROADMAP.md 的 M1）：
 * - 处置与 COM 动画事实**分离**：事实来自 `animationManifestJson`，处置来自用户选择；
 * - 处置通过 `manifestHash` 绑定当前清单，清单变化即自动失效；
 * - 含动画页面没有匹配处置时，必须在**创建生成流程之前**被阻断。
 */

import { createHash } from "node:crypto";
import {
  AnimationDispositionSchema,
  AnimationDispositionReportSchema,
  AnimationManifestV1Schema,
  LessonPlanRevisionSchema,
  SlideAnimationReviewSchema,
  type AnimationDisposition,
  type AnimationDispositionMode,
  type AnimationDispositionReport,
  type AnimationManifestV1,
  type SlideAnimationManifest,
  type SlideAnimationReview,
} from "@ppt-digital-human/contracts";

import { AppHttpError } from "./errors.ts";

/** 稳定错误码：含动画页面缺少匹配处置时使用。 */
export const ANIMATION_REVIEW_REQUIRED = "ANIMATION_REVIEW_REQUIRED";

/**
 * 当前允许用户选择的处置模式。
 * `PRESERVE_NATIVE` 在 M2（PowerPoint 原生视频 POC）判定 GO 之前**不得出现**。
 */
export const SELECTABLE_DISPOSITION_MODES: readonly AnimationDispositionMode[] = [
  "ACCEPT_STATIC",
] as const;

/** 系统性派生者标识（非真实用户）。 */
export const SYSTEM_DECIDER = "system" as const;

/** 服务端派生处置时使用的时间戳（确定性，避免同一清单每次投影都变化）。 */
export const SYSTEM_DECIDED_AT = "1970-01-01T00:00:00.000Z" as const;

export interface DispositionSlideInput {
  id: string;
  slideNumber: number;
}

export interface RequiredDisposition {
  slideId: string;
  slideNumber: number;
  effectCount: number;
}

export interface AnimationDispositionState {
  manifestHash: string;
  /** 该页是否存在权威动画事实（有动画才需要用户处置）。 */
  reviews: SlideAnimationReview[];
  /** 必须由用户做出处置的页面。 */
  required: RequiredDisposition[];
  /** 元数据不可用、无法要求用户处置的页面数。 */
  metadataUnavailableSlideCount: number;
  report: AnimationDispositionReport;
}

/**
 * 计算动画清单的稳定哈希，用于把处置绑定到"当前这一份动画事实"。
 *
 * 只纳入清单身份与逐页动画事实（不含 `extractedAt` 之类的时间成分），
 * 因此同一份课件重新解析只要事实不变，哈希就稳定；事实一变，哈希必变。
 */
export function dispositionManifestHash(manifest: AnimationManifestV1): string {
  const canonical = {
    schemaVersion: manifest.schemaVersion,
    metadataSource: manifest.metadataSource,
    parserVersion: manifest.parserVersion,
    sourceFileSha256: manifest.sourceFileSha256,
    slides: manifest.slides.map((slide) => ({
      slideNumber: slide.slideNumber,
      effectCount: slide.effectCount,
      transition: slide.transition,
      sequences: slide.sequences.map((sequence) => ({
        index: sequence.index,
        kind: sequence.kind,
        effects: sequence.effects.map((effect) => ({
          id: effect.id,
          order: effect.order,
          category: effect.category,
          effectType: effect.effectType,
          exit: effect.exit,
          timing: effect.timing,
        })),
      })),
    })),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** 服务端为无动画页面派生的处置。 */
export function deriveNotApplicableDisposition(
  slideId: string,
  manifestHash: string,
  decidedAt: string,
): AnimationDisposition {
  return AnimationDispositionSchema.parse({
    schemaVersion: "animation-disposition-v1",
    slideId,
    manifestHash,
    mode: "NOT_APPLICABLE",
    decidedBy: SYSTEM_DECIDER,
    decidedAt,
  });
}

/** 判断某个处置是否仍对当前清单有效。 */
export function isDispositionCurrent(
  disposition: AnimationDisposition | null | undefined,
  slideId: string,
  manifestHash: string,
): boolean {
  if (!disposition) return false;
  return disposition.slideId === slideId && disposition.manifestHash === manifestHash;
}

function animationForSlide(
  manifest: AnimationManifestV1,
  slideNumber: number,
): SlideAnimationManifest | undefined {
  const animation = manifest.slides[slideNumber - 1];
  if (!animation || animation.slideNumber !== slideNumber) return undefined;
  return animation;
}

/**
 * 汇总当前课件的动画处置状态：逐页事实、必须处置的页面、以及结果报告计数。
 *
 * `dispositions` 由调用方从各页当前修订的 `animationDisposition` 中提取。
 */
export function buildAnimationDispositionState(
  manifest: AnimationManifestV1,
  slides: readonly DispositionSlideInput[],
  dispositions: ReadonlyMap<string, AnimationDisposition | null | undefined>,
): AnimationDispositionState {
  const manifestHash = dispositionManifestHash(manifest);
  const metadataUnavailable = manifest.metadataSource === "STATIC_FALLBACK";
  const reviews: SlideAnimationReview[] = [];
  const required: RequiredDisposition[] = [];
  let metadataUnavailableSlideCount = 0;
  let nativePreserved = 0;
  let acceptedStatic = 0;

  for (const slide of slides) {
    const animation = animationForSlide(manifest, slide.slideNumber);
    if (!animation) {
      throw new AppHttpError(
        500,
        "ANIMATION_MANIFEST_INVALID",
        "动画清单与页面无法对应。",
        false,
      );
    }
    const rawDisposition = dispositions.get(slide.id) ?? null;
    const current = isDispositionCurrent(rawDisposition, slide.id, manifestHash)
      ? rawDisposition
      : null;
    const hasAnimationFacts = !metadataUnavailable && animation.effectCount > 0;
    // 契约不允许静态降级声明任何效果数（`effectCount` 必须与序列一致），
    // 因此"元数据不可用"的准确含义是：整份课件按静态降级处理，这一页的动画
    // 事实**无法读取**，既不能要求用户处置、也不能声称它没有动画。
    if (metadataUnavailable) {
      metadataUnavailableSlideCount += 1;
    }
    // 无动画页面由服务端派生 NOT_APPLICABLE：**不写入修订**（保持修订不可变），
    // 只在审阅投影里派生，让工作台显示"系统判定该页无需处置"。
    const effectiveDisposition =
      current === null && !hasAnimationFacts && !metadataUnavailable
        ? deriveNotApplicableDisposition(slide.id, manifestHash, SYSTEM_DECIDED_AT)
        : current;
    if (effectiveDisposition?.mode === "PRESERVE_NATIVE") nativePreserved += 1;
    if (effectiveDisposition?.mode === "ACCEPT_STATIC") acceptedStatic += 1;
    if (hasAnimationFacts && current === null) {
      required.push({
        slideId: slide.id,
        slideNumber: slide.slideNumber,
        effectCount: animation.effectCount,
      });
    }
    reviews.push(
      SlideAnimationReviewSchema.parse({
        slideId: slide.id,
        slideNumber: slide.slideNumber,
        manifestHash,
        metadataSource: manifest.metadataSource,
        effectCount: animation.effectCount,
        sequenceKinds: animation.sequences.map((sequence) => sequence.kind),
        supportLevels: animation.supportAssessment.levels,
        supportSummary: animation.supportAssessment.summary,
        warnings: animation.warnings,
        hasAnimationFacts,
        disposition: effectiveDisposition,
        dispositionCurrent: effectiveDisposition !== null,
      }),
    );
  }

  const animatedSlideCount = reviews.filter((review) => review.hasAnimationFacts).length;
  return {
    manifestHash,
    reviews,
    required,
    metadataUnavailableSlideCount,
    report: AnimationDispositionReportSchema.parse({
      animatedSlideCount,
      nativePreservedSlideCount: nativePreserved,
      acceptedStaticSlideCount: acceptedStatic,
      metadataUnavailableSlideCount,
    }),
  };
}

/**
 * 生成前置门：含动画页面缺少匹配处置时必须阻断。
 * 这是 Release A 的最低诚信门——不允许"没有提示就被静态化"。
 */
export function assertAnimationDispositionComplete(state: AnimationDispositionState): void {
  if (state.required.length === 0) return;
  throw new AppHttpError(
    409,
    ANIMATION_REVIEW_REQUIRED,
    "含动画的页面必须先选择处置方式；未选择前不能生成视频。",
    false,
    {
      manifestHash: state.manifestHash,
      slides: state.required.map((item) => ({
        slideId: item.slideId,
        slideNumber: item.slideNumber,
        effectCount: item.effectCount,
      })),
      selectableModes: [...SELECTABLE_DISPOSITION_MODES],
    },
  );
}

/** 解析并校验持久化的动画清单。 */
export function parseAnimationManifestOrThrow(value: unknown): AnimationManifestV1 {
  const parsed = AnimationManifestV1Schema.safeParse(value);
  if (!parsed.success) {
    throw new AppHttpError(
      409,
      "ANIMATION_MANIFEST_INVALID",
      "动画清单无法通过结构校验。",
      false,
    );
  }
  return parsed.data;
}
