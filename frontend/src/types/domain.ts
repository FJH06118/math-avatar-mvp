export type ProjectStatus =
  | "draft"
  | "uploading"
  | "parsing"
  | "ready"
  | "rendering"
  | "completed"
  | "failed";

export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  fileName: string;
  slideCount: number;
  createdAt: string;
  updatedAt: string;
  uploadedFileId?: string;
  parsingJobId?: string;
  renderJobId?: string;
  settings: TeachingSettings;
}

export type UploadStatus =
  | "selected"
  | "uploading"
  | "completed"
  | "failed"
  | "cancelled";

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  extension: ".ppt" | ".pptx";
  mimeType: string;
  status: UploadStatus;
  progress: number;
  uploadedAt?: string;
}

export type FormulaStatus = "valid" | "warning" | "error";

export interface Formula {
  id: string;
  latex: string;
  spokenText: string;
  status: FormulaStatus;
  message?: string;
}

export interface ParsedSlide {
  id: string;
  projectId: string;
  index: number;
  title: string;
  summary: string;
  extractedText: string;
  teachingScript: string;
  thumbnailUrl?: string;
  formulas: Formula[];
  updatedAt: string;
}

export interface Avatar {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  genderPresentation: "female" | "male" | "neutral";
}

export interface Voice {
  id: string;
  name: string;
  description: string;
  locale: "zh-CN";
  genderPresentation: "female" | "male" | "neutral";
  previewUrl?: string;
}

export type CaptionStyle = "clear" | "focus" | "minimal";
export type AvatarPosition = "left" | "right";
export type BackgroundStyle = "classroom" | "light" | "board";

export interface TeachingSettings {
  avatarId: string;
  voiceId: string;
  speechRate: number;
  captionsEnabled: boolean;
  captionStyle: CaptionStyle;
  avatarPosition: AvatarPosition;
  background: BackgroundStyle;
}

export type JobType = "parsing" | "rendering";
export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
export type JobStageStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export interface JobStage {
  id: string;
  label: string;
  description: string;
  status: JobStageStatus;
  progress: number;
}

export interface Job {
  id: string;
  projectId: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  currentStageId: string;
  stages: JobStage[];
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface RenderResult {
  id: string;
  projectId: string;
  jobId: string;
  title: string;
  videoUrl?: string;
  posterUrl?: string;
  captionTrackUrl?: string;
  mp4Url?: string;
  srtUrl?: string;
  durationSeconds: number;
  fileSizeBytes: number;
  resolution: "1920 × 1080";
  generatedAt: string;
  assetsAvailable: boolean;
}
