import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const ASSET_DIR = path.join(SCRIPT_DIR, "avatar-zhou");
const REVIEW_DIR = path.join(PROJECT_ROOT, "docs", "reviews");
const POSES = ["CLOSED", "SMALL", "MEDIUM", "LARGE", "ROUND"];

function labelSvg(label, width, height = 40) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f3f4f6" />
      <text x="${width / 2}" y="27" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#111827">${label}</text>
    </svg>
  `);
}

async function renderStrip(tiles, tileWidth, tileHeight, outputPath) {
  await sharp({
    create: {
      width: tileWidth * tiles.length,
      height: tileHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(tiles.map((input, index) => ({ input, left: index * tileWidth, top: 0 })))
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(ASSET_DIR, "manifest.json"), "utf8"));
  const basePath = path.join(ASSET_DIR, manifest.base.path);
  const faceTiles = [];
  const mouthTiles = [];

  for (const pose of POSES) {
    const patchPath = path.join(ASSET_DIR, ...manifest.poses[pose].path.split("/"));
    const fullImage = await sharp(basePath)
      .composite([{ input: patchPath, left: manifest.mouthRoi.x, top: manifest.mouthRoi.y }])
      .png()
      .toBuffer();
    const face = await sharp(fullImage).extract({
      left: manifest.faceSafeBox.x,
      top: manifest.faceSafeBox.y,
      width: manifest.faceSafeBox.width,
      height: manifest.faceSafeBox.height,
    }).png().toBuffer();
    const mouth = await sharp(fullImage).extract({
      left: manifest.mouthRoi.x,
      top: manifest.mouthRoi.y,
      width: manifest.mouthRoi.width,
      height: manifest.mouthRoi.height,
    }).resize(manifest.mouthRoi.width * 4, manifest.mouthRoi.height * 4, {
      fit: "fill",
      kernel: sharp.kernel.nearest,
    }).png().toBuffer();

    faceTiles.push(await sharp({
      create: {
        width: manifest.faceSafeBox.width,
        height: manifest.faceSafeBox.height + 40,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    }).composite([{ input: labelSvg(pose, manifest.faceSafeBox.width), left: 0, top: 0 }, { input: face, left: 0, top: 40 }]).png().toBuffer());

    mouthTiles.push(await sharp({
      create: {
        width: manifest.mouthRoi.width * 4,
        height: manifest.mouthRoi.height * 4 + 40,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    }).composite([{ input: labelSvg(pose, manifest.mouthRoi.width * 4), left: 0, top: 0 }, { input: mouth, left: 0, top: 40 }]).png().toBuffer());
  }

  await mkdir(REVIEW_DIR, { recursive: true });
  const preview100 = path.join(REVIEW_DIR, "LIP_SYNC_V1_L1_ASSET_PREVIEW_100.png");
  const preview400 = path.join(REVIEW_DIR, "LIP_SYNC_V1_L1_ASSET_PREVIEW_400.png");
  await renderStrip(faceTiles, manifest.faceSafeBox.width, manifest.faceSafeBox.height + 40, preview100);
  await renderStrip(mouthTiles, manifest.mouthRoi.width * 4, manifest.mouthRoi.height * 4 + 40, preview400);
  process.stdout.write(`${JSON.stringify({ preview100, preview400 }, null, 2)}\n`);
}

await main();
