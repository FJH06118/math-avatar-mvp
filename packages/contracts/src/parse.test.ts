import { describe, expect, it } from "vitest";
import { ParseAdapterDeckSchema } from "./index";

const slide = {
  index: 1,
  title: "第一页",
  type: "opening",
  textBlocks: [],
  extractedText: "",
  notes: "",
  formulas: [],
  thumbnail: "slides/slide-001.png",
};

const animationManifest = {
  schemaVersion: "animation-manifest-v1",
  id: `animation_manifest_${"1".repeat(64)}`,
  metadataSource: "STATIC_FALLBACK",
  parserVersion: "static-animation-fallback-v1",
  sourceFileSha256: "2".repeat(64),
  extractedAt: "2026-08-22T00:00:00Z",
  slideCount: 1,
  slides: [{
    id: `slide_animation_${"3".repeat(64)}`,
    slideNumber: 1,
    sequences: [],
    transition: null,
    effectCount: 0,
    supportAssessment: { levels: ["STATIC_FALLBACK"], summary: "该页只能静态处理。" },
    warnings: [{ code: "ANIMATION_METADATA_UNAVAILABLE", message: "动画元数据不可用。" }],
  }],
  supportAssessment: { levels: ["STATIC_FALLBACK"], summary: "课件只能静态处理。" },
  warnings: [{ code: "ANIMATION_METADATA_UNAVAILABLE", message: "动画元数据不可用。" }],
};

describe("parse adapter contract", () => {
  it("accepts a complete original-page result", () => {
    expect(
      ParseAdapterDeckSchema.safeParse({
        schemaVersion: 1,
        sourceFile: "source.pptx",
        courseTitle: "导数",
        slideCount: 1,
        parsedAt: "2026-08-03T00:00:00+00:00",
        slides: [slide],
        slideRenderer: "libreoffice",
        slideRenderError: null,
        animationManifest,
      }).success,
    ).toBe(true);
  });

  it("rejects render failures, missing pages and path traversal", () => {
    const base = {
      schemaVersion: 1,
      sourceFile: "source.pptx",
      courseTitle: "导数",
      slideCount: 1,
      parsedAt: "2026-08-03T00:00:00+00:00",
      slides: [slide],
      slideRenderer: "libreoffice",
      slideRenderError: null,
      animationManifest,
    };
    expect(ParseAdapterDeckSchema.safeParse({ ...base, slideRenderError: "failed" }).success).toBe(false);
    expect(ParseAdapterDeckSchema.safeParse({ ...base, slideCount: 2 }).success).toBe(false);
    expect(
      ParseAdapterDeckSchema.safeParse({
        ...base,
        slides: [{ ...slide, thumbnail: "../secret.png" }],
      }).success,
    ).toBe(false);
  });

  it("accepts a dense slide's three-digit formula candidate id", () => {
    expect(
      ParseAdapterDeckSchema.safeParse({
        schemaVersion: 1,
        sourceFile: "source.pptx",
        courseTitle: "公式密集课件",
        slideCount: 1,
        parsedAt: "2026-08-03T00:00:00+00:00",
        slides: [{
          ...slide,
          formulas: [{
            id: "slide-001-formula-100",
            source: "text",
            display: "f(x)=x",
            latex: "",
            spokenText: "函数 f 等于 x",
            status: "warning",
            message: "需要人工核对",
          }],
        }],
        slideRenderer: "libreoffice",
        slideRenderError: null,
        animationManifest,
      }).success,
    ).toBe(true);
  });
});
