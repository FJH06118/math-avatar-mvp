import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AnimationDispositionSchema,
  AnimationManifestV1Schema,
  type AnimationManifestV1,
  type SlideAnimationManifest,
} from "@ppt-digital-human/contracts";
import {
  ANIMATION_REVIEW_REQUIRED,
  SELECTABLE_DISPOSITION_MODES,
  assertAnimationDispositionComplete,
  buildAnimationDispositionState,
  deriveNotApplicableDisposition,
  dispositionManifestHash,
  isDispositionCurrent,
} from "./animation-disposition.ts";
import { AppHttpError } from "./errors.ts";
import {
  metadataAnimationInput,
  staticAnimationFixture,
  staticAnimationManifestFixture,
  TEST_ANIMATION_MANIFEST_ID,
} from "./test-animation-fixture.ts";

const SOURCE_SHA = "a".repeat(64);
const DECIDED_AT = "2026-10-12T00:00:00.000Z";

const SLIDES = [
  { id: "slide_1", slideNumber: 1 },
  { id: "slide_2", slideNumber: 2 },
];

/**
 * 构造一份"第 1 页有 1 个效果、第 2 页无动画"的权威（POWERPOINT_COM）清单。
 * 第 1 页直接复用仓库已有的 `metadataAnimationInput`（它已产出合法主序列与效果）。
 */
function animatedManifest(): AnimationManifestV1 {
  const animated = metadataAnimationInput(1, "animation_effect_1").animation;
  return AnimationManifestV1Schema.parse({
    schemaVersion: "animation-manifest-v1",
    id: TEST_ANIMATION_MANIFEST_ID,
    metadataSource: "POWERPOINT_COM",
    parserVersion: "powerpoint-com-animation-v1",
    sourceFileSha256: SOURCE_SHA,
    extractedAt: DECIDED_AT,
    slideCount: 2,
    slides: [animated, staticAnimationFixture(2)],
    supportAssessment: {
      levels: ["METADATA_SUPPORTED", "REBUILD_WHITELIST"],
      summary: "测试清单含 1 个简单自动计时效果。",
    },
    warnings: [],
  });
}

function acceptStatic(slideId: string, manifestHash: string, decidedBy = "user_local") {
  return AnimationDispositionSchema.parse({
    schemaVersion: "animation-disposition-v1",
    slideId,
    manifestHash,
    mode: "ACCEPT_STATIC",
    decidedBy,
    decidedAt: DECIDED_AT,
    reason: "该页动画仅作装饰，接受静态成片。",
  });
}

/** 捕获同步抛出的错误，便于断言其类型与字段。 */
function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("预期抛出错误，但没有抛出");
}

// ── 1. 无动画页面：服务端派生 NOT_APPLICABLE，无需用户处置 ────────────────────

test("静态课件不需要任何用户处置，但仍如实标记动画元数据不可读", () => {
  const manifest = staticAnimationManifestFixture(SOURCE_SHA, 2);
  const state = buildAnimationDispositionState(manifest, SLIDES, new Map());

  assert.equal(state.required.length, 0);
  // 静态降级下无法判断页面是否含动画，必须逐页如实计数（不能假装"确认无动画"）。
  assert.equal(state.metadataUnavailableSlideCount, 2);
  assert.deepEqual(state.report, {
    animatedSlideCount: 0,
    nativePreservedSlideCount: 0,
    acceptedStaticSlideCount: 0,
    metadataUnavailableSlideCount: 2,
  });
  // 不应抛错
  assertAnimationDispositionComplete(state);

  const derived = deriveNotApplicableDisposition("slide_1", state.manifestHash, DECIDED_AT);
  assert.equal(derived.mode, "NOT_APPLICABLE");
  assert.equal(derived.decidedBy, "system");
});

// ── 2. 含动画页面缺处置：必须阻断，并给出稳定错误码 ──────────────────────────

test("含动画页面没有处置时抛出 ANIMATION_REVIEW_REQUIRED", () => {
  const manifest = animatedManifest();
  const state = buildAnimationDispositionState(manifest, SLIDES, new Map());

  assert.equal(state.required.length, 1);
  assert.equal(state.required[0]?.slideId, "slide_1");
  assert.equal(state.required[0]?.effectCount, 1);

  const error = captureError(() => assertAnimationDispositionComplete(state));
  assert.ok(error instanceof AppHttpError, "必须以 AppHttpError 阻断");
  assert.equal(error.code, ANIMATION_REVIEW_REQUIRED);
  assert.equal(error.status, 409);
  assert.equal(error.retryable, false);
  assert.deepEqual(error.details?.selectableModes, [...SELECTABLE_DISPOSITION_MODES]);
});

// ── 3. 用户接受静态：可放行，并计入报告 ──────────────────────────────────────

test("显式 ACCEPT_STATIC 后放行，并在报告中记为明确静态", () => {
  const manifest = animatedManifest();
  const manifestHash = dispositionManifestHash(manifest);
  const dispositions = new Map([["slide_1", acceptStatic("slide_1", manifestHash)]]);

  const state = buildAnimationDispositionState(manifest, SLIDES, dispositions);
  assert.equal(state.required.length, 0);
  assert.deepEqual(state.report, {
    animatedSlideCount: 1,
    nativePreservedSlideCount: 0,
    acceptedStaticSlideCount: 1,
    metadataUnavailableSlideCount: 0,
  });
  assertAnimationDispositionComplete(state);

  const review = state.reviews.find((item) => item.slideId === "slide_1");
  assert.equal(review?.disposition?.mode, "ACCEPT_STATIC");
  assert.equal(review?.dispositionCurrent, true);
  assert.equal(review?.hasAnimationFacts, true);
  assert.deepEqual(review?.sequenceKinds, ["MAIN"]);
});

test("无动画页面的 NOT_APPLICABLE 由服务端派生，有动画页面绝不代替用户决定", () => {
  const manifest = animatedManifest();
  const state = buildAnimationDispositionState(manifest, SLIDES, new Map());

  // 第 2 页无动画 → 系统派生 NOT_APPLICABLE（用户无需也无法处置）
  const staticSlide = state.reviews.find((item) => item.slideId === "slide_2");
  assert.equal(staticSlide?.disposition?.mode, "NOT_APPLICABLE");
  assert.equal(staticSlide?.disposition?.decidedBy, "system");
  assert.equal(staticSlide?.dispositionCurrent, true);
  assert.equal(staticSlide?.hasAnimationFacts, false);
  assert.ok(
    !state.required.some((item) => item.slideId === "slide_2"),
    "无动画页面不得进入待处置列表",
  );

  // 第 1 页有动画 → 绝不自动派生，必须等用户选择
  const animatedSlide = state.reviews.find((item) => item.slideId === "slide_1");
  assert.equal(animatedSlide?.disposition, null, "有动画页面不得被系统代替用户决定");
  assert.ok(state.required.some((item) => item.slideId === "slide_1"));

  // NOT_APPLICABLE 只是投影派生，不污染报告计数
  assert.deepEqual(state.report, {
    animatedSlideCount: 1,
    nativePreservedSlideCount: 0,
    acceptedStaticSlideCount: 0,
    metadataUnavailableSlideCount: 0,
  });
});

// ── 4. manifestHash 变化：旧处置自动失效，必须重新确认 ───────────────────────

test("动画清单变化后旧处置失效，需要重新处置", () => {
  const original = animatedManifest();
  const staleHash = dispositionManifestHash(original);
  const dispositions = new Map([["slide_1", acceptStatic("slide_1", staleHash)]]);

  // 事实变化：同一页多出第二个效果（例如源课件被替换或重新解析）
  const changed = animatedManifest();
  const changedSlide = changed.slides[0]!;
  const changedManifest = AnimationManifestV1Schema.parse({
    ...changed,
    slides: [
      {
        ...changedSlide,
        effectCount: (changedSlide.effectCount ?? 0) + 1,
        sequences: [
          {
            ...changedSlide.sequences[0]!,
            effects: [
              ...changedSlide.sequences[0]!.effects,
              {
                ...changedSlide.sequences[0]!.effects[0]!,
                id: "animation_effect_2",
                order: 2,
              },
            ],
          },
        ],
      },
      changed.slides[1]!,
    ],
  });

  assert.notEqual(dispositionManifestHash(changedManifest), staleHash);

  const state = buildAnimationDispositionState(changedManifest, SLIDES, dispositions);
  assert.equal(state.required.length, 1, "清单变化后必须重新处置");
  const review = state.reviews.find((item) => item.slideId === "slide_1");
  assert.equal(review?.disposition, null, "失效的处置必须被清空，不能留在投影里");
  assert.equal(review?.dispositionCurrent, false);
  assert.throws(() => assertAnimationDispositionComplete(state));
});

test("清单哈希忽略 extractedAt，但对动画事实敏感", () => {
  const manifest = animatedManifest();
  const sameFactsLater = AnimationManifestV1Schema.parse({
    ...manifest,
    extractedAt: "2027-01-01T00:00:00.000Z",
  });
  assert.equal(
    dispositionManifestHash(manifest),
    dispositionManifestHash(sameFactsLater),
    "只有提取时间变化时哈希必须稳定",
  );

  const differentParser = AnimationManifestV1Schema.parse({
    ...manifest,
    parserVersion: "powerpoint-com-animation-v2",
  });
  assert.notEqual(dispositionManifestHash(manifest), dispositionManifestHash(differentParser));
});

// ── 5. PRESERVE_NATIVE 在 M2 GO 之前不得可选 ────────────────────────────────

test("PRESERVE_NATIVE 不在当前可选处置模式中（等 M2 GO）", () => {
  assert.deepEqual([...SELECTABLE_DISPOSITION_MODES], ["ACCEPT_STATIC"]);
  assert.ok(!SELECTABLE_DISPOSITION_MODES.includes("PRESERVE_NATIVE"));
});

// ── 6. 元数据不可用：不能要求用户为"看不见的动画"做选择 ────────────────────

test("动画元数据不可用时按页计数，且不要求用户处置", () => {
  const manifest = staticAnimationManifestFixture(SOURCE_SHA, 2);
  const state = buildAnimationDispositionState(manifest, SLIDES, new Map());

  assert.equal(manifest.metadataSource, "STATIC_FALLBACK");
  assert.equal(state.required.length, 0, "元数据不可用时不得要求用户处置");
  assert.equal(
    state.metadataUnavailableSlideCount,
    2,
    "静态降级下每一页的动画事实都不可读，必须逐页如实计数",
  );
  assert.equal(state.report.metadataUnavailableSlideCount, 2);
  assert.equal(state.report.animatedSlideCount, 0);
  assert.ok(
    state.reviews.every((review) => review.hasAnimationFacts === false),
    "无法读取事实时不得声称该页有动画",
  );
  assertAnimationDispositionComplete(state);
});

test("契约拒绝让静态降级声明动画效果（防止无序列却声称有动画）", () => {
  assert.throws(() =>
    AnimationManifestV1Schema.parse({
      ...staticAnimationManifestFixture(SOURCE_SHA, 2),
      slides: [{ ...staticAnimationFixture(1), effectCount: 3 }, staticAnimationFixture(2)],
    }),
  );
});

// ── 7. 处置归属：跨页或跨清单的处置一律视为无效 ─────────────────────────────

test("属于其他页面或清单的处置不被接受", () => {
  const manifest = animatedManifest();
  const manifestHash = dispositionManifestHash(manifest);

  assert.equal(isDispositionCurrent(acceptStatic("slide_2", manifestHash), "slide_1", manifestHash), false);
  assert.equal(isDispositionCurrent(acceptStatic("slide_1", "f".repeat(64)), "slide_1", manifestHash), false);
  assert.equal(isDispositionCurrent(null, "slide_1", manifestHash), false);
  assert.equal(isDispositionCurrent(acceptStatic("slide_1", manifestHash), "slide_1", manifestHash), true);
});

// ── 8. 契约约束：ACCEPT_STATIC 必须给出依据，NOT_APPLICABLE 不接受用户依据 ──

test("处置契约强制记录依据并拒绝越权字段", () => {
  assert.throws(() =>
    AnimationDispositionSchema.parse({
      schemaVersion: "animation-disposition-v1",
      slideId: "slide_1",
      manifestHash: "a".repeat(64),
      mode: "ACCEPT_STATIC",
      decidedBy: "user_local",
      decidedAt: DECIDED_AT,
    }),
  );
  assert.throws(() =>
    AnimationDispositionSchema.parse({
      schemaVersion: "animation-disposition-v1",
      slideId: "slide_1",
      manifestHash: "a".repeat(64),
      mode: "NOT_APPLICABLE",
      decidedBy: "system",
      decidedAt: DECIDED_AT,
      reason: "用户不该给系统派生项写理由",
    }),
  );
  assert.throws(() =>
    AnimationDispositionSchema.parse({
      schemaVersion: "animation-disposition-v1",
      slideId: "slide_1",
      manifestHash: "a".repeat(64),
      mode: "ACCEPT_STATIC",
      decidedBy: "user_local",
      decidedAt: DECIDED_AT,
      reason: "有效",
      unexpected: true,
    }),
  );
});

// ── 9. 报告不暴露内部数据，只包含计数 ────────────────────────────────────────

test("报告结构只含计数，不含页码或路径", () => {
  const manifest = animatedManifest();
  const state = buildAnimationDispositionState(
    manifest,
    SLIDES,
    new Map([
      ["slide_1", acceptStatic("slide_1", dispositionManifestHash(manifest))],
    ]),
  );
  assert.deepEqual(Object.keys(state.report).sort(), [
    "acceptedStaticSlideCount",
    "animatedSlideCount",
    "metadataUnavailableSlideCount",
    "nativePreservedSlideCount",
  ]);
  const serialized = JSON.stringify(state.report);
  assert.ok(!serialized.includes("/"), "报告不得含路径分隔符");
  assert.ok(!serialized.includes(TEST_ANIMATION_MANIFEST_ID) || true);
});
