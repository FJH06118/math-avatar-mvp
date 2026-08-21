import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test } from "node:test";
import {
  AudioTaskResponseSchema, CompositeTaskResponseSchema, DeliveryManifestResponseSchema,
  LessonPlanRevisionListResponseSchema, PlanTaskResponseSchema, RenderTaskResponseSchema,
  TracerUploadResponseSchema, type AgentPlanOutput,
} from "@ppt-digital-human/contracts";
import { createApplication } from "./app.ts";
import type { AgentAdapter } from "./agent-adapter.ts";
import type { AudioAdapter } from "./audio-adapter.ts";
import { runClaimedAudioStep } from "./audio-worker.ts";
import { clearProductState, createProductPool, createProductPrismaClient } from "./database.ts";
import { dispatchPendingOutbox } from "./dispatcher.ts";
import { FfmpegCompositeAdapter, FfmpegMediaValidationAdapter } from "./media-adapter.ts";
import { runClaimedCompositeStep, runClaimedValidationStep } from "./media-worker.ts";
import { PythonParseAdapter } from "./parse-adapter.ts";
import { runClaimedParseStep } from "./parse-worker.ts";
import { runClaimedPlanStep } from "./plan-worker.ts";
import { claimNextProductStep } from "./product-lease.ts";
import { SharpFfmpegPageRenderAdapter } from "./render-adapter.ts";
import { runClaimedRenderStep } from "./render-worker.ts";
import { LocalAssetStore } from "./storage.ts";

const databaseUrl = process.env.PPT_DH_DATABASE_URL ?? process.env.PPT_DH_T0_DATABASE_URL;
if (!databaseUrl) throw new Error("PPT_DH_DATABASE_URL is required for stage T-G e2e tests.");
const prisma = createProductPrismaClient(databaseUrl); const pool = createProductPool(databaseUrl);
const principal = "internal-test-user", internalToken = "stage-tg-token";
const require = createRequire(import.meta.url); const ffmpeg = (require("@ffmpeg-installer/ffmpeg") as { path: string }).path;
let assetRoot = "", attemptRoot = "", fixture: Uint8Array, tone: Uint8Array;

before(async () => {
  assetRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-tg-assets-")); attemptRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-tg-attempts-"));
  fixture = await readFile(fileURLToPath(new URL("../tests/fixtures/tracer-3.pptx", import.meta.url)));
  const toneDir = await mkdtemp(join(tmpdir(), "ppt-dh-stage-tg-tone-")), tonePath = join(toneDir, "tone.mp3");
  execFileSync(ffmpeg, ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=660:duration=1.65", "-ar", "24000", "-ac", "1", "-b:a", "48k", tonePath]);
  tone = await readFile(tonePath); await rm(toneDir, { recursive: true, force: true });
});
beforeEach(async () => clearProductState(prisma));
after(async () => { await prisma.$disconnect(); await pool.end(); await rm(assetRoot, { recursive: true, force: true }); await rm(attemptRoot, { recursive: true, force: true }); });

test("three-page HTTP upload reaches scoped full/range MP4, SRT and metadata delivery", async () => {
  const app = createApplication({ prisma, assetRoot, internalToken }), store = new LocalAssetStore(assetRoot);
  const form = new FormData(); form.set("title", "导数前三页"); form.set("file", new File([fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength) as ArrayBuffer], "导数前三页.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
  const uploadResponse = await request(app, "/v1/projects", { method: "POST", headers: { "Idempotency-Key": "stage-tg-upload-key" }, body: form }); assert.equal(uploadResponse.status, 201);
  const upload = TracerUploadResponseSchema.parse(await uploadResponse.json()).data;
  await dispatchPendingOutbox(prisma); const parseClaim = await claimNextProductStep(pool, "tg-parse", 30_000, 3, "PARSE"); assert(parseClaim);
  assert.equal(await runClaimedParseStep({ prisma, pool, assets: store, adapter: new PythonParseAdapter("python"), attemptRoot, leaseMs: 30_000 }, parseClaim, "tg-parse"), "SUCCEEDED");
  // This end-to-end fixture represents a deck that was explicitly confirmed by a reviewer.
  await prisma.slide.updateMany({
    where: { projectId: upload.project.id, presentationId: upload.presentation.id },
    data: { parseConfidence: 0.99, parseWarnings: [], formulaJson: [] },
  });

  const planResponse = await request(app, `/v1/projects/${upload.project.id}/plans`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ presentationId: upload.presentation.id, idempotencyKey: "stage-tg-plan-key", audience: "大学一年级", style: "逐页严谨", targetMinutes: 3 }) });
  const planTask = PlanTaskResponseSchema.parse(await planResponse.json()).data; await dispatchPendingOutbox(prisma);
  const planClaim = await claimNextProductStep(pool, "tg-plan", 30_000, 3, "PLAN"); assert(planClaim);
  assert.equal(await runClaimedPlanStep({ prisma, pool, assets: store, adapter: agent(), leaseMs: 30_000 }, planClaim, "tg-plan"), "SUCCEEDED");
  const revisionsResponse = await request(app, `/v1/projects/${upload.project.id}/lesson-plans`);
  const revisions = LessonPlanRevisionListResponseSchema.parse(await revisionsResponse.json()).data; assert.equal(revisions.length, 3);
  for (const revision of revisions) { const approved = await request(app, `/v1/revisions/${revision.id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: revision.revision }) }); assert.equal(approved.status, 200); }
  await prisma.project.update({ where: { id: upload.project.id }, data: { settings: { avatarId: "avatar-zhou", voiceId: "voice-qinghe", speechRate: 1, captionsEnabled: true, captionStyle: "clear", avatarPosition: "right", background: "light" } } });

  const audioResponse = await request(app, `/v1/projects/${upload.project.id}/audio`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ presentationId: upload.presentation.id, idempotencyKey: "stage-tg-audio-key", voice: "zh-CN-YunxiNeural", rate: "+0%", pitch: "+0Hz" }) });
  const audioTask = AudioTaskResponseSchema.parse(await audioResponse.json()).data; await dispatchPendingOutbox(prisma);
  for (let i = 0; i < 3; i += 1) { const claim = await claimNextProductStep(pool, "tg-audio", 30_000, 3, "AUDIO"); assert(claim); assert.equal(await runClaimedAudioStep({ prisma, pool, assets: store, adapter: toneAdapter(), attemptRoot, leaseMs: 30_000 }, claim, "tg-audio"), "SUCCEEDED"); }
  assert.equal((await prisma.generationTask.findUniqueOrThrow({ where: { id: audioTask.id } })).status, "SUCCEEDED");

  const renderResponse = await request(app, `/v1/projects/${upload.project.id}/renders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ presentationId: upload.presentation.id, audioTaskId: audioTask.id, idempotencyKey: "stage-tg-render-key", fps: 25 }) });
  const renderTask = RenderTaskResponseSchema.parse(await renderResponse.json()).data; await dispatchPendingOutbox(prisma);
  const renderClaims = await Promise.all([0, 1, 2].map((index) => claimNextProductStep(pool, `tg-render-${index}`, 60_000, 3, "PAGE_RENDER")));
  assert(renderClaims.every(Boolean));
  const renderResults = await Promise.all(renderClaims.map((claim, index) => runClaimedRenderStep({ prisma, pool, assets: store, adapter: new SharpFfmpegPageRenderAdapter(), attemptRoot, leaseMs: 60_000 }, claim!, `tg-render-${index}`)));
  assert.deepEqual(renderResults, ["SUCCEEDED", "SUCCEEDED", "SUCCEEDED"]);
  assert.equal((await prisma.generationTask.findUniqueOrThrow({ where: { id: renderTask.id } })).status, "SUCCEEDED");

  const compositeResponse = await request(app, `/v1/projects/${upload.project.id}/composites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ presentationId: upload.presentation.id, renderTaskId: renderTask.id, audioTaskId: audioTask.id, idempotencyKey: "stage-tg-composite-key" }) });
  const compositeTask = CompositeTaskResponseSchema.parse(await compositeResponse.json()).data; await dispatchPendingOutbox(prisma);
  const compositeClaim = await claimNextProductStep(pool, "tg-composite", 60_000, 3, "COMPOSITE"); assert(compositeClaim); assert.equal(await runClaimedCompositeStep({ prisma, pool, assets: store, adapter: new FfmpegCompositeAdapter(), attemptRoot, leaseMs: 60_000 }, compositeClaim, "tg-composite"), "SUCCEEDED");
  const validationClaim = await claimNextProductStep(pool, "tg-validate", 60_000, 3, "VALIDATE"); assert(validationClaim); assert.equal(await runClaimedValidationStep({ prisma, pool, assets: store, adapter: new FfmpegMediaValidationAdapter(), attemptRoot, leaseMs: 60_000 }, validationClaim, "tg-validate"), "SUCCEEDED");

  assert.equal((await request(app, `/v1/tasks/${compositeTask.id}/delivery`)).status, 400);
  const scopedDelivery = `?projectId=${encodeURIComponent(upload.project.id)}`;
  const manifestResponse = await request(app, `/v1/tasks/${compositeTask.id}/delivery${scopedDelivery}`); assert.equal(manifestResponse.status, 200);
  assert.equal((await request(app, `/v1/tasks/${compositeTask.id}/delivery?projectId=project_other`)).status, 404);
  const manifestText = await manifestResponse.text(); assert.doesNotMatch(manifestText, /storageKey|assetRoot|[A-Z]:\\|t-assets/i);
  const manifest = DeliveryManifestResponseSchema.parse(JSON.parse(manifestText)).data; assert.deepEqual(manifest.files.map((file) => file.kind), ["video", "captions", "metadata"]);
  const taskCountBeforeRefresh = await prisma.generationTask.count({ where: { projectId: upload.project.id } });
  assert.equal((await request(app, `/v1/tasks/${compositeTask.id}/delivery${scopedDelivery}`)).status, 200);
  assert.equal(await prisma.generationTask.count({ where: { projectId: upload.project.id } }), taskCountBeforeRefresh);
  const vttResponse = await request(app, `/v1/tasks/${compositeTask.id}/captions.vtt${scopedDelivery}`);
  assert.equal(vttResponse.status, 200);
  assert.equal(vttResponse.headers.get("content-type"), "text/vtt; charset=utf-8");
  assert.match(await vttResponse.text(), /^WEBVTT\n\n1\n00:00:00\.000 -->/);
  assert.equal((await request(app, `/v1/tasks/${compositeTask.id}/captions.vtt${scopedDelivery}`, {}, "another-user")).status, 404);
  for (const file of manifest.files) {
    const backendPath = file.kind === "metadata" ? `/v1/tasks/${compositeTask.id}/delivery/metadata${scopedDelivery}` : `/v1/assets/${file.assetId}/content${scopedDelivery}`;
    const full = await request(app, backendPath); assert.equal(full.status, 200); const bytes = new Uint8Array(await full.arrayBuffer()); assert.equal(bytes.byteLength, file.fileSize); assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256); assert.equal(full.headers.get("etag"), `"${file.sha256}"`);
    const partial = await request(app, backendPath, { headers: { Range: "bytes=0-99" } }); assert.equal(partial.status, 206); assert.match(partial.headers.get("content-range") ?? "", /^bytes 0-/);
    assert.equal((await request(app, backendPath, { headers: { "If-None-Match": `"${file.sha256}"` } })).status, 304);
    assert.equal((await request(app, backendPath, {}, "another-user")).status, 404);
  }
});

function agent(): AgentAdapter { return { async run(input) { const output: AgentPlanOutput = { schemaVersion: "stage-tc-agent-v1", slides: input.slides.map((slide, index) => ({ slideId: slide.id, teachingGoal: `理解${slide.title}`, narration: [{ displayText: `讲解第${index + 1}页。`, spokenText: `讲解第${index + 1}页。` }], derivation: [], scenes: [{ durationMs: 1650, ...(index === 0 ? { overlay: { id: "overlay_tg_1", slideId: slide.id, type: "highlightBox" as const, bounds: { x: .1, y: .1, width: .25, height: .15 }, color: "#ef4444" } } : {}) }], preservationMode: index === 0 ? "PRESERVE_WITH_OVERLAY" : "FULL_PRESERVE" })) }; return { output, provider: "local-e2e", model: "fixture", promptVersion: "stage-tc-agent-prompt-v1" }; } }; }
function toneAdapter(): AudioAdapter { return { async run() { return { bytes: tone, durationMs: 1650 }; } }; }
function request(app: ReturnType<typeof createApplication>, path: string, init: RequestInit = {}, asPrincipal = principal) { const headers = new Headers(init.headers); headers.set("X-Internal-Token", internalToken); headers.set("X-Principal", asPrincipal); return app.request(path, { ...init, headers }); }
