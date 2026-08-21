import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ParseAdapterDeckSchema,
  type ParseAdapterDeck,
} from "@ppt-digital-human/contracts";
import { WorkerError } from "./worker-error.ts";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MAX_PROCESS_OUTPUT = 64 * 1024;
const PREPARE_ERROR_PREFIX = "PPT_DH_PREPARE_ERROR:";

export interface ParseAdapterInput {
  sourcePath: string;
  attemptDir: string;
  signal: AbortSignal;
}

export interface ParseAdapterResult {
  deck: ParseAdapterDeck;
  attemptDir: string;
}

export interface ParseAdapter {
  run(input: ParseAdapterInput): Promise<ParseAdapterResult>;
}

export class PythonParseAdapter implements ParseAdapter {
  constructor(private readonly pythonCommand = "python") {}

  async run(input: ParseAdapterInput): Promise<ParseAdapterResult> {
    await mkdir(dirname(input.attemptDir), { recursive: true });
    await mkdir(input.attemptDir, { recursive: false });
    const child = spawn(
      this.pythonCommand,
      [
        "-m",
        "backend.prepare",
        "--input",
        input.sourcePath,
        "--job-dir",
        input.attemptDir,
        "--planner",
        "rules",
      ],
      { cwd: REPOSITORY_ROOT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    const abort = () => terminateProcessTree(child);
    child.stdout?.resume();
    input.signal.addEventListener("abort", abort, { once: true });
    try {
      const { code, stderr } = await collectProcess(child);
      if (input.signal.aborted) {
        throw new WorkerError("PARSE_CANCELLED", "解析已取消。", true);
      }
      if (code !== 0) {
        const prepareError = parsePrepareError(stderr);
        if (prepareError) {
          throw new WorkerError(
            prepareError.code,
            prepareError.message,
            prepareError.retryable,
          );
        }
        throw new WorkerError(
          "PARSE_RUNTIME_FAILED",
          "课件解析组件异常退出，请重启应用后重试；如仍失败，请重新安装修复版。",
          true,
        );
      }
      const raw: unknown = JSON.parse(
        await readFile(`${input.attemptDir}/parsed-deck.json`, "utf8"),
      );
      const parsed = ParseAdapterDeckSchema.safeParse(raw);
      if (!parsed.success) {
        throw new WorkerError(
          "PARSE_CONTRACT_INVALID",
          "解析结果或原页渲染未通过严格契约。",
          false,
        );
      }
      return { deck: parsed.data, attemptDir: input.attemptDir };
    } catch (error) {
      if (error instanceof WorkerError) {
        throw error;
      }
      if (isMissingExecutable(error)) {
        throw new WorkerError(
          "PARSE_RUNTIME_UNAVAILABLE",
          "课件解析组件不可用，请重新安装修复版应用。",
          false,
        );
      }
      throw new WorkerError("PARSE_OUTPUT_INVALID", "解析产物无法读取。", false);
    } finally {
      input.signal.removeEventListener("abort", abort);
    }
  }
}

interface PrepareProcessError {
  code: string;
  message: string;
  retryable: boolean;
}

function parsePrepareError(stderr: string): PrepareProcessError | null {
  const lines = stderr.split(/\r?\n/);
  let encoded: string | undefined;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (line?.startsWith(PREPARE_ERROR_PREFIX)) {
      encoded = line;
      break;
    }
  }
  if (!encoded) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(encoded.slice(PREPARE_ERROR_PREFIX.length));
    if (
      typeof value !== "object" ||
      value === null ||
      !("code" in value) ||
      !("message" in value) ||
      !("retryable" in value) ||
      typeof value.code !== "string" ||
      !/^[A-Z][A-Z0-9_]{2,63}$/.test(value.code) ||
      typeof value.message !== "string" ||
      value.message.length < 1 ||
      value.message.length > 500 ||
      typeof value.retryable !== "boolean"
    ) {
      return null;
    }
    return {
      code: value.code,
      message: value.message,
      retryable: value.retryable,
    };
  } catch {
    return null;
  }
}

function isMissingExecutable(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function collectProcess(child: ChildProcess): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < MAX_PROCESS_OUTPUT) {
        stderr += chunk.toString().slice(0, MAX_PROCESS_OUTPUT - stderr.length);
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stderr }));
  });
}

function terminateProcessTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) {
    return;
  }
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.unref();
    return;
  }
  child.kill("SIGTERM");
}
