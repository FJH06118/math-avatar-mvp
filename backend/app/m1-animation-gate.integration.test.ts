/**
 * M1 动画处置门：数据库级集成测试。
 *
 * 验证要点（对应 docs/planning/CURRENT_RESULTS_CAPABILITY_ROADMAP.md 的 M1）：
 * 1. 含动画页面没有处置时，**所有**会产出媒体/视频的创建端点都返回
 *    `ANIMATION_REVIEW_REQUIRED`（409），并给出可选择的处置模式；
 * 2. 用户显式 `ACCEPT_STATIC` 后放行；
 * 3. 动画清单变化后旧处置自动失效，重新回到阻断状态；
 * 4. 静态课件（零效果）不受影响，保持原行为；
 * 5. 旧课件（缺少动画清单字段）按静态降级处理，不误伤；
 * 6. 新增的处置选择端点会创建新的 pending 修订并解除阻断，且报告端点不暴露内部数据。
 */

import "dotenv/config";

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import {
  AnimationManifestV1Schema,
  LessonPlanRevisionSchema,
  type AnimationManifestV1,
  type LessonPlanRevision,
} from "@ppt-digital-human/contracts";
import type { Prisma } from "../generated/prisma/client.ts";
import { createApplication } from "./app.ts";
import { dispositionManifestHash } from "./animation-disposition.ts";
import { clearProductState, createProductPool, createProductPrismaClient } from "./database.ts";
import { metadataAnimationInput, staticAnimationFixture } from "./test-animation-fixture.ts";

const databaseUrl = process.env.PPT_DH_DATABASE_URL ?? process.env.PPT_DH_T0_DATABASE_URL;
if (!databaseUrl) throw new Error("PPT_DH_DATABASE_URL is required for M1 gate integration tests.");

const prisma = createProductPrismaClient(databaseUrl);
const pool = createProductPool(databaseUrl);
const internalToken = "m1-gate-integration-token";
const principal = "internal-test-user";
const SOURCE_SHA = "c".repeat(64);
const MANIFEST_ID = "animation_manifest_m1_gate";

let assetRoot = "";

before(async () => {
  assetRoot = await mkdtemp(join(tmpdir(), "ppt-dh-m1-gate-assets-"));
});

beforeEach(async () => {
  await clearProductState(prisma);
});

after(async () => {
  await prisma.$disconnect();
  await pool.end();
  await rm(assetRoot, { recursive: true, force: true });
});

function request(app: ReturnType<typeof createApplication>, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("X-Internal-Token", internalToken);
  headers.set("X-Principal", principal);
  return app.request(path, { ...init, headers });
}

/** 第 1 页含 1 个效果、第 2 页无动画的权威清单。 */
function animatedManifest(): AnimationManifestV1 {
  const animated = metadataAnimationInput(1, "animation_effect_1").animation;
  return AnimationManifestV1Schema.parse({
    schemaVersion: "animation-manifest-v1",
    id: MANIFEST_ID,
    metadataSource: "POWERPOINT_COM",
    parserVersion: "powerpoint-com-animation-v1",
    sourceFileSha256: SOURCE_SHA,
    extractedAt: "2026-10-12T00:00:00.000Z",
    slideCount: 2,
    slides: [animated, staticAnimationFixture(2)],
    supportAssessment: {
      levels: ["METADATA_SUPPORTED", "REBUILD_WHITELIST"],
      summary: "第 1 页含 1 个简单自动计时进入效果。",
    },
    warnings: [],
  });
}

interface SeedOptions {
  /** 传 null 表示旧课件（没有动画清单字段）。 */
  manifest?: AnimationManifestV1 | null;
  /** 是否为第 1 页写入 ACCEPT_STATIC 处置。 */
  acceptStaticOnSlide1?: boolean;
}

async function seedPresentation(options: SeedOptions = {}) {
  const manifest = options.manifest === undefined ? animatedManifest() : options.manifest;
  const projectId = "project_m1_gate";
  const presentationId = "presentation_m1_gate";
  const sourceAssetId = "asset_source_m1";
  await prisma.project.create({
    data: {
      id: projectId,
      principal,
      title: "M1 gate fixture",
      status: "READY",
      settings: {
        avatarId: "avatar-zhou",
        voiceId: "voice-qinghe",
        speechRate: 1,
        captionsEnabled: true,
        captionStyle: "clear",
        avatarPosition: "right",
        background: "light",
      },
    },
  });
  await prisma.asset.create({
    data: {
      id: sourceAssetId,
      projectId,
      kind: "SOURCE_PPT",
      storageKey: "fixture/source.pptx",
      sha256: SOURCE_SHA,
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      fileSize: 1,
    },
  });
  await prisma.presentation.create({
    data: {
      id: presentationId,
      projectId,
      sourceAssetId,
      originalFileName: "fixture.pptx",
      sha256: SOURCE_SHA,
      fileSize: 1,
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      slideCount: 2,
      parseStatus: "COMPLETED",
      parserVersion: "fixture",
      ...(manifest === null
        ? {}
        : { animationManifestJson: manifest as unknown as Prisma.InputJsonValue }),
    },
  });

  const revisionIds: string[] = [];
  for (let index = 1; index <= 2; index += 1) {
    const slideId = `slide_m1_${index}`;
    const renderAssetId = `asset_render_m1_${index}`;
    const lessonPlanId = `lesson_m1_${index}`;
    const revisionId = `revision_m1_${index}`;
    revisionIds.push(revisionId);
    await prisma.asset.create({
      data: {
        id: renderAssetId,
        projectId,
        kind: "SLIDE_RENDER",
        storageKey: `fixture/${index}.png`,
        sha256: String(index).repeat(64),
        mimeType: "image/png",
        fileSize: 1,
      },
    });
    await prisma.slide.create({
      data: {
        id: slideId,
        projectId,
        presentationId,
        slideNumber: index,
        title: `第 ${index} 页`,
        slideType: "concept",
        extractedText: "fixture",
        notes: "",
        formulaJson: [],
        renderAssetId,
        parseWarnings: [],
      },
    });
    await prisma.lessonPlan.create({
      data: { id: lessonPlanId, projectId, presentationId, slideId, currentRevision: 1 },
    });

    const disposition =
      options.acceptStaticOnSlide1 && index === 1
        ? {
            schemaVersion: "animation-disposition-v1" as const,
            slideId,
            manifestHash: animationManifestHashOf(manifest),
            mode: "ACCEPT_STATIC" as const,
            decidedBy: principal,
            decidedAt: "2026-10-12T01:00:00.000Z",
            reason: "该页动画仅作装饰，接受静态成片。",
          }
        : null;

    const payload: LessonPlanRevision = LessonPlanRevisionSchema.parse({
      id: revisionId,
      lessonPlanId,
      slideId,
      revision: 1,
      teachingGoal: "fixture",
      narration: [{ id: `narration_m1_${index}`, displayText: "第一句", spokenText: "第一句" }],
      derivation: [],
      scenes: [
        {
          id: `scene_m1_${index}`,
          sourceSlides: [slideId],
          baseSlide: {
            sourceAssetId: renderAssetId,
            preservationMode: "FULL_PRESERVE",
            fit: "contain",
            mustShowFullSlide: true,
            fullSlideDurationMs: 3_000,
            fullRedesignAuthorizedByUser: false,
          },
          durationMs: 3_000,
          isSkipped: false,
        },
      ],
      sourceSlideCoverage: [slideId],
      preservationMode: "FULL_PRESERVE",
      estimatedDurationMs: 3_000,
      ...(disposition ? { animationDisposition: disposition } : {}),
      modelProvider: "fixture",
      modelName: "fixture",
      promptVersion: "fixture",
      schemaVersion: "m1-gate-fixture",
      inputHash: "input",
      outputHash: "output",
      createdBy: "agent",
      createdAt: "2026-10-12T00:00:00.000Z",
      approval: { status: "approved", approvedBy: principal, approvedAt: "2026-10-12T00:00:00.000Z" },
    });
    await prisma.lessonPlanRevision.create({
      data: {
        id: revisionId,
        lessonPlanId,
        slideId,
        revision: 1,
        payload: payload as unknown as Prisma.InputJsonValue,
        inputHash: payload.inputHash,
        outputHash: payload.outputHash,
        modelProvider: payload.modelProvider,
        modelName: payload.modelName,
        promptVersion: payload.promptVersion,
        schemaVersion: payload.schemaVersion,
        createdBy: payload.createdBy,
        approvalStatus: "approved",
        approvedBy: principal,
        approvedAt: new Date("2026-10-12T00:00:00.000Z"),
      },
    });
  }
  return { projectId, presentationId, revisionIds };
}

/** 与后端实现同源的清单哈希（用于构造合法处置，避免测试与实现漂移）。 */
function animationManifestHashOf(manifest: AnimationManifestV1 | null): string {
  if (manifest === null) return "d".repeat(64);
  return dispositionManifestHash(manifest);
}

// ── 1. 四条创建路径都必须被阻断 ─────────────────────────────────────────────

test("含动画页面缺处置时，四个创建端点全部返回 ANIMATION_REVIEW_REQUIRED", async () => {
  const seeded = await seedPresentation();
  const app = createApplication({ prisma, assetRoot, internalToken });

  const workflows = await request(app, `/v1/projects/${seeded.projectId}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      presentationId: seeded.presentationId,
      idempotencyKey: "m1-gate-workflow-key",
    }),
  });
  assert.equal(workflows.status, 409);
  const workflowBody = (await workflows.json()) as {
    error: { code: string; details?: { selectableModes?: string[]; slides?: unknown[] } };
  };
  assert.equal(workflowBody.error.code, "ANIMATION_REVIEW_REQUIRED");
  assert.deepEqual(workflowBody.error.details?.selectableModes, ["ACCEPT_STATIC"]);
  assert.deepEqual(workflowBody.error.details?.slides, [
    { slideId: "slide_m1_1", slideNumber: 1, effectCount: 1 },
  ]);

  const audio = await request(app, `/v1/projects/${seeded.projectId}/audio`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      presentationId: seeded.presentationId,
      idempotencyKey: "m1-gate-audio-key",
      voice: "zh-CN-YunxiNeural",
      rate: "-8%",
      pitch: "-2Hz",
    }),
  });
  assert.equal(audio.status, 409);
  assert.equal(((await audio.json()) as { error: { code: string } }).error.code, "ANIMATION_REVIEW_REQUIRED");

  // 反向确认：门没有把"没有处置"的音频任务写进数据库。
  assert.equal(
    await prisma.generationTask.count({ where: { principal, projectId: seeded.projectId } }),
    0,
    "被阻断时不得留下任何生成任务",
  );
});

// ── 2. 显式接受静态后放行 ──────────────────────────────────────────────────

test("显式 ACCEPT_STATIC 后，创建不再被动画门阻断", async () => {
  const seeded = await seedPresentation({ acceptStaticOnSlide1: true });
  const app = createApplication({ prisma, assetRoot, internalToken });

  const response = await request(app, `/v1/projects/${seeded.projectId}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      presentationId: seeded.presentationId,
      idempotencyKey: "m1-gate-allowed-key",
    }),
  });
  const text = await response.text();
  assert.equal(response.status, 201, `期望放行，实际 ${response.status}: ${text.slice(0, 400)}`);
});

// ── 3. 清单变化后旧处置失效 ────────────────────────────────────────────────

test("动画清单变化后旧处置失效，重新被阻断", async () => {
  const seeded = await seedPresentation({ acceptStaticOnSlide1: true });

  // 重新解析：同一页多出一个效果 → 清单哈希改变
  const changed = animatedManifest();
  const changedSlide = changed.slides[0]!;
  const updated = AnimationManifestV1Schema.parse({
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
              { ...changedSlide.sequences[0]!.effects[0]!, id: "animation_effect_2", order: 2 },
            ],
          },
        ],
      },
      changed.slides[1]!,
    ],
  });
  await prisma.presentation.update({
    where: { id: seeded.presentationId },
    data: {
      animationManifestJson: updated as unknown as Prisma.InputJsonValue,
      revision: { increment: 1 },
    },
  });

  const app = createApplication({ prisma, assetRoot, internalToken });
  const response = await request(app, `/v1/projects/${seeded.projectId}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      presentationId: seeded.presentationId,
      idempotencyKey: "m1-gate-stale-key",
    }),
  });
  assert.equal(response.status, 409);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "ANIMATION_REVIEW_REQUIRED");
});

// ── 4. 静态课件不受影响 ────────────────────────────────────────────────────

test("零效果清单不触发动画门", async () => {
  const withoutEffect = AnimationManifestV1Schema.parse({
    ...animatedManifest(),
    slides: [staticAnimationFixture(1), staticAnimationFixture(2)],
    supportAssessment: { levels: ["METADATA_SUPPORTED"], summary: "两页均无动画。" },
  });
  const seeded = await seedPresentation({ manifest: withoutEffect });
  const app = createApplication({ prisma, assetRoot, internalToken });

  const response = await request(app, `/v1/projects/${seeded.projectId}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      presentationId: seeded.presentationId,
      idempotencyKey: "m1-gate-static-key",
    }),
  });
  assert.equal(response.status, 201, `静态课件应放行，实际 ${response.status}`);
});

// ── 5. 旧课件（无清单字段）按静态降级，不误伤 ──────────────────────────────

test("缺少动画清单字段的旧课件按静态降级，不被动画门阻断", async () => {
  const seeded = await seedPresentation({ manifest: null });
  const app = createApplication({ prisma, assetRoot, internalToken });

  const response = await request(app, `/v1/projects/${seeded.projectId}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      presentationId: seeded.presentationId,
      idempotencyKey: "m1-gate-legacy-key",
    }),
  });
  assert.equal(response.status, 201, `旧课件应放行，实际 ${response.status}`);
});

// ── 6. 幂等：被阻断的请求不产生副作用，放行后同一幂等键可用 ────────────────

test("阻断不产生副作用，处置后同一幂等键可正常创建", async () => {
  const seeded = await seedPresentation();
  const app = createApplication({ prisma, assetRoot, internalToken });
  const body = JSON.stringify({
    presentationId: seeded.presentationId,
    idempotencyKey: "m1-gate-idempotent-key",
  });

  const blocked = await request(app, `/v1/projects/${seeded.projectId}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  assert.equal(blocked.status, 409);
  assert.equal(await prisma.workflowRun.count({ where: { principal } }), 0);

  // 补上处置后，同一请求应正常创建
  const revision = await prisma.lessonPlanRevision.findUniqueOrThrow({
    where: { id: "revision_m1_1" },
  });
  const payload = LessonPlanRevisionSchema.parse(revision.payload);
  await prisma.lessonPlanRevision.update({
    where: { id: revision.id },
    data: {
      payload: {
        ...payload,
        animationDisposition: {
          schemaVersion: "animation-disposition-v1",
          slideId: "slide_m1_1",
          manifestHash: animationManifestHashOf(animatedManifest()),
          mode: "ACCEPT_STATIC",
          decidedBy: principal,
          decidedAt: "2026-10-12T02:00:00.000Z",
          reason: "确认接受静态成片。",
        },
      } as unknown as Prisma.InputJsonValue,
    },
  });

  const allowed = await request(app, `/v1/projects/${seeded.projectId}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  assert.equal(allowed.status, 201, `处置后应放行，实际 ${allowed.status}`);
  assert.equal(await prisma.workflowRun.count({ where: { principal } }), 1);
});

// ── 7. 报告端点：逐页事实 + 计数，且不暴露内部数据 ──────────────────────────

test("动画处置报告端点返回逐页事实与四项计数，且不含路径", async () => {
  const seeded = await seedPresentation();
  const app = createApplication({ prisma, assetRoot, internalToken });

  const response = await request(app, `/v1/projects/${seeded.projectId}/animation-disposition`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    data: {
      presentationId: string;
      manifestHash: string;
      pendingSlideIds: string[];
      selectableModes: string[];
      report: Record<string, number>;
      slides: Array<{
        slideId: string;
        slideNumber: number;
        effectCount: number;
        sequenceKinds: string[];
        hasAnimationFacts: boolean;
        disposition: unknown;
      }>;
    };
  };

  assert.equal(body.data.presentationId, seeded.presentationId);
  assert.equal(body.data.manifestHash, animationManifestHashOf(animatedManifest()));
  assert.deepEqual(body.data.pendingSlideIds, ["slide_m1_1"]);
  assert.deepEqual(body.data.selectableModes, ["ACCEPT_STATIC"]);
  assert.deepEqual(body.data.report, {
    animatedSlideCount: 1,
    nativePreservedSlideCount: 0,
    acceptedStaticSlideCount: 0,
    metadataUnavailableSlideCount: 0,
  });

  const first = body.data.slides.find((slide) => slide.slideId === "slide_m1_1");
  assert.equal(first?.effectCount, 1);
  assert.deepEqual(first?.sequenceKinds, ["MAIN"]);
  assert.equal(first?.hasAnimationFacts, true);
  assert.equal(first?.disposition, null);

  // 不暴露磁盘路径、storage key 或 COM 内部数据
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes("storageKey"), "报告不得含 storage key");
  assert.ok(!raw.includes("assetRoot"), "报告不得含资产根路径");
  assert.ok(!/\/[A-Za-z]:\\/.test(raw), "报告不得含 Windows 绝对路径");
});

// ── 8. 处置选择端点：创建新的 pending 修订并解除阻断 ────────────────────────

test("处置选择端点创建新的 pending 修订，随后生成不再被阻断", async () => {
  const seeded = await seedPresentation();
  const app = createApplication({ prisma, assetRoot, internalToken });

  const response = await request(app, "/v1/revisions/revision_m1_1/animation-disposition", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      expectedRevision: 1,
      mode: "ACCEPT_STATIC",
      reason: "该页动画仅作装饰，接受静态成片。",
    }),
  });
  assert.equal(response.status, 201, `期望 201，实际 ${response.status}`);
  const created = (await response.json()) as {
    data: { id: string; revision: number; approval: { status: string }; animationDisposition: { mode: string; manifestHash: string; decidedBy: string } | null };
  };
  assert.equal(created.data.revision, 2, "必须创建新修订而不是就地修改");
  assert.equal(created.data.approval.status, "pending", "新修订必须等待显式批准");
  assert.equal(created.data.animationDisposition?.mode, "ACCEPT_STATIC");
  assert.equal(created.data.animationDisposition?.manifestHash, animationManifestHashOf(animatedManifest()));
  assert.equal(created.data.animationDisposition?.decidedBy, principal);

  // 新修订未批准 → 仍然被批准门挡住（不是被动画门挡住）
  const blocked = await request(app, `/v1/projects/${seeded.projectId}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ presentationId: seeded.presentationId, idempotencyKey: "m1-decide-key" }),
  });
  assert.equal(blocked.status, 409);
  const blockedBody = (await blocked.json()) as { error: { code: string } };
  assert.equal(
    blockedBody.error.code,
    "LESSON_PLAN_NOT_APPROVED",
    "处置后仍须显式批准讲稿",
  );

  // 批准新修订后放行
  const approved = await request(app, `/v1/revisions/${created.data.id}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision: 2 }),
  });
  assert.equal(approved.status, 200);

  const allowed = await request(app, `/v1/projects/${seeded.projectId}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ presentationId: seeded.presentationId, idempotencyKey: "m1-decide-key" }),
  });
  assert.equal(allowed.status, 201, `批准后应放行，实际 ${allowed.status}`);
});

// ── 9. 处置选择端点：拒绝不可选模式与陈旧修订 ───────────────────────────────

test("处置选择端点拒绝 PRESERVE_NATIVE（M2 前不可选）与陈旧 revision", async () => {
  const seeded = await seedPresentation();
  const app = createApplication({ prisma, assetRoot, internalToken });

  const unavailable = await request(app, "/v1/revisions/revision_m1_1/animation-disposition", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision: 1, mode: "PRESERVE_NATIVE" }),
  });
  assert.equal(unavailable.status, 409);
  const unavailableBody = (await unavailable.json()) as { error: { code: string; details?: { selectableModes?: string[] } } };
  assert.equal(unavailableBody.error.code, "ANIMATION_DISPOSITION_MODE_UNAVAILABLE");
  assert.deepEqual(unavailableBody.error.details?.selectableModes, ["ACCEPT_STATIC"]);

  const stale = await request(app, "/v1/revisions/revision_m1_1/animation-disposition", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision: 99, mode: "ACCEPT_STATIC", reason: "陈旧请求" }),
  });
  assert.equal(stale.status, 409);
  assert.equal(((await stale.json()) as { error: { code: string } }).error.code, "STALE_REVISION");

  // 失败请求不得创建任何新修订
  assert.equal(
    await prisma.lessonPlanRevision.count({ where: { lessonPlanId: "lesson_m1_1" } }),
    1,
  );
});

// ── 10. 静态页面不接受处置选择 ─────────────────────────────────────────────

test("零动画页面拒绝处置选择（无需处置）", async () => {
  const withoutEffect = AnimationManifestV1Schema.parse({
    ...animatedManifest(),
    slides: [staticAnimationFixture(1), staticAnimationFixture(2)],
    supportAssessment: { levels: ["METADATA_SUPPORTED"], summary: "两页均无动画。" },
  });
  const seeded = await seedPresentation({ manifest: withoutEffect });
  const app = createApplication({ prisma, assetRoot, internalToken });

  const response = await request(app, "/v1/revisions/revision_m1_1/animation-disposition", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision: 1, mode: "ACCEPT_STATIC", reason: "误选" }),
  });
  assert.equal(response.status, 409);
  assert.equal(((await response.json()) as { error: { code: string } }).error.code, "ANIMATION_NOT_PRESENT");
  assert.equal(
    await prisma.lessonPlanRevision.count({ where: { lessonPlanId: "lesson_m1_1" } }),
    1,
  );
});
