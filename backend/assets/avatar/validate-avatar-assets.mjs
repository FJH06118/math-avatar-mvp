import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const POSES = ["CLOSED", "SMALL", "MEDIUM", "LARGE", "ROUND"];

function fail(message) {
  throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} keys differ: expected ${wanted.join(", ")}; got ${actual.join(", ")}`);
  }
}

function assertSafeRelativePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value)) fail(`${label} must be a non-empty relative path`);
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) fail(`${label} must not escape its asset directory`);
  return normalized;
}

async function inspectPng(filePath, expected) {
  const buffer = await readFile(filePath);
  const metadata = await sharp(buffer).metadata();
  if (metadata.format !== "png") fail(`${filePath} is not PNG`);
  for (const key of ["width", "height", "channels", "hasAlpha"]) {
    if (metadata[key] !== expected[key]) fail(`${filePath} ${key} mismatch: expected ${expected[key]}, got ${metadata[key]}`);
  }
  const actualHash = sha256(buffer);
  if (actualHash !== expected.sha256) fail(`${filePath} sha256 mismatch`);
  return { bytes: buffer.length, ...metadata, sha256: actualHash };
}

function compositeRgbaInsideRoi(baseRaw, patchRaw, canvas, roi) {
  const output = Buffer.from(baseRaw);
  for (let localY = 0; localY < roi.height; localY += 1) {
    for (let localX = 0; localX < roi.width; localX += 1) {
      const sourceOffset = (localY * roi.width + localX) * 4;
      const targetOffset = ((roi.y + localY) * canvas.width + roi.x + localX) * 4;
      const sourceAlphaByte = patchRaw[sourceOffset + 3];
      if (sourceAlphaByte === 0) continue;
      const sourceAlpha = sourceAlphaByte / 255;
      const targetAlpha = output[targetOffset + 3] / 255;
      const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
      for (let channel = 0; channel < 3; channel += 1) {
        const numerator =
          patchRaw[sourceOffset + channel] * sourceAlpha +
          output[targetOffset + channel] * targetAlpha * (1 - sourceAlpha);
        output[targetOffset + channel] = outputAlpha === 0 ? 0 : Math.round(numerator / outputAlpha);
      }
      output[targetOffset + 3] = Math.round(outputAlpha * 255);
    }
  }
  return output;
}

function assertBox(box, label) {
  assertExactKeys(box, ["x", "y", "width", "height"], label);
  for (const key of ["x", "y", "width", "height"]) {
    if (!Number.isInteger(box[key]) || box[key] < 0) fail(`${label}.${key} must be a non-negative integer`);
  }
  if (box.width === 0 || box.height === 0) fail(`${label} must have positive dimensions`);
}

async function main() {
  const catalogPath = path.join(SCRIPT_DIR, "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  assertExactKeys(catalog, ["schemaVersion", "avatars"], "catalog");
  if (catalog.schemaVersion !== "avatar-catalog-v1" || !Array.isArray(catalog.avatars) || catalog.avatars.length !== 1) {
    fail("L1 catalog must contain exactly one avatar using avatar-catalog-v1");
  }
  const entry = catalog.avatars[0];
  assertExactKeys(entry, ["avatarId", "assetVersion", "status", "manifestPath", "bundleFingerprint"], "catalog.avatars[0]");
  const manifestRelative = assertSafeRelativePath(entry.manifestPath, "manifestPath");
  const manifestPath = path.resolve(SCRIPT_DIR, ...manifestRelative.split("/"));
  if (!manifestPath.startsWith(`${SCRIPT_DIR}${path.sep}`)) fail("manifestPath resolves outside avatar directory");

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assertExactKeys(manifest, [
    "schemaVersion", "avatarId", "displayName", "assetVersion", "status", "rights", "canvas", "anchor",
    "faceSafeBox", "mouthRoi", "base", "poses", "provenance", "bundleFingerprint",
  ], "manifest");
  if (manifest.schemaVersion !== "avatar-mouth-manifest-v1") fail("unexpected manifest schemaVersion");
  if (manifest.avatarId !== entry.avatarId || manifest.assetVersion !== entry.assetVersion || manifest.status !== entry.status) fail("catalog and manifest identity differ");
  if (manifest.bundleFingerprint !== entry.bundleFingerprint) fail("catalog and manifest fingerprint differ");
  assertExactKeys(manifest.rights, ["status", "confirmedAt", "scope"], "rights");
  if (manifest.rights.status !== "confirmed-by-user" || !Array.isArray(manifest.rights.scope)) fail("rights confirmation is missing");
  assertExactKeys(manifest.canvas, ["width", "height"], "canvas");
  assertExactKeys(manifest.anchor, ["x", "y"], "anchor");
  assertBox(manifest.faceSafeBox, "faceSafeBox");
  assertBox(manifest.mouthRoi, "mouthRoi");

  const { faceSafeBox, mouthRoi, canvas } = manifest;
  if (
    mouthRoi.x < faceSafeBox.x || mouthRoi.y < faceSafeBox.y ||
    mouthRoi.x + mouthRoi.width > faceSafeBox.x + faceSafeBox.width ||
    mouthRoi.y + mouthRoi.height > faceSafeBox.y + faceSafeBox.height
  ) fail("mouthRoi lies outside faceSafeBox");
  if (mouthRoi.x + mouthRoi.width > canvas.width || mouthRoi.y + mouthRoi.height > canvas.height) fail("mouthRoi lies outside canvas");

  assertExactKeys(manifest.base, ["path", "sha256", "width", "height", "channels", "hasAlpha"], "base");
  if (manifest.base.width !== canvas.width || manifest.base.height !== canvas.height) fail("base dimensions differ from canvas");
  const assetDir = path.dirname(manifestPath);
  const baseRelative = assertSafeRelativePath(manifest.base.path, "base.path");
  const basePath = path.resolve(assetDir, ...baseRelative.split("/"));
  const baseInfo = await inspectPng(basePath, manifest.base);
  const baseRaw = await sharp(basePath).ensureAlpha().raw().toBuffer();

  assertExactKeys(manifest.poses, POSES, "poses");
  const poseResults = {};
  for (const pose of POSES) {
    const record = manifest.poses[pose];
    assertExactKeys(record, ["path", "sha256", "width", "height", "channels", "hasAlpha", "openingLevel", "derivation"], `poses.${pose}`);
    const relative = assertSafeRelativePath(record.path, `poses.${pose}.path`);
    if (record.width !== mouthRoi.width || record.height !== mouthRoi.height) fail(`${pose} dimensions differ from mouthRoi`);
    if (record.hasAlpha !== true || record.channels !== 4) fail(`${pose} must be RGBA`);
    const posePath = path.resolve(assetDir, ...relative.split("/"));
    if (!posePath.startsWith(`${assetDir}${path.sep}`)) fail(`${pose} resolves outside asset directory`);
    const fileInfo = await inspectPng(posePath, record);

    const patchRaw = await sharp(posePath).ensureAlpha().raw().toBuffer();
    const composited = compositeRgbaInsideRoi(baseRaw, patchRaw, canvas, mouthRoi);
    let changedOutsideRoi = 0;
    let changedInsideRoi = 0;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const inside = x >= mouthRoi.x && x < mouthRoi.x + mouthRoi.width && y >= mouthRoi.y && y < mouthRoi.y + mouthRoi.height;
        const offset = (y * canvas.width + x) * 4;
        const changed =
          baseRaw[offset] !== composited[offset] || baseRaw[offset + 1] !== composited[offset + 1] ||
          baseRaw[offset + 2] !== composited[offset + 2] || baseRaw[offset + 3] !== composited[offset + 3];
        if (changed && inside) changedInsideRoi += 1;
        if (changed && !inside) changedOutsideRoi += 1;
      }
    }
    if (changedOutsideRoi !== 0) fail(`${pose} changes ${changedOutsideRoi} pixels outside mouthRoi`);
    if (pose === "CLOSED" && changedInsideRoi !== 0) fail("CLOSED must be a transparent no-op over the closed base");
    if (pose !== "CLOSED" && changedInsideRoi === 0) fail(`${pose} does not change any pixels inside mouthRoi`);
    poseResults[pose] = { bytes: fileInfo.bytes, changedInsideRoi, changedOutsideRoi };
  }

  assertExactKeys(manifest.provenance, [
    "baseSourcePath", "baseSourceSha256", "largeReferencePath", "largeReferenceSha256", "roundGenerator",
    "roundSourceSha256", "deterministicTransforms",
  ], "provenance");
  const { bundleFingerprint, ...withoutFingerprint } = manifest;
  const expectedFingerprint = sha256(Buffer.from(canonicalJson(withoutFingerprint)));
  if (bundleFingerprint !== expectedFingerprint) fail("bundleFingerprint is not deterministic or is stale");

  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    avatarId: manifest.avatarId,
    assetVersion: manifest.assetVersion,
    bundleFingerprint,
    base: { bytes: baseInfo.bytes, sha256: baseInfo.sha256 },
    mouthRoi,
    faceSafeBox,
    poses: poseResults,
    checks: {
      strictSchema: true,
      safeRelativePaths: true,
      pngDecodeDimensionsAlphaAndHash: true,
      roiInsideFaceSafeBox: true,
      compositedPixelsOutsideRoiByteIdentical: true,
      deterministicFingerprint: true,
    },
  }, null, 2)}\n`);
}

await main();
