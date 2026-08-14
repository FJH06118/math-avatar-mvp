import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const AVATAR_DIR = path.join(SCRIPT_DIR, "avatar-zhou");
const MOUTH_DIR = path.join(AVATAR_DIR, "mouth");
const SOURCE_BASE = path.join(SCRIPT_DIR, "teacher-closed.png");
const SOURCE_LARGE = path.join(SCRIPT_DIR, "teacher-open.png");
const ROUND_SOURCE_FLAG = "--round-source";

const CANVAS = { width: 1254, height: 1254 };
const ANCHOR = { x: 627, y: 1254 };
const FACE_SAFE_BOX = { x: 500, y: 145, width: 350, height: 365 };
const MOUTH_ROI = { x: 590, y: 350, width: 190, height: 120 };
const POSE_ORDER = ["CLOSED", "SMALL", "MEDIUM", "LARGE", "ROUND"];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseRoundSource() {
  const index = process.argv.indexOf(ROUND_SOURCE_FLAG);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Usage: node ${path.basename(process.argv[1])} ${ROUND_SOURCE_FLAG} <png-path>`);
  }
  return path.resolve(process.argv[index + 1]);
}

async function extractPose(sourcePath, scaleY, profile = "speech") {
  const regionOffsetX = profile === "round" ? 48 : 38;
  const regionWidth = profile === "round" ? 94 : 114;
  const sourceRegion = { left: MOUTH_ROI.x + regionOffsetX, top: MOUTH_ROI.y + 27, width: regionWidth, height: 68 };
  const sourceHeight = Math.max(1, Math.round(sourceRegion.height * scaleY));
  const left = regionOffsetX;
  const top = Math.floor(62 - sourceHeight / 2);
  const extracted = await sharp(sourcePath)
    .extract(sourceRegion)
    .resize(sourceRegion.width, sourceHeight, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();

  const sourceMask = Buffer.from(`
    <svg width="${sourceRegion.width}" height="${sourceHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="feather">
          <stop offset="72%" stop-color="white" stop-opacity="1" />
          <stop offset="100%" stop-color="white" stop-opacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="${sourceRegion.width / 2}" cy="${sourceHeight / 2}" rx="${sourceRegion.width / 2}" ry="${sourceHeight / 2}" fill="url(#feather)" />
    </svg>
  `);
  const maskedSource = await sharp(extracted)
    .composite([{ input: sourceMask, blend: "dest-in" }])
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();

  const baseCrop = await sharp(SOURCE_BASE)
    .extract({
      left: MOUTH_ROI.x,
      top: MOUTH_ROI.y,
      width: MOUTH_ROI.width,
      height: MOUTH_ROI.height,
    })
    .ensureAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();

  return sharp(baseCrop)
    .composite([{ input: maskedSource, left, top }])
    .ensureAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

async function fileRecord(relativePath, buffer) {
  const metadata = await sharp(buffer).metadata();
  return {
    path: relativePath,
    sha256: sha256(buffer),
    width: metadata.width,
    height: metadata.height,
    channels: metadata.channels,
    hasAlpha: metadata.hasAlpha,
  };
}

async function main() {
  const roundSource = parseRoundSource();
  const [baseBuffer, largeSourceBuffer, roundSourceBuffer] = await Promise.all([
    readFile(SOURCE_BASE),
    readFile(SOURCE_LARGE),
    readFile(roundSource),
  ]);

  const [baseMeta, largeMeta, roundMeta] = await Promise.all([
    sharp(baseBuffer).metadata(),
    sharp(largeSourceBuffer).metadata(),
    sharp(roundSourceBuffer).metadata(),
  ]);
  for (const [label, metadata] of [
    ["base", baseMeta],
    ["large reference", largeMeta],
    ["round source", roundMeta],
  ]) {
    if (metadata.width !== CANVAS.width || metadata.height !== CANVAS.height) {
      throw new Error(`${label} must be ${CANVAS.width}x${CANVAS.height}`);
    }
  }

  await mkdir(MOUTH_DIR, { recursive: true });
  await writeFile(path.join(AVATAR_DIR, "base.png"), baseBuffer);

  const closedBuffer = await sharp({
    create: {
      width: MOUTH_ROI.width,
      height: MOUTH_ROI.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();

  const poseBuffers = {
    CLOSED: closedBuffer,
    SMALL: await extractPose(SOURCE_LARGE, 0.58),
    MEDIUM: await extractPose(SOURCE_LARGE, 0.78),
    LARGE: await extractPose(SOURCE_LARGE, 1),
    ROUND: await extractPose(roundSource, 1, "round"),
  };

  const poseDefinitions = {
    CLOSED: { file: "closed.png", openingLevel: 0, derivation: "transparent-no-op-over-closed-base" },
    SMALL: { file: "small.png", openingLevel: 0.33, derivation: "seam-safe-local-vertical-scale-0.58-from-large-reference" },
    MEDIUM: { file: "medium.png", openingLevel: 0.66, derivation: "seam-safe-local-vertical-scale-0.78-from-large-reference" },
    LARGE: { file: "large.png", openingLevel: 1, derivation: "seam-safe-local-existing-open-reference" },
    ROUND: { file: "round.png", openingLevel: 0.84, derivation: "seam-safe-local-imagegen-round-candidate" },
  };

  const poses = {};
  for (const pose of POSE_ORDER) {
    const definition = poseDefinitions[pose];
    const relativePath = `mouth/${definition.file}`;
    const buffer = poseBuffers[pose];
    await writeFile(path.join(AVATAR_DIR, ...relativePath.split("/")), buffer);
    poses[pose] = {
      ...(await fileRecord(relativePath, buffer)),
      openingLevel: definition.openingLevel,
      derivation: definition.derivation,
    };
  }

  const manifestWithoutFingerprint = {
    schemaVersion: "avatar-mouth-manifest-v1",
    avatarId: "avatar-zhou",
    displayName: "周老师",
    assetVersion: "mouth-v1",
    status: "asset-ready",
    rights: {
      status: "confirmed-by-user",
      confirmedAt: "2026-08-12",
      scope: ["project-use", "derived-mouth-poses"],
    },
    canvas: CANVAS,
    anchor: ANCHOR,
    faceSafeBox: FACE_SAFE_BOX,
    mouthRoi: MOUTH_ROI,
    base: await fileRecord("base.png", baseBuffer),
    poses,
    provenance: {
      baseSourcePath: "../teacher-closed.png",
      baseSourceSha256: sha256(baseBuffer),
      largeReferencePath: "../teacher-open.png",
      largeReferenceSha256: sha256(largeSourceBuffer),
      roundGenerator: "OpenAI built-in image generation",
      roundSourceSha256: sha256(roundSourceBuffer),
      deterministicTransforms: "sharp-base-backed-local-crop-scale-radial-alpha-mask-v2",
    },
  };
  const bundleFingerprint = sha256(Buffer.from(canonicalJson(manifestWithoutFingerprint)));
  const manifest = { ...manifestWithoutFingerprint, bundleFingerprint };
  await writeFile(path.join(AVATAR_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const catalog = {
    schemaVersion: "avatar-catalog-v1",
    avatars: [
      {
        avatarId: manifest.avatarId,
        assetVersion: manifest.assetVersion,
        status: manifest.status,
        manifestPath: "avatar-zhou/manifest.json",
        bundleFingerprint,
      },
    ],
  };
  await writeFile(path.join(SCRIPT_DIR, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);

  process.stdout.write(`${JSON.stringify({ avatarId: manifest.avatarId, bundleFingerprint, mouthRoi: MOUTH_ROI }, null, 2)}\n`);
}

await main();
