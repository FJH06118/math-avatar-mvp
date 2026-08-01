import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { parseArgs, readJson, writeJson } from "./video/common.mjs";

const { values, positionals } = parseArgs();
const command = positionals[0] || "help";
const root = path.resolve(import.meta.dirname, "..");

function run(executable, args, options = {}) {
  console.log(`\n> ${executable} ${args.join(" ")}\n`);
  const result = spawnSync(executable, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${executable} 执行失败，退出码 ${result.status}`);
  }
}

function requireValue(name) {
  const value = values[name];
  if (!value || value === true) throw new Error(`缺少 --${name} 参数`);
  return String(value);
}

function pythonExecutable() {
  return process.env.PIPELINE_PYTHON || "python";
}

function updateJobStatus(jobDirValue, next) {
  if (!jobDirValue) return;
  const jobDir = path.resolve(jobDirValue);
  fs.mkdirSync(jobDir, { recursive: true });
  const statusPath = path.join(jobDir, "job-status.json");
  const current = fs.existsSync(statusPath)
    ? readJson(statusPath)
    : {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
      };
  writeJson(statusPath, {
    ...current,
    ...next,
    updatedAt: new Date().toISOString(),
  });
}

function prepare({ autoApprove = false } = {}) {
  updateJobStatus(values["job-dir"], {
    status: "running",
    stage: "prepare",
    progress: 5,
    error: null,
  });
  const args = [
    "-m",
    "backend.prepare",
    "--input",
    requireValue("input"),
    "--job-dir",
    requireValue("job-dir"),
    "--audience",
    String(values.audience || "大学一年级"),
    "--style",
    String(values.style || "概念清楚、公式读法准确、必要时逐步推导"),
  ];
  if (values["target-minutes"]) {
    args.push("--target-minutes", String(values["target-minutes"]));
  }
  if (values["skip-slide-render"]) args.push("--skip-slide-render");
  if (autoApprove || values["auto-approve"]) args.push("--auto-approve");
  run(pythonExecutable(), args);
  updateJobStatus(values["job-dir"], {
    status: autoApprove || values["auto-approve"] ? "ready" : "needs_review",
    stage: autoApprove || values["auto-approve"] ? "approved" : "review",
    progress: autoApprove || values["auto-approve"] ? 35 : 30,
  });
}

function approve() {
  run(pythonExecutable(), [
    "-m",
    "backend.approve",
    "--job-dir",
    requireValue("job-dir"),
  ]);
  updateJobStatus(values["job-dir"], {
    status: "ready",
    stage: "approved",
    progress: 35,
    error: null,
  });
}

function render() {
  const jobDir = requireValue("job-dir");
  const common = ["--job-dir", jobDir];
  if (values["allow-unreviewed"]) common.push("--allow-unreviewed");
  updateJobStatus(jobDir, {
    status: "running",
    stage: "voice-and-timeline",
    progress: 40,
    error: null,
  });
  run(process.execPath, [
    "backend/video/synthesize.mjs",
    ...common,
    "--tts-mode",
    String(values["tts-mode"] || "edge"),
  ]);
  updateJobStatus(jobDir, {
    status: "running",
    stage: "render-slides",
    progress: 65,
  });
  run(process.execPath, ["backend/video/render-frames.mjs", ...common]);
  updateJobStatus(jobDir, {
    status: "running",
    stage: "compose-video",
    progress: 78,
  });
  run(process.execPath, ["backend/video/create-video.mjs", ...common]);
  updateJobStatus(jobDir, {
    status: "running",
    stage: "verify",
    progress: 94,
  });
  run(process.execPath, ["backend/video/verify.mjs", ...common]);
  updateJobStatus(jobDir, {
    status: "completed",
    stage: "completed",
    progress: 100,
    completedAt: new Date().toISOString(),
    error: null,
  });
}

try {
  if (command === "prepare") {
    prepare();
  } else if (command === "approve") {
    approve();
  } else if (command === "render") {
    render();
  } else if (command === "run") {
    const jobDir = path.resolve(requireValue("job-dir"));
    fs.mkdirSync(jobDir, { recursive: true });
    prepare({ autoApprove: true });
    render();
  } else {
    console.log(`
高等数学 PPT 数字人视频流水线

先生成并人工审核：
  node backend/run.mjs prepare --input <课件.pptx> --job-dir <任务目录>
  编辑 <任务目录>/scenes.generated.json
  node backend/run.mjs approve --job-dir <任务目录>
  node backend/run.mjs render --job-dir <任务目录> --tts-mode edge

自动批准并一键生成（适合回归测试）：
  node backend/run.mjs run --input <课件.pptx> --job-dir <任务目录> --tts-mode silent
`);
  }
} catch (error) {
  updateJobStatus(values["job-dir"], {
    status: "failed",
    stage: "failed",
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
