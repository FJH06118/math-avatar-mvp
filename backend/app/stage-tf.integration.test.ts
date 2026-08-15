import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import sharp from "sharp";
import { CompositeTaskResponseSchema, FinalMediaResponseSchema, LessonPlanRevisionSchema, type LessonPlanRevision, type MediaValidationReport } from "@ppt-digital-human/contracts";
import type { Prisma } from "../generated/prisma/client.ts";
import { createApplication } from "./app.ts";
import { clearProductState, createProductPool, createProductPrismaClient } from "./database.ts";
import { dispatchPendingOutbox } from "./dispatcher.ts";
import { FfmpegCompositeAdapter, FfmpegMediaValidationAdapter, type MediaValidationAdapter } from "./media-adapter.ts";
import { runClaimedCompositeStep, runClaimedValidationStep } from "./media-worker.ts";
import { claimNextProductStep } from "./product-lease.ts";
import { SharpFfmpegPageRenderAdapter } from "./render-adapter.ts";
import { LocalAssetStore } from "./storage.ts";

const databaseUrl = process.env.PPT_DH_DATABASE_URL ?? process.env.PPT_DH_T0_DATABASE_URL;
if (!databaseUrl) throw new Error("PPT_DH_DATABASE_URL is required for stage T-F integration tests.");
const prisma = createProductPrismaClient(databaseUrl); const pool = createProductPool(databaseUrl);
const require = createRequire(import.meta.url); const ffmpeg = (require("@ffmpeg-installer/ffmpeg") as { path: string }).path;
const principal = "internal-test-user"; const internalToken = "stage-tf-token";
let assetRoot = ""; let attemptRoot = "";
before(async () => { assetRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-tf-assets-")); attemptRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-tf-attempts-")); });
beforeEach(async () => clearProductState(prisma));
after(async () => { await prisma.$disconnect(); await pool.end(); await rm(assetRoot, { recursive: true, force: true }); await rm(attemptRoot, { recursive: true, force: true }); });

test("COMPOSITE stays non-terminal until all media hard gates pass", async () => {
  const seeded = await seedRenderedPages(); const app = createApplication({ prisma, assetRoot, internalToken });
  const task = await createComposite(app, seeded, "stage-tf-composite-key");
  await dispatchPendingOutbox(prisma);
  const compositeClaim = await claimNextProductStep(pool, "tf-composite", 30_000, 3, "COMPOSITE"); assert(compositeClaim);
  assert.equal(await runClaimedCompositeStep({ prisma, pool, assets: new LocalAssetStore(assetRoot), adapter: new FfmpegCompositeAdapter(), attemptRoot, leaseMs: 30_000 }, compositeClaim, "tf-composite"), "SUCCEEDED");
  const pendingValidation = await prisma.generationTask.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal(pendingValidation.status, "QUEUED"); assert.equal(pendingValidation.stage, "VALIDATE");
  assert.equal((await request(app, `/v1/tasks/${task.id}/media?projectId=${seeded.projectId}`)).status, 409);
  const validateClaim = await claimNextProductStep(pool, "tf-validate", 30_000, 3, "VALIDATE"); assert(validateClaim);
  assert.equal(await runClaimedValidationStep({ prisma, pool, assets: new LocalAssetStore(assetRoot), adapter: new FfmpegMediaValidationAdapter(), attemptRoot, leaseMs: 30_000 }, validateClaim, "tf-validate"), "SUCCEEDED");
  const response = await request(app, `/v1/tasks/${task.id}/media?projectId=${seeded.projectId}`); assert.equal(response.status, 200);
  const media = FinalMediaResponseSchema.parse(await response.json()).data;
  assert.equal(media.validation.status, "passed"); assert.deepEqual(media.validation.pageCoverage, [1, 2, 3]);
  assert.equal(media.validation.videoCodec, "h264"); assert.equal(media.validation.audioCodec, "aac");
  assert.equal(media.validation.pixelFormat, "yuv420p"); assert.equal(media.validation.fastStart, true);
  assert.equal(media.validation.fullDecode, true); assert.equal(media.validation.nonSilent, true);
  assert(media.validation.meanVolumeDb >= -35 && media.validation.meanVolumeDb <= -8);
  assert(media.validation.peakVolumeDb < -0.05);
  assert.equal(media.validation.obstructionClear, true); assert.equal(media.validation.errors.length, 0);
  const terminal = await prisma.generationTask.findUniqueOrThrow({ where: { id: task.id }, include: { steps: true, mediaOutput: { include: { videoAsset: true, validation: true } } } });
  assert.equal(terminal.status, "SUCCEEDED"); assert.equal(terminal.mediaOutput?.status, "VALIDATED");
  assert.equal(terminal.mediaOutput?.videoAsset.lifecycle, "AVAILABLE"); assert.equal(terminal.mediaOutput?.validation?.status, "passed");
  assert.equal(terminal.steps.find((step) => step.stage === "VALIDATE")?.status, "SUCCEEDED");
});

test("a failed hard gate rejects the candidate and fails the task", async () => {
  const seeded = await seedRenderedPages(); const app = createApplication({ prisma, assetRoot, internalToken });
  const task = await createComposite(app, seeded, "stage-tf-reject-key"); await dispatchPendingOutbox(prisma);
  const compositeClaim = await claimNextProductStep(pool, "tf-composite-fail", 30_000, 3, "COMPOSITE"); assert(compositeClaim);
  await runClaimedCompositeStep({ prisma, pool, assets: new LocalAssetStore(assetRoot), adapter: new FfmpegCompositeAdapter(), attemptRoot, leaseMs: 30_000 }, compositeClaim, "tf-composite-fail");
  const validateClaim = await claimNextProductStep(pool, "tf-validate-fail", 30_000, 3, "VALIDATE"); assert(validateClaim);
  assert.equal(await runClaimedValidationStep({ prisma, pool, assets: new LocalAssetStore(assetRoot), adapter: new RejectingValidator(), attemptRoot, leaseMs: 30_000 }, validateClaim, "tf-validate-fail"), "FAILED");
  const failed = await prisma.generationTask.findUniqueOrThrow({ where: { id: task.id }, include: { mediaOutput: { include: { videoAsset: true } } } });
  assert.equal(failed.status, "FAILED"); assert.equal(failed.mediaOutput?.status, "REJECTED"); assert.equal(failed.mediaOutput?.videoAsset.lifecycle, "INVALID");
  assert.equal((await request(app, `/v1/tasks/${task.id}/media?projectId=${seeded.projectId}`)).status, 409);
  assert.equal((await request(app, `/v1/tasks/${task.id}/delivery?projectId=${seeded.projectId}`)).status, 404);
});

test("validation rejects a candidate whose persisted bytes no longer match its asset record", async () => {
  const seeded = await seedRenderedPages(); const app = createApplication({ prisma, assetRoot, internalToken });
  const task = await createComposite(app, seeded, "stage-tf-integrity-key"); await dispatchPendingOutbox(prisma);
  const compositeClaim = await claimNextProductStep(pool, "tf-composite-integrity", 30_000, 3, "COMPOSITE"); assert(compositeClaim);
  await runClaimedCompositeStep({ prisma, pool, assets: new LocalAssetStore(assetRoot), adapter: new FfmpegCompositeAdapter(), attemptRoot, leaseMs: 30_000 }, compositeClaim, "tf-composite-integrity");
  const output = await prisma.mediaOutput.findUniqueOrThrow({ where: { taskId: task.id }, include: { videoAsset: true } });
  const store = new LocalAssetStore(assetRoot); await writeFile(store.resolveForRead(output.videoAsset.storageKey), Buffer.from("corrupted"));
  const validateClaim = await claimNextProductStep(pool, "tf-validate-integrity", 30_000, 3, "VALIDATE"); assert(validateClaim);
  assert.equal(await runClaimedValidationStep({ prisma, pool, assets: store, adapter: new FfmpegMediaValidationAdapter(), attemptRoot, leaseMs: 30_000 }, validateClaim, "tf-validate-integrity"), "FAILED");
  const failed = await prisma.generationTask.findUniqueOrThrow({ where: { id: task.id }, include: { mediaOutput: { include: { videoAsset: true } } } });
  assert.equal(failed.errorCode, "MEDIA_ASSET_INTEGRITY_FAILED"); assert.equal(failed.mediaOutput?.status, "REJECTED");
  assert.equal(failed.mediaOutput?.videoAsset.lifecycle, "INVALID");
});

class RejectingValidator implements MediaValidationAdapter {
  async run(input: Parameters<MediaValidationAdapter["run"]>[0]): Promise<MediaValidationReport> {
    return { status: "failed", videoCodec: "h264", audioCodec: "aac", pixelFormat: "yuv420p", fps: input.fps, width: 1920, height: 1080, durationMs: input.expectedDurationMs, expectedDurationMs: input.expectedDurationMs, fastStart: false, fullDecode: true, nonSilent: true, meanVolumeDb: -21, peakVolumeDb: -18, maxBlackDurationMs: 0, pageCount: input.expectedPageCount, pageCoverage: [1, 2, 3], obstructionClear: true, errors: ["FAST_START_MISSING"] };
  }
}

async function createComposite(app: ReturnType<typeof createApplication>, seeded: Awaited<ReturnType<typeof seedRenderedPages>>, key: string) {
  const response = await request(app, `/v1/projects/${seeded.projectId}/composites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ presentationId: seeded.presentationId, renderTaskId: seeded.renderTaskId, audioTaskId: seeded.audioTaskId, idempotencyKey: key }) });
  assert.equal(response.status, 201); return CompositeTaskResponseSchema.parse(await response.json()).data;
}

async function seedRenderedPages() {
  const projectId = "project_stage_tf", presentationId = "presentation_stage_tf", audioTaskId = "task_audio_tf", renderTaskId = "task_render_tf";
  const store = new LocalAssetStore(assetRoot);
  await prisma.project.create({ data: { id: projectId, principal, title: "T-F fixture", status: "READY" } });
  await prisma.asset.create({ data: { id: "asset_source_tf", projectId, kind: "SOURCE_PPT", storageKey: "fixture/source-tf.pptx", sha256: "f".repeat(64), mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", fileSize: 1 } });
  await prisma.presentation.create({ data: { id: presentationId, projectId, sourceAssetId: "asset_source_tf", originalFileName: "fixture.pptx", sha256: "f".repeat(64), fileSize: 1, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", slideCount: 3, parseStatus: "COMPLETED", parserVersion: "fixture" } });
  await prisma.generationTask.create({ data: { id: audioTaskId, principal, projectId, presentationId, kind: "AUDIO", idempotencyKey: "audio-tf", inputHash: "audio", configHash: "audio", status: "SUCCEEDED", stage: "AUDIO", progressCompleted: 3, progressTotal: 3, completedAt: new Date() } });
  await prisma.generationTask.create({ data: { id: renderTaskId, principal, projectId, presentationId, kind: "GENERATE", idempotencyKey: "render-tf", inputHash: "render", configHash: "render", status: "SUCCEEDED", stage: "PAGE_RENDER", progressCompleted: 3, progressTotal: 3, completedAt: new Date() } });
  await prisma.taskOutbox.create({ data: { id: "outbox-render-tf", taskId: renderTaskId, eventKey: "render.requested:render-tf", eventType: "RENDER_REQUESTED", payload: { audioTaskId }, publishedAt: new Date() } });
  const temp = await mkdtemp(join(tmpdir(), "ppt-dh-tf-tone-")); const tonePath = join(temp, "tone.mp3");
  execFileSync(ffmpeg, ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=550:duration=1.65", "-ar", "24000", "-ac", "1", "-b:a", "48k", tonePath]);
  const tone = await readFile(tonePath); await rm(temp, { recursive: true, force: true });
  const toneSha = createHash("sha256").update(tone).digest("hex"); const toneKey = await store.putAudioSegment(projectId, toneSha, tone);
  await prisma.asset.create({ data: { id: "asset_audio_tf", projectId, taskId: audioTaskId, kind: "AUDIO_SEGMENT", storageKey: toneKey, sha256: toneSha, mimeType: "audio/mpeg", fileSize: tone.byteLength } });
  let cursor = 0;
  const srtParts: string[] = [];
  for (let index = 1; index <= 3; index += 1) {
    const slideId = `slide_tf_${index}`, revisionId = `revision_tf_${index}`, lessonPlanId = `lesson_tf_${index}`;
    const sourceBytes = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: { r: 230 + index * 5, g: 240, b: 250 - index * 8 } } }).png().toBuffer();
    const sourceSha = createHash("sha256").update(sourceBytes).digest("hex"); const sourceKey = await store.putSlideRender(projectId, sourceSha, sourceBytes);
    await prisma.asset.create({ data: { id: `asset_source_page_tf_${index}`, projectId, kind: "SLIDE_RENDER", storageKey: sourceKey, sha256: sourceSha, mimeType: "image/png", fileSize: sourceBytes.byteLength } });
    await prisma.slide.create({ data: { id: slideId, projectId, presentationId, slideNumber: index, title: `第${index}页`, slideType: "concept", extractedText: "fixture", notes: "", formulaJson: [], renderAssetId: `asset_source_page_tf_${index}`, parseWarnings: [] } });
    await prisma.lessonPlan.create({ data: { id: lessonPlanId, projectId, presentationId, slideId, currentRevision: 1 } });
    const revision: LessonPlanRevision = LessonPlanRevisionSchema.parse({ id: revisionId, lessonPlanId, slideId, revision: 1, teachingGoal: "fixture", narration: [{ id: `narration_tf_${index}`, displayText: `第${index}页`, spokenText: `第${index}页` }], derivation: [], scenes: [{ id: `scene_tf_${index}`, sourceSlides: [slideId], baseSlide: { sourceAssetId: `asset_source_page_tf_${index}`, preservationMode: "FULL_PRESERVE", fit: "contain", mustShowFullSlide: true, fullSlideDurationMs: 1650, fullRedesignAuthorizedByUser: false }, durationMs: 1650, isSkipped: false }], sourceSlideCoverage: [slideId], preservationMode: "FULL_PRESERVE", estimatedDurationMs: 1650, modelProvider: "fixture", modelName: "fixture", promptVersion: "fixture", schemaVersion: "stage-tc-agent-v1", inputHash: "input", outputHash: `output-${index}`, createdBy: "agent", createdAt: new Date().toISOString(), approval: { status: "approved", approvedBy: principal, approvedAt: new Date().toISOString() } });
    await prisma.lessonPlanRevision.create({ data: { id: revisionId, lessonPlanId, slideId, revision: 1, payload: revision as unknown as Prisma.InputJsonValue, inputHash: revision.inputHash, outputHash: revision.outputHash, modelProvider: revision.modelProvider, modelName: revision.modelName, promptVersion: revision.promptVersion, schemaVersion: revision.schemaVersion, createdBy: revision.createdBy, approvalStatus: "approved", approvedBy: principal, approvedAt: new Date() } });
    const rendered = await new SharpFfmpegPageRenderAdapter().run({ sourcePath: store.resolveForRead(sourceKey), audioPaths: [store.resolveForRead(toneKey)], durationMs: 1650, fps: 25, pageOrder: index, pageCount: 3, avatarPlacement: "right-panel", attemptDir: join(attemptRoot, `seed-page-${index}-${Date.now()}`), signal: new AbortController().signal });
    const frameSha = createHash("sha256").update(rendered.frameBytes).digest("hex"), videoSha = createHash("sha256").update(rendered.videoBytes).digest("hex");
    const frameKey = await store.putPageFrame(projectId, frameSha, rendered.frameBytes), videoKey = await store.putPageVideo(projectId, videoSha, rendered.videoBytes);
    await prisma.asset.create({ data: { id: `asset_frame_tf_${index}`, projectId, taskId: renderTaskId, kind: "PAGE_FRAME", storageKey: frameKey, sha256: frameSha, mimeType: "image/png", fileSize: rendered.frameBytes.byteLength } });
    await prisma.asset.create({ data: { id: `asset_video_tf_${index}`, projectId, taskId: renderTaskId, kind: "PAGE_VIDEO", storageKey: videoKey, sha256: videoSha, mimeType: "video/mp4", fileSize: rendered.videoBytes.byteLength } });
    await prisma.renderedPage.create({ data: { id: `rendered_page_tf_${index}`, taskId: renderTaskId, slideId, revisionId, pageOrder: index, durationMs: 1650, fps: 25, width: 1920, height: 1080, frameAssetId: `asset_frame_tf_${index}`, videoAssetId: `asset_video_tf_${index}`, frameSha256: frameSha, videoSha256: videoSha, avatarPlacement: "right-panel", inputHash: `input-${index}` } });
    srtParts.push(`${index}\n${srtTime(cursor)} --> ${srtTime(cursor + 1650)}\n第${index}页`); cursor += 1650;
  }
  const srt = Buffer.from(`${srtParts.join("\n\n")}\n`, "utf8"); const srtSha = createHash("sha256").update(srt).digest("hex"), srtKey = await store.putCaptions(projectId, srtSha, srt);
  await prisma.asset.create({ data: { id: "asset_srt_tf", projectId, taskId: audioTaskId, kind: "CAPTIONS_SRT", storageKey: srtKey, sha256: srtSha, mimeType: "application/x-subrip; charset=utf-8", fileSize: srt.byteLength } });
  await prisma.audioTimelineRecord.create({ data: { id: "timeline_tf", taskId: audioTaskId, srtAssetId: "asset_srt_tf", totalDurationMs: cursor } });
  return { projectId, presentationId, audioTaskId, renderTaskId };
}

function srtTime(ms: number) { const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000), x = ms % 1000; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")},${String(x).padStart(3,"0")}`; }
function request(app: ReturnType<typeof createApplication>, path: string, init: RequestInit = {}) { const headers = new Headers(init.headers); headers.set("X-Internal-Token", internalToken); headers.set("X-Principal", principal); return app.request(path, { ...init, headers }); }
