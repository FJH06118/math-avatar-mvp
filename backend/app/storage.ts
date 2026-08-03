import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

export interface StoredCandidate {
  storageKey: string;
  remove(): Promise<void>;
}

export class LocalAssetStore {
  private readonly resolvedRoot: string;

  constructor(root: string) {
    this.resolvedRoot = resolve(root);
  }

  async putSource(projectId: string, sha256: string, bytes: Uint8Array): Promise<StoredCandidate> {
    const storageKey = `projects/${projectId}/source-${sha256}.pptx`;
    const target = this.resolveKey(storageKey);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return {
      storageKey,
      remove: () => rm(target, { force: true }),
    };
  }

  private resolveKey(storageKey: string): string {
    const target = resolve(this.resolvedRoot, storageKey);
    if (target !== this.resolvedRoot && !target.startsWith(`${this.resolvedRoot}${sep}`)) {
      throw new Error("Storage key escaped the configured asset root.");
    }
    return target;
  }
}
