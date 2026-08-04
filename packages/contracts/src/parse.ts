import { z } from "zod";

const ParsedTextBlockSchema = z
  .object({
    text: z.string().max(50_000),
    left: z.number().int(),
    top: z.number().int(),
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
  })
  .strict();

const ParsedFormulaCandidateSchema = z
  .object({
    id: z.string().regex(/^slide-\d{3}-formula-\d{2}$/),
    source: z.enum(["ooxml", "text"]),
    display: z.string().min(1).max(10_000),
    latex: z.string().max(10_000),
    spokenText: z.string().min(1).max(10_000),
    status: z.literal("warning"),
    message: z.string().min(1).max(1_000),
  })
  .strict();

export const ParseAdapterSlideSchema = z
  .object({
    index: z.number().int().min(1).max(100),
    title: z.string().min(1).max(500),
    type: z.string().min(1).max(100),
    textBlocks: z.array(ParsedTextBlockSchema).max(5_000),
    extractedText: z.string().max(200_000),
    notes: z.string().max(100_000),
    formulas: z.array(ParsedFormulaCandidateSchema).max(500),
    thumbnail: z.string().regex(/^slides\/slide-\d{3}\.png$/),
  })
  .strict();

export const ParseAdapterDeckSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceFile: z.literal("source.pptx"),
    courseTitle: z.string().min(1).max(500),
    slideCount: z.number().int().min(1).max(100),
    parsedAt: z.string().datetime({ offset: true }),
    slides: z.array(ParseAdapterSlideSchema).min(1).max(100),
    slideRenderer: z.enum(["libreoffice", "powerpoint"]),
    slideRenderError: z.null(),
  })
  .strict()
  .superRefine((deck, context) => {
    if (deck.slideCount !== deck.slides.length) {
      context.addIssue({
        code: "custom",
        path: ["slideCount"],
        message: "解析页数必须与页面数组一致",
      });
    }
    deck.slides.forEach((slide, index) => {
      if (slide.index !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["slides", index, "index"],
          message: "页面索引必须连续且从 1 开始",
        });
      }
      const expected = `slides/slide-${String(index + 1).padStart(3, "0")}.png`;
      if (slide.thumbnail !== expected) {
        context.addIssue({
          code: "custom",
          path: ["slides", index, "thumbnail"],
          message: "页面原图必须使用确定性文件名",
        });
      }
    });
  });

export type ParseAdapterDeck = z.infer<typeof ParseAdapterDeckSchema>;
export type ParseAdapterSlide = z.infer<typeof ParseAdapterSlideSchema>;
