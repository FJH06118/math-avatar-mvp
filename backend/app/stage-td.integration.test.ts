import "dotenv/config";

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import {
  AudioTaskResponseSchema,
  AudioTimelineResponseSchema,
  LessonPlanRevisionSchema,
  TeachingSettingsResponseSchema,
  TracerTaskResponseSchema,
  type LessonPlanRevision,
} from "@ppt-digital-human/contracts";
import type { Prisma } from "../generated/prisma/client.ts";
import { EdgeTtsAudioAdapter, type AudioAdapter } from "./audio-adapter.ts";
import { runClaimedAudioStep } from "./audio-worker.ts";
import { createApplication } from "./app.ts";
import { clearProductState, createProductPool, createProductPrismaClient } from "./database.ts";
import { dispatchPendingOutbox } from "./dispatcher.ts";
import { claimNextProductStep } from "./product-lease.ts";
import { LocalAssetStore } from "./storage.ts";
import { WorkerError } from "./worker-error.ts";

const databaseUrl = process.env.PPT_DH_DATABASE_URL ?? process.env.PPT_DH_T0_DATABASE_URL;
if (!databaseUrl) throw new Error("PPT_DH_DATABASE_URL is required for stage T-D integration tests.");

const prisma = createProductPrismaClient(databaseUrl);
const pool = createProductPool(databaseUrl);
const internalToken = "stage-td-integration-token";
const principal = "internal-test-user";
let assetRoot = "";
let attemptRoot = "";

before(async () => {
  assetRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-td-assets-"));
  attemptRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-td-attempts-"));
});
beforeEach(async () => clearProductState(prisma));
after(async () => {
  await prisma.$disconnect();
  await pool.end();
  await rm(assetRoot, { recursive: true, force: true });
  await rm(attemptRoot, { recursive: true, force: true });
});

test("AUDIO freezes approved text, retries one sentence, and derives a real timeline", async () => {
  const seeded = await seedApprovedPresentation();
  const app = createApplication({ prisma, assetRoot, internalToken });
  const body = {
    presentationId: seeded.presentationId,
    idempotencyKey: "stage-td-audio-key",
    voice: "zh-CN-YunxiNeural",
    rate: "-8%",
    pitch: "-2Hz",
  };
  const createdResponse = await request(app, `/v1/projects/${seeded.projectId}/audio`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal(createdResponse.status, 201);
  const task = AudioTaskResponseSchema.parse(await createdResponse.json()).data;
  assert.equal(task.progressTotal, 4);
  const replay = await request(app, `/v1/projects/${seeded.projectId}/audio`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal(replay.status, 200);
  assert.equal(AudioTaskResponseSchema.parse(await replay.json()).data.id, task.id);

  const firstRevision = await prisma.lessonPlanRevision.findUniqueOrThrow({ where: { id: seeded.revisionIds[0] } });
  const changed = { ...(firstRevision.payload as object), narration: [{ id: "narration_changed", displayText: "changed", spokenText: "changed" }] };
  await prisma.lessonPlanRevision.update({ where: { id: firstRevision.id }, data: { payload: changed as Prisma.InputJsonValue } });

  assert.equal(await dispatchPendingOutbox(prisma), 1);
  assert.equal(await prisma.generationTaskStep.count({ where: { taskId: task.id, stage: "AUDIO" } }), 4);
  const adapter = new RetryOnceAudioAdapter("第二句");
  let retries = 0;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const claim = await claimNextProductStep(pool, "td-audio-worker", 8_000, 3, "AUDIO");
    if (!claim) break;
    if (iteration === 0) {
      const runningTask = TracerTaskResponseSchema.parse(await (await request(app, `/v1/tasks/${task.id}`)).json()).data;
      assert.equal(runningTask.currentSlideId, "slide_td_1");
    }
    const result = await runClaimedAudioStep({
      prisma, pool, assets: new LocalAssetStore(assetRoot), adapter, attemptRoot, leaseMs: 8_000,
    }, claim, "td-audio-worker");
    if (result === "QUEUED") retries += 1;
  }
  assert.equal(retries, 1);
  assert.equal(adapter.calls.filter((text) => text === "第二句").length, 2);
  assert.equal(adapter.calls.includes("changed"), false);
  const completed = await prisma.generationTask.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal(completed.status, "SUCCEEDED");
  assert.equal(completed.progressCompleted, 4);

  const timelineResponse = await request(app, `/v1/tasks/${task.id}/audio`);
  assert.equal(timelineResponse.status, 200);
  const timeline = AudioTimelineResponseSchema.parse(await timelineResponse.json()).data;
  assert.equal(timeline.segments.length, 4);
  assert.equal(timeline.cues.length, 4);
  assert.equal(timeline.segments[0].spokenText, "第一句");
  for (let index = 1; index < timeline.cues.length; index += 1) {
    assert.equal(timeline.cues[index].startMs, timeline.cues[index - 1].endMs);
  }
  assert.equal(timeline.totalDurationMs, timeline.cues.at(-1)?.endMs);
  const srt = await prisma.asset.findUniqueOrThrow({ where: { id: timeline.srtAssetId } });
  const srtText = await readFile(new LocalAssetStore(assetRoot).resolveForRead(srt.storageKey), "utf8");
  assert.match(srtText, /00:00:00,000 --> 00:00:00,70[0-9]/);
  assert.equal(await prisma.audioSegment.count({ where: { taskId: task.id } }), 4);
  const timingRows = await prisma.audioSegment.findMany({ where: { taskId: task.id }, select: { timingMetadata: true } });
  assert(timingRows.every((row) => (row.timingMetadata as { status?: string } | null)?.status === "UNAVAILABLE"));
  assert.equal(await prisma.subtitleCue.count({ where: { taskId: task.id } }), 4);
});

test("AUDIO refuses an unapproved current revision and cancellation prevents claims", async () => {
  const seeded = await seedApprovedPresentation();
  await prisma.lessonPlanRevision.update({ where: { id: seeded.revisionIds[0] }, data: { approvalStatus: "pending" } });
  const app = createApplication({ prisma, assetRoot, internalToken });
  const input = { presentationId: seeded.presentationId, idempotencyKey: "stage-td-requires-approval", voice: "zh-CN-YunxiNeural", rate: "+0%", pitch: "+0Hz" };
  assert.equal((await request(app, `/v1/projects/${seeded.projectId}/audio`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) })).status, 409);
  await prisma.lessonPlanRevision.update({ where: { id: seeded.revisionIds[0] }, data: { approvalStatus: "approved" } });
  const created = await request(app, `/v1/projects/${seeded.projectId}/audio`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const task = AudioTaskResponseSchema.parse(await created.json()).data;
  await dispatchPendingOutbox(prisma);
  assert.equal((await request(app, `/v1/tasks/${task.id}/cancel`, { method: "POST" })).status, 200);
  assert.equal(await claimNextProductStep(pool, "td-cancel-worker", 8_000, 3, "AUDIO"), null);
});

test("Stage 7 persists settings and serves an authorized generated voice preview", async () => {
  const seeded = await seedApprovedPresentation();
  await prisma.lessonPlanRevision.update({ where: { id: seeded.revisionIds[0] }, data: { approvalStatus: "pending" } });
  const app = createApplication({ prisma, assetRoot, internalToken });

  const settings = {
    avatarId: "avatar-teacher-lin", voiceId: "voice-qinghe", speechRate: 1.1,
    captionsEnabled: true, captionStyle: "clear", avatarPosition: "right", background: "light",
    slideOverrides: [{ slideId: "slide_td_1", avatarPosition: "hidden" }],
  };
  const settingsResponse = await request(app, `/v1/projects/${seeded.projectId}/settings`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: 1, settings }),
  });
  assert.equal(settingsResponse.status, 200);
  assert.deepEqual(TeachingSettingsResponseSchema.parse(await settingsResponse.json()).data.slideOverrides, settings.slideOverrides);
  assert.equal((await request(app, `/v1/projects/${seeded.projectId}/settings`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: 1, settings }),
  })).status, 409);

  const previewResponse = await request(app, `/v1/projects/${seeded.projectId}/voice-previews`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      presentationId: seeded.presentationId, idempotencyKey: "stage-seven-preview", voice: "zh-CN-XiaoxiaoNeural", rate: "+10%", pitch: "+0Hz",
    }),
  });
  assert.equal(previewResponse.status, 201);
  const task = AudioTaskResponseSchema.parse(await previewResponse.json()).data;
  assert.equal(task.progressTotal, 1);
  assert.equal(await dispatchPendingOutbox(prisma), 1);
  const claim = await claimNextProductStep(pool, "stage-seven-preview-worker", 8_000, 3, "AUDIO");
  assert(claim);
  assert.equal(await runClaimedAudioStep({
    prisma, pool, assets: new LocalAssetStore(assetRoot), adapter: new RetryOnceAudioAdapter("never"), attemptRoot, leaseMs: 8_000,
  }, claim, "stage-seven-preview-worker"), "SUCCEEDED");

  const timelineResponse = await request(app, `/v1/tasks/${task.id}/audio`);
  const timeline = AudioTimelineResponseSchema.parse(await timelineResponse.json()).data;
  assert.equal(timeline.rate, "+10%");
  assert.equal(timeline.segments[0]?.spokenText, "生活就像海洋，只有意志坚强的人才能到达彼岸。");
  const previewUrl = timeline.segments[0]?.previewUrl;
  assert(previewUrl);
  const media = await request(app, previewUrl.replace("/api/t", "/v1"));
  assert.equal(media.status, 200);
  assert.equal(media.headers.get("content-type"), "audio/mpeg");
  assert((await media.arrayBuffer()).byteLength > 2_000);
  const forbiddenHeaders = new Headers({ "X-Internal-Token": internalToken, "X-Principal": "another-user" });
  assert.equal((await app.request(previewUrl.replace("/api/t", "/v1"), { headers: forbiddenHeaders })).status, 404);

  const cachedResponse = await request(app, `/v1/projects/${seeded.projectId}/voice-previews`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      presentationId: seeded.presentationId, idempotencyKey: "stage-seven-preview-cache", voice: "zh-CN-XiaoxiaoNeural", rate: "+10%", pitch: "+0Hz",
    }),
  });
  const cachedTask = AudioTaskResponseSchema.parse(await cachedResponse.json()).data;
  assert.equal(await dispatchPendingOutbox(prisma), 1);
  const cachedClaim = await claimNextProductStep(pool, "stage-seven-cache-worker", 8_000, 3, "AUDIO");
  assert(cachedClaim);
  const cacheMissAdapter = new RetryOnceAudioAdapter("never");
  assert.equal(await runClaimedAudioStep({
    prisma, pool, assets: new LocalAssetStore(assetRoot), adapter: cacheMissAdapter, attemptRoot, leaseMs: 8_000,
  }, cachedClaim, "stage-seven-cache-worker"), "SUCCEEDED");
  assert.equal(cacheMissAdapter.calls.length, 0);
  assert.equal((await prisma.audioSegment.findFirstOrThrow({ where: { taskId: cachedTask.id } })).assetId, timeline.segments[0]!.assetId);
});

test("real Edge TTS produces decodable non-silent Chinese audio", {
  skip: process.env.PPT_DH_STAGE_TD_REAL_EDGE !== "1" ? "external Edge validation is opt-in" : false,
}, async () => {
  const result = await new EdgeTtsAudioAdapter().run({
    text: "这是阶段 T-D 的合成验证。",
    voice: "zh-CN-YunxiNeural",
    rate: "-8%",
    pitch: "-2Hz",
    attemptDir: join(attemptRoot, "real-edge", `attempt-${Date.now()}`),
    signal: new AbortController().signal,
  });
  assert(result.bytes.byteLength > 2_000);
  assert(result.durationMs >= 200);
});

class RetryOnceAudioAdapter implements AudioAdapter {
  readonly calls: string[] = [];
  private failed = false;
  constructor(private readonly failText: string) {}
  async run(input: Parameters<AudioAdapter["run"]>[0]) {
    this.calls.push(input.text);
    if (input.text === this.failText && !this.failed) {
      this.failed = true;
      throw new WorkerError("EDGE_TTS_TRANSIENT", "临时语音服务故障。", true);
    }
    return { bytes: Buffer.alloc(3_000, this.calls.length), durationMs: 700 + input.text.length };
  }
}

async function seedApprovedPresentation() {
  const projectId = "project_stage_td";
  const presentationId = "presentation_stage_td";
  const sourceAssetId = "asset_source_td";
  await prisma.project.create({ data: { id: projectId, principal, title: "T-D fixture", status: "READY" } });
  await prisma.asset.create({ data: { id: sourceAssetId, projectId, kind: "SOURCE_PPT", storageKey: "fixture/source.pptx", sha256: "a".repeat(64), mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", fileSize: 1 } });
  await prisma.presentation.create({ data: { id: presentationId, projectId, sourceAssetId, originalFileName: "fixture.pptx", sha256: "a".repeat(64), fileSize: 1, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", slideCount: 2, parseStatus: "COMPLETED", parserVersion: "fixture" } });
  const revisionIds: string[] = [];
  for (let index = 1; index <= 2; index += 1) {
    const slideId = `slide_td_${index}`;
    const renderAssetId = `asset_render_td_${index}`;
    const lessonPlanId = `lesson_td_${index}`;
    const revisionId = `revision_td_${index}`;
    revisionIds.push(revisionId);
    await prisma.asset.create({ data: { id: renderAssetId, projectId, kind: "SLIDE_RENDER", storageKey: `fixture/${index}.png`, sha256: String(index).repeat(64), mimeType: "image/png", fileSize: 1 } });
    await prisma.slide.create({ data: { id: slideId, projectId, presentationId, slideNumber: index, title: `第${index}页`, slideType: "concept", extractedText: "fixture", notes: "", formulaJson: [], renderAssetId, parseWarnings: [] } });
    await prisma.lessonPlan.create({ data: { id: lessonPlanId, projectId, presentationId, slideId, currentRevision: 1 } });
    const narration = [1, 2].map((segment) => ({
      id: `narration_td_${index}_${segment}`,
      displayText: index === 1 ? (segment === 1 ? "第一句" : "第二句") : `第${index}页第${segment}句`,
      spokenText: index === 1 ? (segment === 1 ? "第一句" : "第二句") : `第${index}页第${segment}句`,
    }));
    const payload: LessonPlanRevision = LessonPlanRevisionSchema.parse({
      id: revisionId, lessonPlanId, slideId, revision: 1, teachingGoal: "fixture", narration, derivation: [],
      scenes: [{ id: `scene_td_${index}`, sourceSlides: [slideId], baseSlide: { sourceAssetId: renderAssetId, preservationMode: "FULL_PRESERVE", fit: "contain", mustShowFullSlide: true, fullSlideDurationMs: 3_000, fullRedesignAuthorizedByUser: false }, durationMs: 3_000, isSkipped: false }],
      sourceSlideCoverage: [slideId], preservationMode: "FULL_PRESERVE", estimatedDurationMs: 3_000,
      modelProvider: "fixture", modelName: "fixture", promptVersion: "fixture", schemaVersion: "stage-tc-agent-v1", inputHash: "input", outputHash: "output", createdBy: "agent", createdAt: new Date().toISOString(),
      approval: { status: "approved", approvedBy: principal, approvedAt: new Date().toISOString() },
    });
    await prisma.lessonPlanRevision.create({ data: { id: revisionId, lessonPlanId, slideId, revision: 1, payload: payload as unknown as Prisma.InputJsonValue, inputHash: payload.inputHash, outputHash: payload.outputHash, modelProvider: payload.modelProvider, modelName: payload.modelName, promptVersion: payload.promptVersion, schemaVersion: payload.schemaVersion, createdBy: payload.createdBy, approvalStatus: "approved", approvedBy: principal, approvedAt: new Date() } });
  }
  return { projectId, presentationId, revisionIds };
}

function request(app: ReturnType<typeof createApplication>, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("X-Internal-Token", internalToken);
  headers.set("X-Principal", principal);
  return app.request(path, { ...init, headers });
}
