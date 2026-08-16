import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AvatarCatalogSchema, AvatarMouthManifestSchema } from "@ppt-digital-human/contracts";
import { canonicalJson } from "./driver.mjs";

const POSES = ["CLOSED", "SMALL", "MEDIUM", "LARGE", "ROUND"];

export async function loadAvatarBundle(assetRoot, requestedAvatarId) {
  const root = await realpath(assetRoot);
  const catalog = AvatarCatalogSchema.parse(JSON.parse(await readFile(path.join(root, "catalog.json"), "utf8")));
  const entry = catalog.avatars.find((avatar) => avatar.avatarId === requestedAvatarId && avatar.status === "asset-ready");
  if (!entry) throw new Error("AVATAR_NOT_READY");
  const manifestPath = await safeExistingPath(root, entry.manifestPath);
  const manifest = AvatarMouthManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  if (manifest.avatarId !== entry.avatarId || manifest.assetVersion !== entry.assetVersion || manifest.bundleFingerprint !== entry.bundleFingerprint) throw new Error("AVATAR_CATALOG_MISMATCH");
  const assetDir = path.dirname(manifestPath);
  const { bundleFingerprint, ...withoutFingerprint } = manifest;
  if (sha(Buffer.from(canonicalJson(withoutFingerprint))) !== bundleFingerprint) throw new Error("AVATAR_BUNDLE_FINGERPRINT_MISMATCH");
  const base = await inspectPng(assetDir, manifest.base, manifest.canvas.width, manifest.canvas.height);
  const poses = {};
  for (const pose of POSES) poses[pose] = await inspectPng(assetDir, manifest.poses[pose], manifest.mouthRoi.width, manifest.mouthRoi.height);
  return { catalog, manifest, base, poses, root, manifestPath };
}

async function inspectPng(root, record, width, height) {
  const filePath = await safeExistingPath(root, record.path);
  const bytes = await readFile(filePath);
  const metadata = await sharp(bytes).metadata();
  if (metadata.format !== "png" || metadata.width !== width || metadata.height !== height || metadata.channels !== 4 || metadata.hasAlpha !== true || sha(bytes) !== record.sha256) throw new Error("AVATAR_PNG_INVALID");
  return { path: filePath, bytes, metadata };
}

async function safeExistingPath(root, relative) {
  if (path.isAbsolute(relative) || relative.replaceAll("\\", "/").split("/").includes("..")) throw new Error("AVATAR_PATH_ESCAPE");
  const candidate = await realpath(path.resolve(root, relative));
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new Error("AVATAR_PATH_ESCAPE");
  return candidate;
}
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
