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
      }).success,
    ).toBe(true);
  });
});
