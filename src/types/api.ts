export interface MockRequestOptions {
  signal?: AbortSignal;
  /**
   * 测试专用失败注入。未来替换真实接口时可删除，不影响业务参数。
   */
  fail?: boolean;
}

export interface UploadPresentationInput extends MockRequestOptions {
  file: File;
  onProgress?: (progress: number) => void;
}

export interface CreateProjectInput {
  title: string;
  uploadedFileId: string;
  fileName: string;
}

export interface UpdateProjectInput {
  title?: string;
}

export interface UpdateSlideScriptInput {
  teachingScript: string;
}
