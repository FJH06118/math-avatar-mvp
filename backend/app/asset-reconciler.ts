import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, rm } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import type { PrismaClient } from "../generated/prisma/client.ts";

export interface AssetReconciliationReport {
  registeredChecked: number;
  missingRegisteredKeys: string[];
  corruptedRegisteredKeys: string[];
  orphanKeys: string[];
  deletedOrphanKeys: string[];
  deferredOrphanKeys: string[];
  suspiciousLinks: string[];
}

export async function reconcileLocalAssets(
  prisma: PrismaClient,
  assetRoot: string,
  options: { deleteOrphans?: boolean; graceMs?: number; now?: Date } = {},
): Promise<AssetReconciliationReport> {
  const root = resolve(assetRoot);
  const projectsRoot = resolveInside(root, "projects");
  const now = options.now ?? new Date();
  const graceMs = options.graceMs ?? 24 * 60 * 60 * 1_000;
  const registered = await prisma.asset.findMany({
    select: { storageKey: true, sha256: true, fileSize: true },
  });
  const registeredByPath = new Map(
    registered.map((asset) => [resolveInside(root, asset.storageKey), asset]),
  );
  const report: AssetReconciliationReport = {
    registeredChecked: registered.length,
    missingRegisteredKeys: [],
    corruptedRegisteredKeys: [],
    orphanKeys: [],
    deletedOrphanKeys: [],
    deferredOrphanKeys: [],
    suspiciousLinks: [],
  };

  for (const [path, asset] of registeredByPath) {
    try {
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.size !== asset.fileSize || await sha256File(path) !== asset.sha256) {
        report.corruptedRegisteredKeys.push(asset.storageKey);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        report.missingRegisteredKeys.push(asset.storageKey);
        continue;
      }
      throw error;
    }
  }

  await walkFiles(projectsRoot, async (path, modifiedAt, isSymbolicLink) => {
    const key = relative(root, path).split(sep).join("/");
    if (isSymbolicLink) {
      report.suspiciousLinks.push(key);
      return;
    }
    if (registeredByPath.has(path)) return;
    report.orphanKeys.push(key);
    if (now.getTime() - modifiedAt.getTime() < graceMs) {
      report.deferredOrphanKeys.push(key);
      return;
    }
    if (options.deleteOrphans) {
      await rm(path, { force: true });
      report.deletedOrphanKeys.push(key);
    }
  });

  return report;
}

function resolveInside(root: string, storageKey: string): string {
  const target = resolve(root, storageKey);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error("Asset reconciliation key escaped the configured root.");
  }
  return target;
}

async function walkFiles(
  directory: string,
  visit: (path: string, modifiedAt: Date, isSymbolicLink: boolean) => Promise<void>,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const metadata = await lstat(path);
      await visit(path, metadata.mtime, true);
    } else if (entry.isDirectory()) {
      await walkFiles(path, visit);
    } else if (entry.isFile()) {
      const metadata = await lstat(path);
      await visit(path, metadata.mtime, false);
    }
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
