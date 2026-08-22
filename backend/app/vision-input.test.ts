import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import sharp from "sharp";

import { LocalAssetStore } from "./storage.ts";
import { prepareVisionInputs, VISION_INPUT_LIMITS } from "./vision-input.ts";
import { WorkerError } from "./worker-error.ts";

let root = "";
let store: LocalAssetStore;
let source: Buffer;
let sourceSha256 = "";
let storageKey = "";

before(async () => {
  root = await mkdtemp(join(tmpdir(), "ppt-dh-vision-input-"));
  store = new LocalAssetStore(root);
  source = await sharp({
    create: {
      width: 1_920,
      height: 1_080,
      channels: 3,
      background: "#ffffff",
    },
  }).png().toBuffer();
  sourceSha256 = createHash("sha256").update(source).digest("hex");
  storageKey = await store.putSlideRender("project_vision", sourceSha256, source);
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

test("vision input verifies the registered page and emits a bounded JPEG data block", async () => {
  const images = await prepareVisionInputs([slide()], store, new AbortController().signal);
  const image = images.get("slide_vision_1");
  assert(image);
  assert.equal(image.ref, "slide-image-001");
  assert.equal(image.mimeType, "image/jpeg");
  assert(image.width <= 1_440 && image.height <= 810);
  const bytes = Buffer.from(image.base64, "base64");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), image.sha256);
  assert.equal((await sharp(bytes).metadata()).format, "jpeg");
});

test("vision input rejects a page whose registered hash does not match disk", async () => {
  await assert.rejects(
    prepareVisionInputs([
      {
        ...slide(),
        renderAsset: { ...slide().renderAsset!, sha256: "0".repeat(64) },
      },
    ], store, new AbortController().signal),
    (error: unknown) => error instanceof WorkerError && error.code === "AGENT_VISION_SOURCE_INVALID",
  );
});

test("vision and animation visual context expose explicit count, resolution, Base64 and time budgets", async () => {
  assert.deepEqual(VISION_INPUT_LIMITS, {
    maxFullPageImages: 100,
    maxAnimationObjectCrops: 0,
    maxBase64Characters: 16 * 1024 * 1024,
    maxWidth: 1_440,
    maxHeight: 810,
    maxPreparationMs: 20_000,
    defaultProviderRequestTimeoutMs: 30_000,
    maxProviderRequestTimeoutMs: 120_000,
  });
  await assert.rejects(
    prepareVisionInputs([slide()], store, new AbortController().signal, {
      preparationTimeoutMs: 1,
      now: (() => {
        let value = 0;
        return () => value += 2;
      })(),
    }),
    (error: unknown) =>
      error instanceof WorkerError && error.code === "AGENT_VISION_PREPARATION_TIMEOUT",
  );
});

function slide() {
  return {
    id: "slide_vision_1",
    slideNumber: 1,
    renderAsset: {
      storageKey,
      sha256: sourceSha256,
      mimeType: "image/png",
      fileSize: source.byteLength,
      lifecycle: "AVAILABLE",
    },
  };
}
