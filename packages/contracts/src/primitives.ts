import { z } from "zod";

const stableIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;

/** Stable business IDs are opaque and must not be array indexes or paths. */
export const StableIdSchema = z
  .string()
  .regex(stableIdPattern, "必须是稳定的业务 ID")
  .refine((value) => /[A-Za-z_-]/.test(value), "不能只包含数字");

export type StableId = z.infer<typeof StableIdSchema>;

export const ProjectIdSchema = StableIdSchema;
export const PresentationIdSchema = StableIdSchema;
export const SlideIdSchema = StableIdSchema;
export const LessonPlanIdSchema = StableIdSchema;
export const RevisionIdSchema = StableIdSchema;
export const SceneIdSchema = StableIdSchema;
export const TaskIdSchema = StableIdSchema;
export const TaskStepIdSchema = StableIdSchema;
export const AssetIdSchema = StableIdSchema;

export const IsoDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/,
    "必须是 UTC ISO 8601 时间",
  )
  .refine((value) => !Number.isNaN(Date.parse(value)), "时间无效");

export const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "必须是小写十六进制 SHA-256");

export const NonNegativeIntSchema = z.number().int().min(0);
export const PositiveIntSchema = z.number().int().min(1);
export const ProgressSchema = z.number().min(0).max(100);

export const FileNameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !/[\\/]/.test(value), "文件名不能包含路径");

export const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "只允许受控 HTTP(S) 资源地址");

export const BoundsSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .strict()
  .superRefine((bounds, context) => {
    if (bounds.x + bounds.width > 1) {
      context.addIssue({
        code: "custom",
        path: ["width"],
        message: "区域不能超出页面右边界",
      });
    }
    if (bounds.y + bounds.height > 1) {
      context.addIssue({
        code: "custom",
        path: ["height"],
        message: "区域不能超出页面下边界",
      });
    }
  });

export type Bounds = z.infer<typeof BoundsSchema>;
