import { z } from "zod";

import {
  FileNameSchema,
  IsoDateTimeSchema,
  NonNegativeIntSchema,
  ProjectIdSchema,
  StableIdSchema,
} from "./primitives";
import { createApiSuccessSchema } from "./api";

export const ProjectStatusSchema = z.enum([
  "draft",
  "uploading",
  "parsing",
  "ready",
  "rendering",
  "completed",
  "failed",
  "archived",
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const CaptionStyleSchema = z.enum(["clear", "focus", "minimal"]);
export const AvatarPositionSchema = z.enum(["left", "right"]);
export const BackgroundStyleSchema = z.enum(["classroom", "light", "board"]);
export type CaptionStyle = z.infer<typeof CaptionStyleSchema>;
export type AvatarPosition = z.infer<typeof AvatarPositionSchema>;
export type BackgroundStyle = z.infer<typeof BackgroundStyleSchema>;

export const TeachingSettingsSchema = z
  .object({
    avatarId: StableIdSchema,
    voiceId: StableIdSchema,
    speechRate: z.number().min(0.5).max(2),
    captionsEnabled: z.boolean(),
    captionStyle: CaptionStyleSchema,
    avatarPosition: AvatarPositionSchema,
    background: BackgroundStyleSchema,
    slideOverrides: z
      .array(
        z
          .object({
            slideId: StableIdSchema,
            avatarPosition: z.enum(["left", "right", "hidden"]),
          })
          .strict(),
      )
      .max(100)
      .optional(),
  })
  .strict();

export const TeachingSettingsUpdateInputSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    settings: TeachingSettingsSchema,
  })
  .strict();

export const ProjectSchema = z
  .object({
    id: ProjectIdSchema,
    title: z.string().min(1).max(200),
    status: ProjectStatusSchema,
    fileName: FileNameSchema,
    slideCount: NonNegativeIntSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    uploadedFileId: StableIdSchema.optional(),
    parsingJobId: StableIdSchema.optional(),
    planTaskId: StableIdSchema.optional(),
    renderJobId: StableIdSchema.optional(),
    settings: TeachingSettingsSchema,
    version: z.number().int().min(1),
  })
  .strict();

export const UploadStatusSchema = z.enum([
  "selected",
  "uploading",
  "completed",
  "failed",
  "cancelled",
]);
export type UploadStatus = z.infer<typeof UploadStatusSchema>;

export const UploadedFileSchema = z
  .object({
    id: StableIdSchema,
    name: FileNameSchema,
    size: NonNegativeIntSchema,
    extension: z.enum([".ppt", ".pptx"]),
    mimeType: z.string().min(1).max(160),
    status: UploadStatusSchema,
    progress: z.number().min(0).max(100),
    uploadedAt: IsoDateTimeSchema.optional(),
  })
  .strict();

export const AvatarSchema = z
  .object({
    id: StableIdSchema,
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(500),
    imageUrl: z.string().min(1).optional(),
    genderPresentation: z.enum(["female", "male", "neutral"]),
  })
  .strict();

export const VoiceSchema = z
  .object({
    id: StableIdSchema,
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(500),
    locale: z.literal("zh-CN"),
    genderPresentation: z.enum(["female", "male", "neutral"]),
    previewUrl: z.string().min(1).optional(),
  })
  .strict();

export type Project = z.infer<typeof ProjectSchema>;
export type TeachingSettings = z.infer<typeof TeachingSettingsSchema>;
export type UploadedFile = z.infer<typeof UploadedFileSchema>;
export type Avatar = z.infer<typeof AvatarSchema>;
export type Voice = z.infer<typeof VoiceSchema>;

export const CreateProjectInputSchema = z
  .object({
    title: z.string().min(1).max(200),
    uploadedFileId: StableIdSchema,
    fileName: FileNameSchema,
  })
  .strict();

export const UpdateProjectInputSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
  })
  .strict();

export const ProjectListQuerySchema = z
  .object({
    search: z.string().trim().max(200).default(""),
    status: ProjectStatusSchema.optional(),
    includeArchived: z.boolean().default(false),
  })
  .strict();

export const ProjectCopyInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    idempotencyKey: StableIdSchema,
  })
  .strict();

export const ProjectVersionInputSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
  })
  .strict();

export const ProjectResponseSchema = createApiSuccessSchema(ProjectSchema);
export const ProjectListResponseSchema = createApiSuccessSchema(
  ProjectSchema.array(),
);
export const TeachingSettingsResponseSchema = createApiSuccessSchema(
  TeachingSettingsSchema,
);

export const UpdateSlideScriptInputSchema = z
  .object({
    teachingScript: z.string().min(1).max(20_000).optional(),
    displayText: z.string().min(1).max(20_000).optional(),
    spokenText: z.string().min(1).max(20_000).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const displayText = input.displayText ?? input.teachingScript;
    const spokenText = input.spokenText ?? input.teachingScript;
    if (!displayText) {
      context.addIssue({
        code: "custom",
        path: ["displayText"],
        message: "请填写字幕显示文本",
      });
    }
    if (!spokenText) {
      context.addIssue({
        code: "custom",
        path: ["spokenText"],
        message: "请填写朗读文本",
      });
    }
  });

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;
export type ProjectListQuery = z.infer<typeof ProjectListQuerySchema>;
export type ProjectCopyInput = z.infer<typeof ProjectCopyInputSchema>;
export type ProjectVersionInput = z.infer<typeof ProjectVersionInputSchema>;
export type UpdateSlideScriptInput = z.infer<
  typeof UpdateSlideScriptInputSchema
>;
