import {
  AvatarSchema,
  CreateProjectInputSchema,
  JobSchema,
  ProjectSchema,
  RenderResultSchema,
  SlideSchema,
  TeachingSettingsSchema,
  UpdateProjectInputSchema,
  UpdateSlideScriptInputSchema,
  UploadedFileSchema,
  VoiceSchema,
  deriveParseReviewFlags,
  mergeReviewFlags,
} from "@ppt-digital-human/contracts";

export const parseProject = (value: unknown) => ProjectSchema.parse(value);
export const parseProjects = (value: unknown) =>
  ProjectSchema.array().parse(value);

function parseSlideWithReviewFlags(value: unknown) {
  const slide = SlideSchema.parse(value);
  return SlideSchema.parse({
    ...slide,
    reviewFlags: mergeReviewFlags(
      slide.reviewFlags,
      deriveParseReviewFlags({
        parseConfidence: slide.parseConfidence,
        parseWarnings: slide.parseWarnings,
        formulas: slide.formulas,
      }),
    ),
  });
}

export const parseSlide = (value: unknown) => parseSlideWithReviewFlags(value);
export const parseSlides = (value: unknown) =>
  SlideSchema.array().parse(value).map(parseSlideWithReviewFlags);
export const parseJob = (value: unknown) => JobSchema.parse(value);
export const parseUploadedFile = (value: unknown) =>
  UploadedFileSchema.parse(value);
export const parseRenderResult = (value: unknown) =>
  RenderResultSchema.parse(value);
export const parseAvatars = (value: unknown) => AvatarSchema.array().parse(value);
export const parseVoices = (value: unknown) => VoiceSchema.array().parse(value);

export const parseTeachingSettings = (value: unknown) =>
  TeachingSettingsSchema.parse(value);
export const parseCreateProjectInput = (value: unknown) =>
  CreateProjectInputSchema.parse(value);
export const parseUpdateProjectInput = (value: unknown) =>
  UpdateProjectInputSchema.parse(value);
export const parseUpdateSlideScriptInput = (value: unknown) =>
  UpdateSlideScriptInputSchema.parse(value);
