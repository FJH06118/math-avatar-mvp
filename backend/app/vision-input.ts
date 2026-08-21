import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

import type { AgentInputImage } from "./agent-adapter.ts";
import { LocalAssetStore } from "./storage.ts";
import { WorkerError } from "./worker-error.ts";

interface VisionSourceAsset {
  storageKey: string;
  sha256: string;
  mimeType: string;
  fileSize: number;
  lifecycle: string;
}

export interface VisionSourceSlide {
  id: string;
  slideNumber: number;
  renderAsset: VisionSourceAsset | null;
}

interface EncodingProfile {
  width: number;
  height: number;
  quality: number;
  chromaSubsampling: "4:4:4" | "4:2:0";
}

const MAX_VISION_REQUEST_BYTES = 16 * 1024 * 1024;
const ENCODING_PROFILES: readonly EncodingProfile[] = [
  { width: 1_440, height: 810, quality: 88, chromaSubsampling: "4:4:4" },
  { width: 1_152, height: 648, quality: 82, chromaSubsampling: "4:4:4" },
  { width: 960, height: 540, quality: 76, chromaSubsampling: "4:2:0" },
  { width: 768, height: 432, quality: 70, chromaSubsampling: "4:2:0" },
];

export async function prepareVisionInputs(
  slides: readonly VisionSourceSlide[],
  assets: LocalAssetStore,
  signal: AbortSignal,
): Promise<Map<string, AgentInputImage>> {
  if (slides.length === 0 || slides.length > 100) {
    throw new WorkerError("AGENT_VISION_INPUT_INVALID", "多模态解析页数必须在 1～100 页之间。", false);
  }

  for (const profile of ENCODING_PROFILES) {
    const encoded = await encodeSlides(slides, assets, profile, signal);
    const requestBytes = encoded.reduce((total, image) => total + image.base64.length, 0);
    if (requestBytes <= MAX_VISION_REQUEST_BYTES) {
      return new Map(encoded.map((image) => [image.slideId, image]));
    }
  }

  throw new WorkerError(
    "AGENT_VISION_PAYLOAD_TOO_LARGE",
    "课件页面图像在安全压缩后仍超过多模态请求上限，请减少页面数量或压缩课件图片后重试。",
    false,
  );
}

async function encodeSlides(
  slides: readonly VisionSourceSlide[],
  assets: LocalAssetStore,
  profile: EncodingProfile,
  signal: AbortSignal,
): Promise<Array<AgentInputImage & { slideId: string }>> {
  const result: Array<AgentInputImage & { slideId: string }> = [];
  for (const slide of slides) {
    if (signal.aborted) throw signal.reason ?? new Error("Multimodal input preparation was aborted.");
    const asset = slide.renderAsset;
    if (!asset || asset.lifecycle !== "AVAILABLE" || asset.mimeType !== "image/png") {
      throw invalidPage(slide.slideNumber);
    }
    let source: Buffer;
    try {
      source = await readFile(assets.resolveForRead(asset.storageKey));
    } catch {
      throw invalidPage(slide.slideNumber);
    }
    if (
      source.byteLength !== asset.fileSize ||
      createHash("sha256").update(source).digest("hex") !== asset.sha256
    ) {
      throw invalidPage(slide.slideNumber);
    }

    try {
      const encoded = await sharp(source, { failOn: "error" })
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize(profile.width, profile.height, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({
          quality: profile.quality,
          chromaSubsampling: profile.chromaSubsampling,
          progressive: true,
          mozjpeg: true,
        })
        .toBuffer({ resolveWithObject: true });
      result.push({
        slideId: slide.id,
        ref: `slide-image-${String(slide.slideNumber).padStart(3, "0")}`,
        mimeType: "image/jpeg",
        base64: encoded.data.toString("base64"),
        sha256: createHash("sha256").update(encoded.data).digest("hex"),
        width: encoded.info.width,
        height: encoded.info.height,
      });
    } catch (error: unknown) {
      if (error instanceof WorkerError) throw error;
      throw invalidPage(slide.slideNumber);
    }
  }
  return result;
}

function invalidPage(slideNumber: number): WorkerError {
  return new WorkerError(
    "AGENT_VISION_SOURCE_INVALID",
    `第 ${slideNumber} 页原图无法安全读取或完整性校验失败。`,
    false,
  );
}
