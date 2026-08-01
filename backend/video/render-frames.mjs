import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import {
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  escapeXml,
  loadReviewedJob,
  parseArgs,
  readJson,
  requireJobDir,
  wrapText,
} from "./common.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const { values } = parseArgs();
const jobDir = requireJobDir(values["job-dir"]);
const { deck, plan } = loadReviewedJob(jobDir, {
  allowUnreviewed: Boolean(values["allow-unreviewed"]),
});
const timeline = readJson(path.join(jobDir, "scene-timeline.json"));
if (timeline.scenes.length !== plan.scenes.length) {
  throw new Error("时间轴中的场景数与审核后的场景规划不一致");
}

const framesDir = path.join(jobDir, "video", "frames");
fs.mkdirSync(framesDir, { recursive: true });

function slideFallbackSvg(scene, slide) {
  const sourceText = (slide?.texts || [])
    .map((item) => item.text)
    .filter(Boolean)
    .join(" ");
  const lines = wrapText(sourceText || scene.title, 35).slice(0, 10);
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1500" height="844">
      <rect width="1500" height="844" fill="#f8fafc"/>
      <rect x="0" y="0" width="14" height="844" fill="#2563eb"/>
      <text x="70" y="105" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif"
            font-size="52" font-weight="700" fill="#0f172a">${escapeXml(scene.title)}</text>
      ${lines
        .map(
          (line, index) =>
            `<text x="72" y="${205 + index * 58}" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="34" fill="#334155">${escapeXml(line)}</text>`,
        )
        .join("")}
      <text x="72" y="790" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif"
            font-size="25" fill="#94a3b8">原幻灯片图像尚未渲染 · 第 ${scene.sourceSlides[0]} 页</text>
    </svg>
  `);
}

function chromeSvg(scene, index) {
  const titleLines = wrapText(scene.title, 13).slice(0, 4);
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#08111f"/>
          <stop offset="100%" stop-color="#13233b"/>
        </linearGradient>
      </defs>
      <rect width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" fill="url(#bg)"/>
      <rect x="34" y="104" width="1500" height="844" rx="18" fill="#ffffff"/>
      <rect x="1562" y="104" width="324" height="844" rx="18" fill="#162844" stroke="#2a4468" stroke-width="2"/>
      <circle cx="1590" cy="55" r="7" fill="#60a5fa"/>
      <text x="1610" y="64" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif"
            font-size="26" fill="#bfdbfe">${escapeXml(scene.section)}</text>
      <text x="34" y="65" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif"
            font-size="34" font-weight="700" fill="#f8fafc">${escapeXml(plan.courseTitle)}</text>
      ${titleLines
        .map(
          (line, lineIndex) =>
            `<text x="1592" y="${172 + lineIndex * 50}" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="32" font-weight="700" fill="#f8fafc">${escapeXml(line)}</text>`,
        )
        .join("")}
      <text x="1592" y="405" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif"
            font-size="23" fill="#93c5fd">来源页 ${scene.sourceSlides.join("、")}</text>
      <text x="1592" y="447" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif"
            font-size="21" fill="#94a3b8">${String(index + 1).padStart(2, "0")} / ${String(plan.scenes.length).padStart(2, "0")}</text>
      <rect x="34" y="979" width="${Math.round(
        ((index + 1) / plan.scenes.length) * 1852,
      )}" height="5" rx="3" fill="#60a5fa"/>
    </svg>
  `);
}

for (const [index, scene] of plan.scenes.entries()) {
  const sourceSlide = deck.slides.find(
    (slide) => slide.number === scene.sourceSlides[0],
  );
  const relativeImage = String(scene.slideImage || "").replaceAll("/", path.sep);
  const slidePath = path.join(jobDir, relativeImage);
  const slideInput = fs.existsSync(slidePath)
    ? slidePath
    : slideFallbackSvg(scene, sourceSlide);
  const slideBuffer = await sharp(slideInput)
    .resize(1500, 844, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  const framePath = path.join(
    framesDir,
    `${String(index + 1).padStart(3, "0")}-${scene.id}.png`,
  );
  await sharp(chromeSvg(scene, index))
    .composite([{ input: slideBuffer, left: 34, top: 104 }])
    .png({ compressionLevel: 8 })
    .toFile(framePath);
}

console.log(
  JSON.stringify({
    frameCount: plan.scenes.length,
    framesDir,
  }),
);

