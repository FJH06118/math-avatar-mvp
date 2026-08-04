import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { SharpFfmpegPageRenderAdapter } from "./render-adapter.ts";

const require = createRequire(import.meta.url);
const ffmpegValue = require("@ffmpeg-installer/ffmpeg") as { path: string };
let root = "";
let source = "";
let audio = "";
before(async () => {
  root = await mkdtemp(join(tmpdir(), "ppt-dh-stage-11e-benchmark-"));
  source = join(root, "source.png");
  audio = join(root, "audio.mp3");
  await writeFile(source, await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#eef4fb" } }).png().toBuffer());
  execFileSync(ffmpegValue.path, ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1.65,volume=0.2", "-ar", "24000", "-ac", "1", "-b:a", "48k", audio]);
});
after(async () => { await rm(root, { recursive: true, force: true }); });

test("25 and 30 FPS both pass three-page encoding and attempts reject stale-directory reuse", async () => {
  const adapter = new SharpFfmpegPageRenderAdapter();
  for (const fps of [25, 30] as const) {
    const started = performance.now();
    for (let page = 1; page <= 3; page += 1) {
      const result = await adapter.run({ sourcePath: source, audioPaths: [audio], durationMs: 1_650, fps, pageOrder: page, pageCount: 3, avatarPlacement: "right-panel", attemptDir: join(root, `${fps}-${page}`), signal: new AbortController().signal });
      assert(result.frameBytes.byteLength > 2_000);
      assert(result.videoBytes.byteLength > 2_000);
    }
    const elapsedMs = Math.round(performance.now() - started);
    assert(elapsedMs > 0);
  }
  await assert.rejects(new SharpFfmpegPageRenderAdapter().run({ sourcePath: source, audioPaths: [audio], durationMs: 1_650, fps: 25, pageOrder: 1, pageCount: 3, avatarPlacement: "right-panel", attemptDir: join(root, "25-1"), signal: new AbortController().signal }));
  assert((await readFile(join(root, "25-1", "frame.png"))).byteLength > 2_000);
});
