import assert from "node:assert/strict";
import test from "node:test";
import { isRuntimeShutdownMessage } from "./runtime-control.ts";

test("runtime shutdown IPC accepts only the strict versioned message", () => {
  assert.equal(isRuntimeShutdownMessage({ type: "runtime-shutdown", protocolVersion: 1 }), true);
  assert.equal(isRuntimeShutdownMessage({ type: "runtime-shutdown", protocolVersion: 2 }), false);
  assert.equal(isRuntimeShutdownMessage({ type: "runtime-shutdown", protocolVersion: 1, token: "leak" }), false);
  assert.equal(isRuntimeShutdownMessage("runtime-shutdown"), false);
});
