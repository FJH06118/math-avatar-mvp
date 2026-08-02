import type { MockRequestOptions } from "./mock-request";

export type {
  CreateProjectInput,
  UpdateProjectInput,
  UpdateSlideScriptInput,
} from "@ppt-digital-human/contracts";

export type { MockRequestOptions };

export interface UploadPresentationInput extends MockRequestOptions {
  file: File;
  onProgress?: (progress: number) => void;
}
