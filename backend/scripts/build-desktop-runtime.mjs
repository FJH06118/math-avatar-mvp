import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(backendRoot, "runtime-dist");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await build({
  entryPoints: {
    "hono-entry": resolve(backendRoot, "app/server.ts"),
    "worker-entry": resolve(backendRoot, "app/worker.ts"),
  },
  outdir: outputRoot,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  legalComments: "external",
  external: ["sharp"],
  banner: {
    js: 'import { createRequire as __runtimeCreateRequire } from "node:module"; const require = __runtimeCreateRequire(import.meta.url);',
  },
  logLevel: "warning",
});
await cp(resolve(backendRoot, "app/edge-tts-child.mjs"), resolve(outputRoot, "edge-tts-child.mjs"));
