import "dotenv/config";

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { TracerUploadResponseSchema } from "@ppt-digital-human/contracts";
import { createApplication } from "./app.ts";
import { clearProductState, createProductPool, createProductPrismaClient } from "./database.ts";
import { dispatchPendingOutbox } from "./dispatcher.ts";
import { PythonParseAdapter } from "./parse-adapter.ts";
import { runClaimedParseStep } from "./parse-worker.ts";
import { claimNextProductStep } from "./product-lease.ts";
import { LocalAssetStore } from "./storage.ts";

const databaseUrl = process.env.PPT_DH_DATABASE_URL ?? process.env.PPT_DH_T0_DATABASE_URL;
if (!databaseUrl) throw new Error("PPT_DH_DATABASE_URL is required for stage 11B coverage tests.");
const prisma = createProductPrismaClient(databaseUrl);
const pool = createProductPool(databaseUrl);
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

let root = "";

before(async () => {
  root = await mkdtemp(join(tmpdir(), "ppt-dh-stage-11b-"));
  await clearProductState(prisma);
});

after(async () => {
  await clearProductState(prisma);
  await prisma.$disconnect();
  await pool.end();
  await rm(root, { recursive: true, force: true });
});

test("synthetic 1/10/50/100-page decks keep continuous coverage and original pages", async () => {
  for (const slideCount of [1, 10, 50, 100]) {
    const source = join(root, `coverage-${slideCount}.pptx`);
    await run("python", ["-m", "backend.tools.create_coverage_fixture", "--output", source, "--slides", String(slideCount)]);
    const result = await new PythonParseAdapter("python").run({
      sourcePath: source,
      attemptDir: join(root, `attempt-${slideCount}`),
      signal: new AbortController().signal,
    });
    assert.equal(result.deck.slideCount, slideCount);
    assert.deepEqual(result.deck.slides.map((slide) => slide.index), Array.from({ length: slideCount }, (_, index) => index + 1));
    assert.equal((await readdir(join(result.attemptDir, "slides"))).filter((name) => name.endsWith(".png")).length, slideCount);
    assert(result.deck.slides[minImageSlide(slideCount) - 1]!.warnings.some((warning) => warning.includes("OCR 已延期")));
  }
});

test("a real legacy PPT is converted inside the parse attempt and follows the PPTX contract", async () => {
  const sourcePptx = join(root, "legacy-source.pptx");
  await run("python", ["-m", "backend.tools.create_coverage_fixture", "--output", sourcePptx, "--slides", "1"]);
  const conversionDir = join(root, "legacy");
  await mkdir(conversionDir, { recursive: true });
  const conversionProfile = join(root, "legacy-conversion-profile");
  await run(sofficeCommand(), [
    "--headless", "--nologo", "--nodefault", "--nofirststartwizard", "--norestore",
    `-env:UserInstallation=${pathToFileURL(conversionProfile).href}`,
    "--convert-to", "ppt", "--outdir", conversionDir, sourcePptx,
  ]);
  const sourcePpt = join(conversionDir, "legacy-source.ppt");
  const bytes = await readFile(sourcePpt);
  const form = new FormData();
  form.set("title", "旧版 PPT 转换测试");
  form.set("file", new File([bytes], "旧版覆盖测试.ppt", { type: "application/vnd.ms-powerpoint" }));
  const app = createApplication({ prisma, assetRoot: join(root, "assets"), internalToken: "stage-11b-token" });
  const response = await app.request("/v1/projects", {
    method: "POST",
    headers: {
      "X-Internal-Token": "stage-11b-token",
      "X-Principal": "stage-11b-user",
      "Idempotency-Key": "stage-11b-legacy-upload",
    },
    body: form,
  });
  const responseBody: unknown = await response.json();
  const persisted = await prisma.generationTask.findMany({ include: { presentation: true, project: true } });
  assert.equal(response.status, 201, JSON.stringify({ responseBody, persisted }));
  const receipt = TracerUploadResponseSchema.parse(responseBody).data;
  assert.equal(await dispatchPendingOutbox(prisma), 1);
  const claim = await claimNextProductStep(pool, "stage-11b-worker", 30_000);
  assert(claim);
  assert.equal(await runClaimedParseStep({
    prisma,
    pool,
    assets: new LocalAssetStore(join(root, "assets")),
    adapter: new PythonParseAdapter("python"),
    attemptRoot: join(root, "legacy-attempts"),
    leaseMs: 30_000,
  }, claim, "stage-11b-worker"), "SUCCEEDED");
  const presentation = await prisma.presentation.findUniqueOrThrow({ where: { id: receipt.presentation.id } });
  assert.equal(presentation.originalFileName, "旧版覆盖测试.ppt");
  assert.equal(presentation.slideCount, 1);
  assert.equal(await prisma.slide.count({ where: { presentationId: presentation.id } }), 1);
});

const goldenPath = process.env.PPT_DH_STAGE_11B_GOLDEN_PPTX?.trim();
test("private 14-page calculus golden deck preserves all pages", { skip: !goldenPath }, async () => {
  const result = await new PythonParseAdapter("python").run({
    sourcePath: resolve(goldenPath!),
    attemptDir: join(root, "golden-14-attempt"),
    signal: new AbortController().signal,
  });
  assert.equal(result.deck.slideCount, 14);
  assert.deepEqual(result.deck.slides.map((slide) => slide.index), Array.from({ length: 14 }, (_, index) => index + 1));
  assert.equal((await readdir(join(result.attemptDir, "slides"))).filter((name) => name.endsWith(".png")).length, 14);
});

function minImageSlide(slideCount: number): number {
  return Math.min(2, slideCount);
}

function sofficeCommand(): string {
  return process.platform === "win32"
    ? "C:\\Program Files\\LibreOffice\\program\\soffice.com"
    : "soffice";
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: repositoryRoot, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${basename(command)} exited ${code}: ${stderr.slice(-2_000)}`)));
  });
}
