import "dotenv/config";

import { resolve } from "node:path";

export interface AppConfig {
  databaseUrl: string;
  assetRoot: string;
  internalToken: string;
  port: number;
}

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
    internalToken: required("PPT_DH_INTERNAL_TOKEN"),
    port,
  };
}
