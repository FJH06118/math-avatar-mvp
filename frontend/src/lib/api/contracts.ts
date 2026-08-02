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
} from "@ppt-digital-human/contracts";

export const parseProject = (value: unknown) => ProjectSchema.parse(value);
export const parseProjects = (value: unknown) =>
  ProjectSchema.array().parse(value);
export const parseSlide = (value: unknown) => SlideSchema.parse(value);
export const parseSlides = (value: unknown) => SlideSchema.array().parse(value);
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
