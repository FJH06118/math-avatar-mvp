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
});
