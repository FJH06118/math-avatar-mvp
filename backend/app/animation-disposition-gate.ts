/**
 * M1 生成前置门：所有会产出媒体/视频的创建路径都必须经过这里。
 *
 * 单独成模块的原因：`animation-manifest.ts`（读取清单）与 `animation-disposition.ts`
 * （处置计算）互相需要对方的类型与降级逻辑，若把门放进其中任一个模块会形成循环导入。
 */

import type { AnimationDisposition } from "@ppt-digital-human/contracts";
import { LessonPlanRevisionSchema } from "@ppt-digital-human/contracts";

import {
  assertAnimationDispositionComplete,
  buildAnimationDispositionState,
  type AnimationDispositionState,
} from "./animation-disposition.ts";
import { readPresentationAnimationManifest } from "./animation-manifest.ts";

/** 已加载的页面记录（只需处置所需的最小字段）。 */
export interface GatedSlide {
  id: string;
  slideNumber: number;
  lessonPlan?: {
    revisions: ReadonlyArray<{ payload: unknown }>;
  } | null;
}

/** 与 `readPresentationAnimationManifest` 入参一致的课件信息。 */
export interface GatedPresentation {
  sha256: string;
  createdAt: Date;
  animationManifestJson: unknown;
  slides: readonly GatedSlide[];
}

function dispositionFromSlide(slide: GatedSlide): AnimationDisposition | null {
  const payload = slide.lessonPlan?.revisions[0]?.payload;
  if (payload === undefined) return null;
  const parsed = LessonPlanRevisionSchema.safeParse(payload);
  if (!parsed.success) return null;
  return parsed.data.animationDisposition ?? null;
}

/**
 * 校验并返回动画处置状态；含动画页面缺少匹配处置时抛出
 * `ANIMATION_REVIEW_REQUIRED`（HTTP 409）。
 *
 * 缺少清单字段（旧课件）时按静态降级处理：此时动画事实不可读，
 * 既不能要求用户处置，也不能声称页面没有动画。
 */
export function assertPresentationAnimationDisposition(
  presentation: GatedPresentation,
): AnimationDispositionState {
  const manifest = readPresentationAnimationManifest({
    sha256: presentation.sha256,
    createdAt: presentation.createdAt,
    animationManifestJson: presentation.animationManifestJson ?? null,
    slides: presentation.slides.map((slide) => ({
      id: slide.id,
      slideNumber: slide.slideNumber,
    })),
  });
  const state = buildAnimationDispositionState(
    manifest,
    presentation.slides.map((slide) => ({ id: slide.id, slideNumber: slide.slideNumber })),
    new Map(presentation.slides.map((slide) => [slide.id, dispositionFromSlide(slide)] as const)),
  );
  assertAnimationDispositionComplete(state);
  return state;
}
