import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { AgentProviderConfig } from "./agent-adapter.ts";

loadDotenv({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

export interface AppConfig {
  databaseUrl: string;
  assetRoot: string;
  internalToken: string;
  port: number;
  attemptRoot: string;
  pythonCommand: string;
}

export type WorkerConfig = Pick<
  AppConfig,
  "databaseUrl" | "assetRoot" | "attemptRoot" | "pythonCommand"
> & { agentProvider: AgentProviderConfig | null };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured for the stage T application service.`);
  }
  return value;
}

export function loadAppConfig(): AppConfig {
  const port = Number(process.env.PPT_DH_APP_PORT ?? "4310");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PPT_DH_APP_PORT must be an integer TCP port.");
  }
  return {
    databaseUrl: required("PPT_DH_DATABASE_URL"),
    assetRoot: resolve(process.env.PPT_DH_ASSET_ROOT ?? "work/t-assets"),
    attemptRoot: resolve(process.env.PPT_DH_ATTEMPT_ROOT ?? "work/t-attempts"),
    pythonCommand: process.env.PPT_DH_PYTHON_COMMAND?.trim() || "python",
    internalToken: required("PPT_DH_INTERNAL_TOKEN"),
    port,
  };
}

export function loadWorkerConfig(): WorkerConfig {
  return {
    databaseUrl: required("PPT_DH_DATABASE_URL"),
    assetRoot: resolve(process.env.PPT_DH_ASSET_ROOT ?? "work/t-assets"),
    attemptRoot: resolve(process.env.PPT_DH_ATTEMPT_ROOT ?? "work/t-attempts"),
    pythonCommand: process.env.PPT_DH_PYTHON_COMMAND?.trim() || "python",
    agentProvider: loadAgentProviderConfig(),
  };
}

export function loadAgentProviderConfig(): AgentProviderConfig | null {
  const apiKey = (process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY)?.trim();
  const baseUrl = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  return apiKey && baseUrl && model ? { apiKey, baseUrl, model } : null;
}
