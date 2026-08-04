import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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

  async putSource(
    projectId: string,
    sha256: string,
    bytes: Uint8Array,
    extension: "ppt" | "pptx" = "pptx",
  ): Promise<StoredCandidate> {
    const storageKey = `projects/${projectId}/source-${sha256}.${extension}`;
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

  async putSlideRender(projectId: string, sha256: string, bytes: Uint8Array): Promise<string> {
    const storageKey = `projects/${projectId}/slide-renders/${sha256}.png`;
    const target = this.resolveKey(storageKey);
    try {
      const existing = await readFile(target);
      const existingHash = createHash("sha256").update(existing).digest("hex");
      if (existingHash !== sha256) {
        throw new Error("Existing derived asset failed its content hash check.");
      }
      return storageKey;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    const temporary = `${target}.${randomUUID()}.tmp`;
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return storageKey;
  }

  async putAudioSegment(projectId: string, sha256: string, bytes: Uint8Array): Promise<string> {
    return this.putDerived(`projects/${projectId}/audio/${sha256}.mp3`, sha256, bytes);
  }

  async putCaptions(projectId: string, sha256: string, bytes: Uint8Array): Promise<string> {
    return this.putDerived(`projects/${projectId}/captions/${sha256}.srt`, sha256, bytes);
  }

  async putPageFrame(projectId: string, sha256: string, bytes: Uint8Array): Promise<string> {
    return this.putDerived(`projects/${projectId}/page-frames/${sha256}.png`, sha256, bytes);
  }

  async putPageVideo(projectId: string, sha256: string, bytes: Uint8Array): Promise<string> {
    return this.putDerived(`projects/${projectId}/page-videos/${sha256}.mp4`, sha256, bytes);
  }

  async putFinalVideo(projectId: string, sha256: string, bytes: Uint8Array): Promise<string> {
    return this.putDerived(`projects/${projectId}/final/${sha256}.mp4`, sha256, bytes);
  }

  resolveForRead(storageKey: string): string {
    return this.resolveKey(storageKey);
  }

  async removeProject(projectId: string): Promise<void> {
    const target = this.resolveKey(`projects/${projectId}`);
    await rm(target, { recursive: true, force: true });
  }

  private resolveKey(storageKey: string): string {
    const target = resolve(this.resolvedRoot, storageKey);
    if (target !== this.resolvedRoot && !target.startsWith(`${this.resolvedRoot}${sep}`)) {
      throw new Error("Storage key escaped the configured asset root.");
    }
    return target;
  }


  private async putDerived(storageKey: string, sha256: string, bytes: Uint8Array): Promise<string> {
    const target = this.resolveKey(storageKey);
    try {
      const existing = await readFile(target);
      if (createHash("sha256").update(existing).digest("hex") !== sha256) {
        throw new Error("Existing derived asset failed its content hash check.");
      }
      return storageKey;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temporary = `${target}.${randomUUID()}.tmp`;
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return storageKey;
  }
}
