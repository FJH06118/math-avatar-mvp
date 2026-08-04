import "dotenv/config";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import sharp from "sharp";
import { LessonPlanRevisionSchema, RenderedPageListResponseSchema, RenderTaskResponseSchema, type LessonPlanRevision } from "@ppt-digital-human/contracts";
import type { Prisma } from "../generated/prisma/client.ts";
import { createApplication } from "./app.ts";
import { clearProductState, createProductPool, createProductPrismaClient } from "./database.ts";
import { dispatchPendingOutbox } from "./dispatcher.ts";
import { SharpFfmpegPageRenderAdapter, type PageRenderAdapter } from "./render-adapter.ts";
import { runClaimedRenderStep } from "./render-worker.ts";
import { claimNextProductStep } from "./product-lease.ts";
import { LocalAssetStore } from "./storage.ts";
import { stableId } from "./lesson-plan-builder.ts";
import { WorkerError } from "./worker-error.ts";

const databaseUrl = process.env.PPT_DH_DATABASE_URL ?? process.env.PPT_DH_T0_DATABASE_URL;
if (!databaseUrl) throw new Error("PPT_DH_DATABASE_URL is required for stage T-E integration tests.");
const prisma = createProductPrismaClient(databaseUrl);
const pool = createProductPool(databaseUrl);
const require = createRequire(import.meta.url);
const ffmpegValue = require("@ffmpeg-installer/ffmpeg") as { path: string };
const principal = "internal-test-user";
const internalToken = "stage-te-token";
let assetRoot = "";
let attemptRoot = "";

before(async () => {
  assetRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-te-assets-"));
  attemptRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-te-attempts-"));
});
beforeEach(async () => clearProductState(prisma));
after(async () => {
  await prisma.$disconnect(); await pool.end();
  await rm(assetRoot, { recursive: true, force: true }); await rm(attemptRoot, { recursive: true, force: true });
});

test("PAGE_RENDER freezes three approved pages and retries only the failed page", async () => {
  const seeded = await seedReadyAudio();
  const app = createApplication({ prisma, assetRoot, internalToken });
  const body = { presentationId: seeded.presentationId, audioTaskId: seeded.audioTaskId, idempotencyKey: "stage-te-render-key", fps: 25 };
  const created = await request(app, `/v1/projects/${seeded.projectId}/renders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(created.status, 201);
  const task = RenderTaskResponseSchema.parse(await created.json()).data;
  assert.equal(task.progressTotal, 3);
  assert.equal((await request(app, `/v1/projects/${seeded.projectId}/renders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).status, 200);
  await prisma.lessonPlanRevision.update({ where: { id: seeded.revisionIds[0] }, data: { payload: { changedAfterFreeze: true } } });
  assert.equal(await dispatchPendingOutbox(prisma), 1);
  assert.equal(await prisma.generationTaskStep.count({ where: { taskId: task.id, stage: "PAGE_RENDER" } }), 3);
  const adapter = new RetryPageAdapter(new SharpFfmpegPageRenderAdapter(), 2);
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const claim = await claimNextProductStep(pool, "te-worker", 20_000, 3, "PAGE_RENDER");
    if (!claim) break;
    await runClaimedRenderStep({ prisma, pool, assets: new LocalAssetStore(assetRoot), adapter, attemptRoot, leaseMs: 20_000 }, claim, "te-worker");
  }
  assert.deepEqual(adapter.calls, [1, 2, 2, 3]);
  const completed = await prisma.generationTask.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal(completed.status, "SUCCEEDED");
  const response = await request(app, `/v1/tasks/${task.id}/pages`);
  assert.equal(response.status, 200);
  const pages = RenderedPageListResponseSchema.parse(await response.json()).data;
  assert.equal(pages.length, 3);
  assert.deepEqual(pages.map((page) => page.pageOrder), [1, 2, 3]);
  assert(pages.every((page) => page.durationMs >= 1_500 && page.fps === 25 && page.avatarPlacement === "right-panel"));
  assert.equal(pages[0].overlayType, "highlightBox");
  for (const page of pages) {
    const assets = await prisma.asset.findMany({ where: { id: { in: [page.frameAssetId, page.videoAssetId] } } });
    assert.equal(assets.length, 2);
    for (const asset of assets) assert((await readFile(new LocalAssetStore(assetRoot).resolveForRead(asset.storageKey))).byteLength > 2_000);
  }
});

test("active PAGE_RENDER cancellation aborts the adapter and keeps CANCELLED terminal", async () => {
  const seeded = await seedReadyAudio();
  const app = createApplication({ prisma, assetRoot, internalToken });
  const created = await request(app, `/v1/projects/${seeded.projectId}/renders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ presentationId: seeded.presentationId, audioTaskId: seeded.audioTaskId, idempotencyKey: "stage-te-cancel-key", fps: 25 }) });
  const task = RenderTaskResponseSchema.parse(await created.json()).data;
  await dispatchPendingOutbox(prisma);
  const claim = await claimNextProductStep(pool, "te-cancel-worker", 300, 3, "PAGE_RENDER");
  assert(claim);
  const adapter = new BlockingRenderAdapter();
  const running = runClaimedRenderStep({ prisma, pool, assets: new LocalAssetStore(assetRoot), adapter, attemptRoot, leaseMs: 300 }, claim, "te-cancel-worker");
  await adapter.started;
  assert.equal((await request(app, `/v1/tasks/${task.id}/cancel`, { method: "POST" })).status, 200);
  assert.equal(await running, "CANCELLED");
  assert.equal((await prisma.generationTask.findUniqueOrThrow({ where: { id: task.id } })).status, "CANCELLED");
  assert.equal(await prisma.renderedPage.count({ where: { taskId: task.id } }), 0);
});

class RetryPageAdapter implements PageRenderAdapter {
  readonly calls: number[] = [];
  private failed = false;
  constructor(private readonly inner: PageRenderAdapter, private readonly failedPage: number) {}
  async run(input: Parameters<PageRenderAdapter["run"]>[0]) {
    this.calls.push(input.pageOrder);
    if (input.pageOrder === this.failedPage && !this.failed) { this.failed = true; throw new WorkerError("RENDER_TRANSIENT", "注入的分页渲染故障。", true); }
    return this.inner.run(input);
  }
}

class BlockingRenderAdapter implements PageRenderAdapter {
  private start!: () => void;
  readonly started = new Promise<void>((resolveStart) => { this.start = resolveStart; });
  async run(input: Parameters<PageRenderAdapter["run"]>[0]): Promise<never> {
    this.start();
    return new Promise((_resolve, reject) => input.signal.addEventListener("abort", () => reject(new WorkerError("RENDER_CANCELLED", "分页渲染已取消。", true)), { once: true }));
  }
}

async function seedReadyAudio() {
  const projectId = "project_stage_te";
  const presentationId = "presentation_stage_te";
  const audioTaskId = "task_audio_te";
  const store = new LocalAssetStore(assetRoot);
  await prisma.project.create({ data: { id: projectId, principal, title: "T-E fixture", status: "READY" } });
  await prisma.asset.create({ data: { id: "asset_source_te", projectId, kind: "SOURCE_PPT", storageKey: "fixture/source-te.pptx", sha256: "e".repeat(64), mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", fileSize: 1 } });
  await prisma.presentation.create({ data: { id: presentationId, projectId, sourceAssetId: "asset_source_te", originalFileName: "fixture.pptx", sha256: "e".repeat(64), fileSize: 1, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", slideCount: 3, parseStatus: "COMPLETED", parserVersion: "fixture" } });
  await prisma.generationTask.create({ data: { id: audioTaskId, principal, projectId, presentationId, kind: "AUDIO", idempotencyKey: "audio-stage-te", inputHash: "audio-input", configHash: "audio-config", status: "SUCCEEDED", stage: "AUDIO", progressCompleted: 3, progressTotal: 3, completedAt: new Date() } });
  const temp = await mkdtemp(join(tmpdir(), "ppt-dh-tone-"));
  const tonePath = join(temp, "tone.mp3");
  execFileSync(ffmpegValue.path, ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1.65", "-ar", "24000", "-ac", "1", "-b:a", "48k", tonePath]);
  const tone = await readFile(tonePath); await rm(temp, { recursive: true, force: true });
  const audioSha = createHash("sha256").update(tone).digest("hex");
  const audioKey = await store.putAudioSegment(projectId, audioSha, tone);
  await prisma.asset.create({ data: { id: "asset_audio_te", projectId, taskId: audioTaskId, kind: "AUDIO_SEGMENT", storageKey: audioKey, sha256: audioSha, mimeType: "audio/mpeg", fileSize: tone.byteLength } });
  const revisionIds: string[] = [];
  let cursor = 0;
  for (let index = 1; index <= 3; index += 1) {
    const slideId = `slide_te_${index}`;
    const renderId = `asset_render_te_${index}`;
    const renderBytes = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: { r: 245 - index * 10, g: 248, b: 255 } } }).png().toBuffer();
    const renderSha = createHash("sha256").update(renderBytes).digest("hex");
    const renderKey = await store.putSlideRender(projectId, renderSha, renderBytes);
    await prisma.asset.create({ data: { id: renderId, projectId, kind: "SLIDE_RENDER", storageKey: renderKey, sha256: renderSha, mimeType: "image/png", fileSize: renderBytes.byteLength } });
    await prisma.slide.create({ data: { id: slideId, projectId, presentationId, slideNumber: index, title: `第${index}页`, slideType: "concept", extractedText: "fixture", notes: "", formulaJson: [], renderAssetId: renderId, parseWarnings: [] } });
    const lessonPlanId = `lesson_te_${index}`;
    const revisionId = `revision_te_${index}`; revisionIds.push(revisionId);
    await prisma.lessonPlan.create({ data: { id: lessonPlanId, projectId, presentationId, slideId, currentRevision: 1 } });
    const overlay = index === 1 ? { id: "overlay_te_1", slideId, type: "highlightBox" as const, bounds: { x: .1, y: .1, width: .3, height: .2 }, color: "#ef4444" } : undefined;
    const payload: LessonPlanRevision = LessonPlanRevisionSchema.parse({
      id: revisionId, lessonPlanId, slideId, revision: 1, teachingGoal: "fixture",
      narration: [{ id: `narration_te_${index}`, displayText: `第${index}页讲解`, spokenText: `第${index}页讲解` }], derivation: [],
      scenes: [{ id: `scene_te_${index}`, sourceSlides: [slideId], baseSlide: { sourceAssetId: renderId, preservationMode: overlay ? "PRESERVE_WITH_OVERLAY" : "FULL_PRESERVE", fit: "contain", mustShowFullSlide: true, fullSlideDurationMs: 1_650, fullRedesignAuthorizedByUser: false }, durationMs: 1_650, overlay, isSkipped: false }],
      sourceSlideCoverage: [slideId], preservationMode: overlay ? "PRESERVE_WITH_OVERLAY" : "FULL_PRESERVE", estimatedDurationMs: 1_650,
      modelProvider: "fixture", modelName: "fixture", promptVersion: "fixture", schemaVersion: "stage-tc-agent-v1", inputHash: "input", outputHash: `output-${index}`, createdBy: "agent", createdAt: new Date().toISOString(), approval: { status: "approved", approvedBy: principal, approvedAt: new Date().toISOString() },
    });
    await prisma.lessonPlanRevision.create({ data: { id: revisionId, lessonPlanId, slideId, revision: 1, payload: payload as unknown as Prisma.InputJsonValue, inputHash: payload.inputHash, outputHash: payload.outputHash, modelProvider: payload.modelProvider, modelName: payload.modelName, promptVersion: payload.promptVersion, schemaVersion: payload.schemaVersion, createdBy: payload.createdBy, approvalStatus: "approved", approvedBy: principal, approvedAt: new Date() } });
    const segmentId = `audio_segment_te_${index}`;
    await prisma.audioSegment.create({ data: { id: segmentId, taskId: audioTaskId, projectId, presentationId, revisionId, slideId, narrationId: `narration_te_${index}`, slideOrder: index, segmentOrder: 0, displayText: `第${index}页讲解`, spokenText: `第${index}页讲解`, durationMs: 1_650, assetId: "asset_audio_te", sha256: audioSha, voice: "zh-CN-YunxiNeural", rate: "+0%", pitch: "+0Hz", inputHash: createHash("sha256").update(`audio-${index}`).digest("hex") } });
    await prisma.subtitleCue.create({ data: { id: `cue_te_${index}`, taskId: audioTaskId, audioSegmentId: segmentId, cueIndex: index, startMs: cursor, endMs: cursor + 1_650, text: `第${index}页讲解` } });
    cursor += 1_650;
  }
  const srt = Buffer.from("1\n00:00:00,000 --> 00:00:01,650\n第一页讲解\n", "utf8");
  const srtSha = createHash("sha256").update(srt).digest("hex");
  const srtKey = await store.putCaptions(projectId, srtSha, srt);
  await prisma.asset.create({ data: { id: "asset_srt_te", projectId, taskId: audioTaskId, kind: "CAPTIONS_SRT", storageKey: srtKey, sha256: srtSha, mimeType: "application/x-subrip; charset=utf-8", fileSize: srt.byteLength } });
  await prisma.audioTimelineRecord.create({ data: { id: stableId("audio_timeline", audioTaskId), taskId: audioTaskId, srtAssetId: "asset_srt_te", totalDurationMs: cursor } });
  return { projectId, presentationId, audioTaskId, revisionIds };
}

function request(app: ReturnType<typeof createApplication>, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers); headers.set("X-Internal-Token", internalToken); headers.set("X-Principal", principal);
  return app.request(path, { ...init, headers });
}
