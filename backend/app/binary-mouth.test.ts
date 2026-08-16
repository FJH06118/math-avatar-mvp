import assert from "node:assert/strict";
import test from "node:test";

import { buildBinaryMouthConcat } from "./render-adapter.ts";

test("binary mouth animation alternates only closed and open whole-avatar frames", () => {
  const concat = buildBinaryMouthConcat("C:\\avatar\\frame-closed.png", "C:\\avatar\\frame-open.png", 650);
  const files = [...concat.matchAll(/^file '([^']+)'$/gm)].map((match) => match[1]);
  const durations = [...concat.matchAll(/^duration ([0-9.]+)$/gm)].map((match) => Number(match[1]));

  assert.deepEqual(files, [
    "C:/avatar/frame-closed.png",
    "C:/avatar/frame-open.png",
    "C:/avatar/frame-closed.png",
    "C:/avatar/frame-open.png",
    "C:/avatar/frame-closed.png",
    "C:/avatar/frame-open.png",
    "C:/avatar/frame-closed.png",
  ]);
  assert.deepEqual(durations, [0.12, 0.1, 0.12, 0.1, 0.12, 0.09]);
  assert.equal(Math.round(durations.reduce((sum, value) => sum + value, 0) * 1_000), 650);
  assert.doesNotMatch(concat, /small|medium|large|round|pose-/i);
});
